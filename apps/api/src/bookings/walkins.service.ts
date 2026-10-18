import { Inject, Injectable } from '@nestjs/common';
import type { StaffActor } from '../../../../packages/contracts/src/core.js';
import type { StaffIntakeInput } from '../../../../packages/contracts/src/members.js';
import type { WalkinInput, WalkinResult } from '../../../../packages/contracts/src/bookings.js';
import { FieldCrypto } from '../crypto/field-crypto.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { bangkokDate } from '../common/bangkok.js';
import { Audit } from '../audit/audit.service.js';
import { Authorization } from '../authorization/authorization.service.js';
import { Attendance } from '../attendance/attendance.service.js';
import { Members } from '../members/members.service.js';
import { Questions } from '../questions/questions.service.js';
import { validateAnswers } from '../questions/question-validation.js';
import { Invites } from '../signup/invites.service.js';
import { Bookings, type Placement } from './bookings.service.js';
import { ACTIVE, RESERVING, registrationState, type PolicySession } from './booking-policy.js';
import { Queue } from './queue.service.js';
import { RunLock } from './run-lock.js';
import { reserved, waiting } from './pools.js';

const bad = (message: string, fields?: Record<string, string>) => new AppError(422, 'INVALID_INPUT', message, fields);
const reasonOk = (value: unknown): value is string => typeof value === 'string' && !!value.trim() && value.length <= 500;

/**
 * Same-day staff intake: member (new or existing), booking, capacity decision and today's attendance
 * all happen in one run-locked transaction, so nothing partial can survive a failure.
 */
@Injectable()
export class Walkins {
  /** Test seam: simulates a crash after the member was written, to prove the whole operation rolls back. */
  failAfterIntake = false;
  constructor(
    @Inject(Clock) private readonly clock: Clock,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(Audit) private readonly audit: Audit,
    @Inject(Authorization) private readonly authorization: Authorization,
    @Inject(RunLock) private readonly lock: RunLock,
    @Inject(Bookings) private readonly bookings: Bookings,
    @Inject(Queue) private readonly queue: Queue,
    @Inject(Members) private readonly members: Members,
    @Inject(Questions) private readonly questions: Questions,
    @Inject(Attendance) private readonly attendance: Attendance,
    @Inject(Invites) private readonly invites: Invites,
  ) {}

  async admit(actor: StaffActor, input: WalkinInput): Promise<WalkinResult> {
    if (!input || typeof input.runId !== 'string' || typeof input.currentSessionId !== 'string') throw bad('ข้อมูลไม่ถูกต้อง');
    if (!input.memberId === !input.member) throw bad('กรุณาเลือกสมาชิกเดิม หรือกรอกข้อมูลสมาชิกใหม่อย่างใดอย่างหนึ่ง');
    const key = this.bookings.opKey(actor, input.operationKey, 'walkin');
    return this.lock.withRun(actor.organizationId, input.runId, async (tx) => {
      const repeat = await tx.operationRecord.findUnique({ where: { organizationId_key: { organizationId: actor.organizationId, key } } });
      if (repeat) return repeat.result as WalkinResult;
      const organizationId = actor.organizationId;
      const run = await this.bookings.loadRun(tx, organizationId, input.runId);
      const current = run.sessions.find((s) => s.id === input.currentSessionId);
      if (!current) throw new AppError(404, 'NOT_FOUND', 'ไม่พบวันเรียน');
      if (current.status === 'cancelled') throw new AppError(409, 'SESSION_CANCELLED', 'วันเรียนนี้ถูกยกเลิกแล้ว รับลงทะเบียนหน้างานไม่ได้');
      const now = this.clock.now();
      if (current.date !== bangkokDate(now)) throw new AppError(422, 'NOT_TODAY', 'รับลงทะเบียนหน้างานได้เฉพาะวันเรียนของวันนี้');

      // Own and family records need another staff member; check before anything is written.
      if (input.memberId) {
        const existingMember = await this.bookings.loadMember(tx, actor, input.memberId);
        await this.authorization.assertCanReview(tx, actor, existingMember.id);
      }
      const poolIds = run.perSessionRegistration ? [...new Set([input.currentSessionId, ...(Array.isArray(input.sessionIds) ? input.sessionIds : [])])] : [];
      const pools = this.bookings.pools(run, run.perSessionRegistration ? poolIds : []);
      const questions = await this.questions.runQuestions(tx, organizationId, run.id);
      const answers = validateAnswers(questions, input.answers);

      let created = false;
      let memberId = input.memberId ?? '';
      if (input.member) {
        const record = await this.members.createPaper(tx, actor, input.member as unknown as StaffIntakeInput, 'walkin');
        memberId = record.id;
        created = true;
      }
      if (this.failAfterIntake) throw new Error('Injected failure after member intake');

      const existing = await this.bookings.existingFor(tx, organizationId, run.id, memberId);
      const currentPool = run.perSessionRegistration ? input.currentSessionId : null;
      const currentStatus = run.perSessionRegistration ? existing?.entries.find((e) => e.sessionId === currentPool)?.status : existing?.status;
      const reasons: Record<string, unknown> = {};
      const placements: Placement[] = [];
      const grown: Array<string | null> = [];

      if (currentStatus !== 'confirmed') {
        const needsSeat = !(RESERVING as readonly string[]).includes(currentStatus ?? '');
        if (needsSeat) {
          const poolRef = { runId: run.id, sessionId: currentPool };
          const capacity = this.bookings.poolCapacity(run, currentPool);
          const held = await reserved(tx, organizationId, poolRef);
          const state = registrationState(run, run.sessions as PolicySession[], currentPool ? (current as PolicySession) : null, now);
          if (state !== 'open') {
            if (!reasonOk(input.closedReason)) throw new AppError(422, 'CLOSED_REASON_REQUIRED', 'ปิดรับลงทะเบียนแล้ว กรุณาระบุเหตุผลที่รับลงทะเบียนหน้างาน', { closedReason: 'กรุณาระบุเหตุผล' });
            reasons['closed'] = input.closedReason.trim();
          }
          let others = await waiting(tx, organizationId, poolRef);
          if (currentStatus === 'waitlisted') others -= 1;
          if (held >= capacity) {
            const increase = input.capacityIncrease?.find((c) => (c.sessionId ?? null) === currentPool);
            if (!increase || !Number.isInteger(increase.newCapacity) || increase.newCapacity <= capacity || increase.newCapacity > 5000)
              throw new AppError(409, 'CAPACITY_REQUIRED', 'ที่นั่งเต็ม กรุณาเพิ่มจำนวนที่นั่งพร้อมเหตุผลก่อนรับลงทะเบียนหน้างาน');
            if (!reasonOk(increase.reason)) throw new AppError(422, 'INVALID_INPUT', 'กรุณาระบุเหตุผลที่เพิ่มที่นั่ง', { capacityReason: 'กรุณาระบุเหตุผล' });
            if (currentPool) await tx.courseSession.update({ where: { organizationId_id: { organizationId, id: currentPool } }, data: { capacity: increase.newCapacity } });
            else await tx.courseRun.update({ where: { organizationId_id: { organizationId, id: run.id } }, data: { capacity: increase.newCapacity } });
            reasons['capacity'] = { from: capacity, to: increase.newCapacity, reason: increase.reason.trim() };
            grown.push(currentPool);
          }
          if (others > 0) {
            if (!reasonOk(input.queueBypassReason)) throw new AppError(422, 'QUEUE_BYPASS_REASON_REQUIRED', 'มีผู้รอคิวอยู่ กรุณาระบุเหตุผลที่รับหน้างานก่อนผู้ที่รอ', { queueBypassReason: 'กรุณาระบุเหตุผล' });
            reasons['queueBypass'] = input.queueBypassReason.trim();
          }
        }
        placements.push({ sessionId: currentPool, status: 'confirmed', queueSeq: null });
      }
      // Other selected sessions follow the ordinary rules (and stay refused once their registration is closed).
      for (const id of pools) {
        if (id === currentPool) continue;
        const entry = existing?.entries.find((e) => e.sessionId === id);
        if (entry && ACTIVE.includes(entry.status as 'submitted')) continue;
        const session = run.sessions.find((s) => s.id === id) as PolicySession;
        if (registrationState(run, run.sessions as PolicySession[], session, now) !== 'open') { placements.push({ sessionId: id, status: 'refused', queueSeq: null }); continue; }
        placements.push(await this.bookings.place(tx, organizationId, run, id));
      }
      const saved = placements.length ? await this.bookings.persist(tx, actor, run, memberId, existing, placements, answers, questions, 'walkin', 'staff') : null;
      const registrationId = saved?.registrationId ?? existing!.id;
      const outcomes = saved?.outcomes ?? [{ sessionId: currentPool, status: 'confirmed' as const, queuePosition: null }];
      if (Object.keys(reasons).length)
        await tx.registrationEvent.create({ data: { organizationId, registrationId, sessionId: currentPool, kind: 'walkin', reasonEncrypted: this.crypto.encrypt(JSON.stringify(reasons)) as never, actorKind: 'user', actorId: actor.userId } });
      await this.attendance.markInTransaction(tx, actor, input.currentSessionId, memberId, 'present');
      // Remaining free seats follow the normal first-come rules and cutoff.
      for (const pool of grown) await this.queue.fill(tx, actor, run.id, pool, now);
      await this.bookings.notifyResult(tx, actor, memberId, registrationId, outcomes);
      let linkUrl: string | null = null;
      if (created) linkUrl = (await this.invites.issueInTx(tx, actor, 'link', memberId, {})).url;
      await this.audit.record(tx, actor, { action: 'registration.walkin', entity: 'registration', entityId: registrationId, fields: ['fields'] });
      const result: WalkinResult = { registrationId, outcomes, memberId, linkUrl, created };
      await this.bookings.remember(tx, actor, key, 'walkin', result);
      return result;
    });
  }
}
