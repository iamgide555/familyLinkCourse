import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Actor, BookingStatus, MemberActor, StaffActor } from '../../../../packages/contracts/src/core.js';
import type { BookingInput, BookingResult, CancelInput, PoolOutcome } from '../../../../packages/contracts/src/bookings.js';
import type { Answers, QuestionDefinition } from '../../../../packages/contracts/src/questions.js';
import { PrismaService, type Tx } from '../database/prisma.service.js';
import { FieldCrypto } from '../crypto/field-crypto.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { Audit } from '../audit/audit.service.js';
import { Authorization } from '../authorization/authorization.service.js';
import { Outbox } from '../notifications/outbox.service.js';
import { Questions } from '../questions/questions.service.js';
import { validateAnswers } from '../questions/question-validation.js';
import { ACTIVE, registrationState, selfCancelDeadline, type PolicySession } from './booking-policy.js';
import { Queue } from './queue.service.js';
import { RunLock } from './run-lock.js';
import { nextQueueSeq, queuePosition, reserved, type PoolRef } from './pools.js';
import { Snapshots } from './snapshots.service.js';

type RunRow = NonNullable<Awaited<ReturnType<Tx['courseRun']['findFirst']>>> & { sessions: Array<NonNullable<Awaited<ReturnType<Tx['courseSession']['findFirst']>>>> };
export type Placement = { sessionId: string | null; status: BookingStatus | 'refused'; queueSeq: number | null };
const bad = (message: string, fields?: Record<string, string>) => new AppError(422, 'INVALID_INPUT', message, fields);
const PRIORITY: Record<string, number> = { confirmed: 3, submitted: 2, waitlisted: 1 };

@Injectable()
export class Bookings {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
    @Inject(Authorization) private readonly authorization: Authorization,
    @Inject(Outbox) private readonly outbox: Outbox,
    @Inject(Questions) private readonly questions: Questions,
    @Inject(RunLock) private readonly lock: RunLock,
    @Inject(Queue) private readonly queue: Queue,
    @Inject(Snapshots) private readonly snapshots: Snapshots,
  ) {}

  // ---- shared helpers (also used by walk-in intake) ------------------------------------------------------
  async loadRun(tx: Tx, organizationId: string, runId: string): Promise<RunRow> {
    const run = await tx.courseRun.findFirst({ where: { organizationId, id: runId, deletedAt: null }, include: { sessions: { orderBy: { startsAt: 'asc' } } } });
    if (!run) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรอบของคอร์ส');
    if (run.status === 'cancelled') throw new AppError(409, 'RUN_CANCELLED', 'รอบนี้ถูกยกเลิกแล้ว');
    return run as RunRow;
  }
  /** Members act only for their own LINE account's members; staff act for anyone in the organization. */
  async loadMember(tx: Tx, actor: StaffActor | MemberActor, memberId: string) {
    if (typeof memberId !== 'string') throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
    const member = await tx.member.findFirst({ where: { organizationId: actor.organizationId, id: memberId, deletedAt: null, ...(actor.kind === 'member' ? { lineAccountId: actor.lineAccountId } : {}) } });
    if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
    return member;
  }
  /** Distinct, existing, non-cancelled sessions of the run in per-session mode; none in whole-run mode. */
  pools(run: RunRow, sessionIds: unknown): Array<string | null> {
    if (!Array.isArray(sessionIds) || sessionIds.some((id) => typeof id !== 'string')) throw bad('รูปแบบวันเรียนไม่ถูกต้อง');
    if (!run.perSessionRegistration) {
      if (sessionIds.length) throw bad('รอบนี้ลงทะเบียนทั้งคอร์ส ไม่ต้องเลือกวันเรียน');
      return [null];
    }
    const unique = [...new Set(sessionIds as string[])];
    if (!unique.length) throw bad('กรุณาเลือกวันเรียนอย่างน้อย 1 วัน', { sessionIds: 'กรุณาเลือกวันเรียน' });
    return unique.map((id) => {
      const session = run.sessions.find((s) => s.id === id);
      if (!session) throw bad('ไม่พบวันเรียนที่เลือก');
      if (session.status === 'cancelled') throw new AppError(409, 'SESSION_CANCELLED', 'วันเรียนที่เลือกถูกยกเลิกแล้ว');
      return id;
    }).sort((a, b) => run.sessions.findIndex((s) => s.id === a) - run.sessions.findIndex((s) => s.id === b));
  }
  poolCapacity(run: RunRow, sessionId: string | null): number {
    return (sessionId ? run.sessions.find((s) => s.id === sessionId)?.capacity : run.capacity) ?? 0;
  }
  /** Seat outcome for one pool at this moment; reserves the queue slot when waiting. */
  async place(tx: Tx, organizationId: string, run: RunRow, sessionId: string | null): Promise<Placement> {
    const pool: PoolRef = { runId: run.id, sessionId };
    if ((await reserved(tx, organizationId, pool)) < this.poolCapacity(run, sessionId)) return { sessionId, status: run.requireApproval ? 'submitted' : 'confirmed', queueSeq: null };
    if (run.waitlistEnabled) return { sessionId, status: 'waitlisted', queueSeq: await nextQueueSeq(tx, organizationId, pool) };
    return { sessionId, status: 'refused', queueSeq: null };
  }
  async existingFor(tx: Tx, organizationId: string, runId: string, memberId: string) {
    return tx.registration.findUnique({ where: { runId_memberId: { runId, memberId } }, include: { entries: true } });
  }
  /** Stores placements, appends one snapshot for the saved ones and locks the run's structure. */
  async persist(tx: Tx, actor: Actor, run: RunRow, memberId: string, existing: Awaited<ReturnType<Bookings['existingFor']>>, placements: Placement[], answers: Answers, questions: QuestionDefinition[], source: string, registeredBy: string): Promise<{ registrationId: string; outcomes: PoolOutcome[] } | null> {
    const saved = placements.filter((p) => p.status !== 'refused');
    if (!saved.length) return null;
    const organizationId = actor.organizationId;
    const whole = !run.perSessionRegistration;
    const createdBy = actor.kind === 'staff' ? `staff:${actor.userId}` : actor.kind === 'member' ? 'member' : 'system';
    const registrationId = existing?.id ?? randomUUID();
    if (!existing)
      await tx.registration.create({ data: { id: registrationId, organizationId, runId: run.id, memberId, status: null, source, registeredBy } });
    const snap = await this.snapshots.create(tx, organizationId, registrationId, memberId, questions, answers, createdBy);
    if (whole) {
      const p = saved[0]!;
      await tx.registration.update({ where: { organizationId_id: { organizationId, id: registrationId } }, data: { status: p.status, queueSeq: p.queueSeq, snapshotId: snap.id, cancelledAt: null, cancelReason: null, source, registeredBy } });
    } else {
      for (const p of saved) {
        const data = { status: p.status as string, queueSeq: p.queueSeq, snapshotId: snap.id, cancelledAt: null, cancelReason: null };
        await tx.registrationSession.upsert({ where: { registrationId_sessionId: { registrationId, sessionId: p.sessionId! } }, create: { organizationId, registrationId, sessionId: p.sessionId!, ...data }, update: data });
      }
    }
    if (!run.structureLocked) await tx.courseRun.update({ where: { organizationId_id: { organizationId, id: run.id } }, data: { structureLocked: true } });
    const outcomes: PoolOutcome[] = [];
    for (const p of placements)
      outcomes.push({ sessionId: p.sessionId, status: p.status, queuePosition: p.status === 'waitlisted' && p.queueSeq ? await queuePosition(tx, organizationId, { runId: run.id, sessionId: p.sessionId }, p.queueSeq) : null });
    return { registrationId, outcomes };
  }
  async notifyResult(tx: Tx, actor: Actor, memberId: string, registrationId: string, outcomes: PoolOutcome[]): Promise<void> {
    // Staff who register someone by phone or at the desk are with that person already. With no LINE and no email there
    // is nobody to message, and a follow-up task would only repeat what staff just did.
    if (actor.kind === 'staff') {
      const m = await tx.member.findFirst({ where: { organizationId: actor.organizationId, id: memberId }, select: { lineAccountId: true, email: true } });
      if (!m?.lineAccountId && !m?.email.trim()) return;
    }
    const best = outcomes.filter((o) => o.status !== 'refused').sort((a, b) => PRIORITY[b.status]! - PRIORITY[a.status]!)[0];
    if (!best) return;
    await this.outbox.enqueue(tx, actor, { eventId: randomUUID(), kind: `registration.${best.status}` as 'registration.confirmed', recipient: { kind: 'member', memberId }, entityRefs: { registrationIds: [registrationId], sessionIds: outcomes.filter((o) => o.sessionId && o.status !== 'refused').map((o) => o.sessionId!) } });
  }
  async remembered(tx: Tx, actor: Actor, key: string): Promise<BookingResult | null> {
    const row = await tx.operationRecord.findUnique({ where: { organizationId_key: { organizationId: actor.organizationId, key } } });
    return row ? (row.result as BookingResult) : null;
  }
  async remember(tx: Tx, actor: Actor, key: string, kind: string, result: unknown): Promise<void> {
    await tx.operationRecord.create({ data: { organizationId: actor.organizationId, key, kind, result: result as never } });
  }
  opKey(actor: Actor, operationKey: unknown, kind: string): string {
    if (typeof operationKey !== 'string' || operationKey.length < 8 || operationKey.length > 100) throw bad('ไม่พบรหัสป้องกันการส่งซ้ำ กรุณาโหลดหน้าใหม่แล้วลองอีกครั้ง');
    return `${kind}:${actor.kind === 'staff' ? actor.userId : actor.kind === 'member' ? actor.lineAccountId : 'system'}:${operationKey}`;
  }

  // ---- register ------------------------------------------------------------------------------------------
  async register(actor: StaffActor | MemberActor, input: BookingInput): Promise<BookingResult> {
    if (!input || typeof input.runId !== 'string') throw bad('ข้อมูลไม่ถูกต้อง');
    const key = this.opKey(actor, input.operationKey, 'register');
    return this.lock.withRun(actor.organizationId, input.runId, async (tx) => {
      const repeat = await this.remembered(tx, actor, key);
      if (repeat) return repeat;
      const result = await this.registerLocked(tx, actor, input);
      await this.remember(tx, actor, key, 'register', result);
      return result;
    });
  }

  /** The caller holds the run lock. */
  async registerLocked(tx: Tx, actor: StaffActor | MemberActor, input: BookingInput): Promise<BookingResult> {
    const organizationId = actor.organizationId;
    const run = await this.loadRun(tx, organizationId, input.runId);
    const member = await this.loadMember(tx, actor, input.memberId);
    const pools = this.pools(run, input.sessionIds);
    const now = this.clock.now();
    const state = pools.map((id) => registrationState(run, run.sessions as PolicySession[], id ? (run.sessions.find((s) => s.id === id) as PolicySession) : null, now));
    if (state.includes('not_open')) throw new AppError(409, 'REGISTRATION_NOT_OPEN', 'ยังไม่เปิดรับลงทะเบียน');
    if (state.includes('closed')) throw new AppError(409, 'REGISTRATION_CLOSED', 'ปิดรับลงทะเบียนแล้ว กรุณาติดต่อเจ้าหน้าที่');
    const questions = await this.questions.runQuestions(tx, organizationId, run.id);
    const answers = validateAnswers(questions, input.answers);
    const existing = await this.existingFor(tx, organizationId, run.id, member.id);
    const mayRejoin = (status: string | null | undefined) => {
      if (status === 'rejected' && actor.kind === 'member') throw new AppError(409, 'REGISTRATION_REJECTED', 'เจ้าหน้าที่ไม่อนุมัติการลงทะเบียนนี้ กรุณาติดต่อเจ้าหน้าที่');
      return !status || status === 'cancelled' || status === 'rejected';
    };
    if (existing) {
      if (!run.perSessionRegistration) {
        if (!mayRejoin(existing.status)) throw new AppError(409, 'ALREADY_REGISTERED', 'ลงทะเบียนรอบนี้แล้ว');
      } else {
        for (const id of pools) {
          const entry = existing.entries.find((e) => e.sessionId === id);
          if (entry && !mayRejoin(entry.status)) throw new AppError(409, 'ALREADY_REGISTERED', 'ลงทะเบียนวันเรียนนี้แล้ว');
        }
      }
    }
    const placements: Placement[] = [];
    for (const id of pools) placements.push(await this.place(tx, organizationId, run, id));
    const source = actor.kind === 'staff' ? 'staff' : 'member';
    const saved = await this.persist(tx, actor, run, member.id, existing, placements, answers, questions, source, source);
    if (!saved) throw new AppError(409, 'RUN_FULL', 'ที่นั่งเต็มและไม่มีคิวรอ', { outcomes: JSON.stringify(placements.map((p) => ({ sessionId: p.sessionId, status: p.status }))) });
    await this.notifyResult(tx, actor, member.id, saved.registrationId, saved.outcomes);
    await this.audit.record(tx, actor, { action: existing ? 'registration.rejoin' : 'registration.create', entity: 'registration', entityId: saved.registrationId, fields: ['fields'] });
    return { registrationId: saved.registrationId, outcomes: saved.outcomes };
  }

  // ---- approve / reject ----------------------------------------------------------------------------------
  async review(actor: StaffActor, registrationId: string, sessionIds: string[], approve: boolean): Promise<{ status: string }> {
    if (typeof approve !== 'boolean') throw bad('กรุณาเลือกผลการตรวจสอบ');
    const target = await this.db.registration.findFirst({ where: { organizationId: actor.organizationId, id: registrationId }, select: { runId: true } });
    if (!target) throw new AppError(404, 'NOT_FOUND', 'ไม่พบการลงทะเบียน');
    return this.lock.withRun(actor.organizationId, target.runId, async (tx) => {
      const registration = await tx.registration.findFirstOrThrow({ where: { organizationId: actor.organizationId, id: registrationId }, include: { run: true, entries: true } });
      await this.authorization.assertCanReview(tx, actor, registration.memberId);
      const run = registration.run;
      if (run.status === 'cancelled') throw new AppError(409, 'RUN_CANCELLED', 'รอบนี้ถูกยกเลิกแล้ว');
      const next = approve ? 'confirmed' : 'rejected';
      const touched: Array<string | null> = [];
      if (!run.perSessionRegistration) {
        if (sessionIds.length) throw bad('รอบนี้ไม่ได้ลงทะเบียนรายวัน');
        if (registration.status !== 'submitted') throw new AppError(409, 'NOT_PENDING', 'รายการนี้ไม่ได้รอตรวจสอบ');
        await tx.registration.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: registrationId } }, data: { status: next, ...(approve ? {} : { queueSeq: null }) } });
        touched.push(null);
      } else {
        const wanted = [...new Set(sessionIds)];
        if (!wanted.length) throw bad('กรุณาเลือกวันเรียนที่ต้องการตรวจสอบ');
        for (const id of wanted) {
          const entry = registration.entries.find((e) => e.sessionId === id);
          if (!entry || entry.status !== 'submitted') throw new AppError(409, 'NOT_PENDING', 'วันเรียนที่เลือกไม่ได้รอตรวจสอบ');
        }
        for (const id of wanted) { await tx.registrationSession.update({ where: { registrationId_sessionId: { registrationId, sessionId: id } }, data: { status: next } }); touched.push(id); }
      }
      if (!approve) for (const id of touched) await this.queue.fill(tx, actor, run.id, id, this.clock.now());
      await this.outbox.enqueue(tx, actor, { eventId: randomUUID(), kind: approve ? 'registration.approved' : 'registration.rejected', recipient: { kind: 'member', memberId: registration.memberId }, entityRefs: { registrationIds: [registrationId], sessionIds: touched.filter((x): x is string => !!x) } });
      await this.audit.record(tx, actor, { action: approve ? 'registration.approve' : 'registration.reject', entity: 'registration', entityId: registrationId, fields: ['status'] });
      return { status: next };
    });
  }

  // ---- cancel --------------------------------------------------------------------------------------------
  async cancel(actor: StaffActor | MemberActor, input: CancelInput): Promise<{ cancelled: string[] }> {
    if (!input || typeof input.registrationId !== 'string') throw bad('ข้อมูลไม่ถูกต้อง');
    const key = this.opKey(actor, input.operationKey, 'cancel');
    const target = await this.db.registration.findFirst({ where: { organizationId: actor.organizationId, id: input.registrationId }, select: { runId: true, memberId: true } });
    if (!target) throw new AppError(404, 'NOT_FOUND', 'ไม่พบการลงทะเบียน');
    return this.lock.withRun(actor.organizationId, target.runId, async (tx) => {
      const repeat = await tx.operationRecord.findUnique({ where: { organizationId_key: { organizationId: actor.organizationId, key } } });
      if (repeat) return repeat.result as { cancelled: string[] };
      const registration = await tx.registration.findFirstOrThrow({ where: { organizationId: actor.organizationId, id: input.registrationId }, include: { run: { include: { sessions: true } }, entries: true } });
      if (actor.kind === 'member') await this.loadMember(tx, actor, registration.memberId);
      else {
        if (typeof input.reason !== 'string' || !input.reason.trim() || input.reason.length > 500) throw bad('กรุณาระบุเหตุผลที่ยกเลิก', { reason: 'กรุณาระบุเหตุผล' });
      }
      const run = registration.run;
      if (run.status === 'cancelled') throw new AppError(409, 'RUN_CANCELLED', 'รอบนี้ถูกยกเลิกแล้ว');
      const now = this.clock.now();
      const reason = actor.kind === 'member' ? 'member' : 'staff';
      const policySessions = run.sessions as PolicySession[];
      const cancelled: string[] = [];
      const pools: Array<string | null> = [];
      const memberCheck = (deadline: Date | null) => {
        if (actor.kind === 'member' && (!deadline || now >= deadline)) throw new AppError(403, 'CANCEL_DEADLINE_PASSED', 'เลยกำหนดยกเลิกด้วยตนเองแล้ว ติดต่อเจ้าหน้าที่เพื่อยกเลิก');
      };
      if (!run.perSessionRegistration) {
        if (input.sessionIds?.length) throw bad('รอบนี้ไม่ได้ลงทะเบียนรายวัน');
        if (!ACTIVE.includes(registration.status as 'submitted')) throw new AppError(409, 'NOT_ACTIVE', 'การลงทะเบียนนี้ถูกยกเลิกหรือไม่มีผลแล้ว');
        memberCheck(selfCancelDeadline(run, policySessions, null));
        await tx.registration.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: registration.id } }, data: { status: 'cancelled', cancelReason: reason, cancelledAt: now, queueSeq: null } });
        pools.push(null);
        cancelled.push(registration.id);
      } else {
        const wanted = [...new Set(input.sessionIds ?? [])];
        if (!wanted.length) throw bad('กรุณาเลือกวันเรียนที่ต้องการยกเลิก');
        for (const id of wanted) {
          const entry = registration.entries.find((e) => e.sessionId === id);
          if (!entry || !ACTIVE.includes(entry.status as 'submitted')) throw new AppError(409, 'NOT_ACTIVE', 'วันเรียนที่เลือกถูกยกเลิกหรือไม่มีผลแล้ว');
          memberCheck(selfCancelDeadline(run, policySessions, policySessions.find((s) => s.id === id) ?? null));
        }
        for (const id of wanted) {
          await tx.registrationSession.update({ where: { registrationId_sessionId: { registrationId: registration.id, sessionId: id } }, data: { status: 'cancelled', cancelReason: reason, cancelledAt: now, queueSeq: null } });
          pools.push(id);
          cancelled.push(id);
        }
      }
      if (actor.kind === 'staff')
        await tx.registrationEvent.create({ data: { organizationId: actor.organizationId, registrationId: registration.id, sessionId: pools.length === 1 ? pools[0] : null, kind: 'cancel_staff', reasonEncrypted: this.crypto.encrypt(input.reason.trim()) as never, actorKind: 'user', actorId: actor.userId } });
      for (const id of pools) await this.queue.fill(tx, actor, run.id, id, now);
      await this.audit.record(tx, actor, { action: 'registration.cancel', entity: 'registration', entityId: registration.id, fields: ['status'] });
      const result = { cancelled };
      await tx.operationRecord.create({ data: { organizationId: actor.organizationId, key, kind: 'cancel', result } });
      return result;
    });
  }

  async promoteManually(actor: StaffActor, registrationId: string, sessionId: string | null, reason: unknown): Promise<{ promoted: true }> {
    const target = await this.db.registration.findFirst({ where: { organizationId: actor.organizationId, id: registrationId }, select: { runId: true } });
    if (!target) throw new AppError(404, 'NOT_FOUND', 'ไม่พบการลงทะเบียน');
    return this.lock.withRun(actor.organizationId, target.runId, async (tx) => {
      await this.queue.promoteManually(tx, actor, registrationId, sessionId, reason);
      return { promoted: true as const };
    });
  }
}
