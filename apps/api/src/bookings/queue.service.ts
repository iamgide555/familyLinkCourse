import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { Actor, StaffActor } from '../../../../packages/contracts/src/core.js';
import type { Tx } from '../database/prisma.service.js';
import { FieldCrypto } from '../crypto/field-crypto.js';
import { AppError } from '../common/errors.js';
import { Audit } from '../audit/audit.service.js';
import { Authorization } from '../authorization/authorization.service.js';
import { Outbox } from '../notifications/outbox.service.js';
import { promotionCutoff } from './booking-policy.js';
import { reserved } from './pools.js';

@Injectable()
export class Queue {
  constructor(
    @Inject(Audit) private readonly audit: Audit,
    @Inject(Outbox) private readonly outbox: Outbox,
    @Inject(Authorization) private readonly authorization: Authorization,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
  ) {}

  /** Fills free seats of one pool from its queue, first come first served. Caller holds the run lock. */
  async fill(tx: Tx, actor: Actor, runId: string, sessionId: string | null, now: Date): Promise<string[]> {
    const organizationId = actor.organizationId;
    const run = await tx.courseRun.findFirst({ where: { organizationId, id: runId, deletedAt: null }, include: { sessions: true } });
    if (!run || run.status === 'cancelled') return [];
    const session = sessionId ? run.sessions.find((s) => s.id === sessionId) ?? null : null;
    if (sessionId && (!session || session.status === 'cancelled')) return [];
    const cutoff = promotionCutoff(run, run.sessions, session);
    if (cutoff && now >= cutoff) return [];
    const capacity = (session ? session.capacity : run.capacity) ?? 0;
    const free = capacity - (await reserved(tx, organizationId, { runId, sessionId }));
    if (free <= 0) return [];
    const next = run.requireApproval ? 'submitted' : 'confirmed';
    const promoted: string[] = [];
    if (session) {
      const rows = await tx.registrationSession.findMany({ where: { organizationId, sessionId: session.id, status: 'waitlisted' }, orderBy: { queueSeq: 'asc' }, take: free, include: { registration: true } });
      for (const row of rows) {
        await tx.registrationSession.update({ where: { registrationId_sessionId: { registrationId: row.registrationId, sessionId: row.sessionId } }, data: { status: next, queueSeq: null } });
        await this.notify(tx, actor, row.registration.memberId, row.registrationId, [row.sessionId]);
        promoted.push(row.registrationId);
      }
    } else {
      const rows = await tx.registration.findMany({ where: { organizationId, runId, status: 'waitlisted' }, orderBy: { queueSeq: 'asc' }, take: free });
      for (const row of rows) {
        await tx.registration.update({ where: { organizationId_id: { organizationId, id: row.id } }, data: { status: next, queueSeq: null } });
        await this.notify(tx, actor, row.memberId, row.id, []);
        promoted.push(row.id);
      }
    }
    return promoted;
  }

  private async notify(tx: Tx, actor: Actor, memberId: string, registrationId: string, sessionIds: string[]): Promise<void> {
    await this.outbox.enqueue(tx, actor, { eventId: randomUUID(), kind: 'waitlist.promoted', recipient: { kind: 'member', memberId }, entityRefs: { registrationIds: [registrationId], sessionIds } });
    await this.audit.record(tx, actor, { action: 'registration.promote', entity: 'registration', entityId: registrationId, fields: ['fields'] });
  }

  /** After the cutoff a freed seat stays empty; staff promote by hand after calling the member. */
  async promoteManually(tx: Tx, actor: StaffActor, registrationId: string, sessionId: string | null, reason: unknown): Promise<void> {
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) throw new AppError(422, 'INVALID_INPUT', 'กรุณาระบุผลการติดต่อสมาชิก', { reason: 'กรุณาระบุผลการติดต่อสมาชิก' });
    const registration = await tx.registration.findFirst({ where: { organizationId: actor.organizationId, id: registrationId }, include: { run: { include: { sessions: true } } } });
    if (!registration) throw new AppError(404, 'NOT_FOUND', 'ไม่พบการลงทะเบียน');
    await this.authorization.assertCanReview(tx, actor, registration.memberId);
    const run = registration.run;
    if (run.status === 'cancelled') throw new AppError(409, 'RUN_CANCELLED', 'รอบนี้ถูกยกเลิกแล้ว');
    if (run.perSessionRegistration !== !!sessionId) throw new AppError(422, 'INVALID_INPUT', 'กรุณาระบุรอบให้ถูกต้อง');
    const session = sessionId ? run.sessions.find((s) => s.id === sessionId) ?? null : null;
    if (sessionId && (!session || session.status === 'cancelled')) throw new AppError(409, 'SESSION_CANCELLED', 'วันเรียนนี้ถูกยกเลิกแล้ว');
    const entry = session ? await tx.registrationSession.findUnique({ where: { registrationId_sessionId: { registrationId, sessionId: session.id } } }) : null;
    const status = session ? entry?.status : registration.status;
    if (status !== 'waitlisted') throw new AppError(409, 'NOT_WAITLISTED', 'สมาชิกคนนี้ไม่ได้อยู่ในคิวรอ');
    const capacity = (session ? session.capacity : run.capacity) ?? 0;
    if ((await reserved(tx, actor.organizationId, { runId: run.id, sessionId })) >= capacity) throw new AppError(409, 'NO_SEAT', 'ยังไม่มีที่นั่งว่าง');
    const next = run.requireApproval ? 'submitted' : 'confirmed';
    if (session) await tx.registrationSession.update({ where: { registrationId_sessionId: { registrationId, sessionId: session.id } }, data: { status: next, queueSeq: null } });
    else await tx.registration.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: registrationId } }, data: { status: next, queueSeq: null } });
    await tx.registrationEvent.create({ data: { organizationId: actor.organizationId, registrationId, sessionId: session?.id ?? null, kind: 'promote_manual', reasonEncrypted: this.crypto.encrypt(reason.trim()) as never, actorKind: 'user', actorId: actor.userId } });
    await this.notify(tx, actor, registration.memberId, registrationId, session ? [session.id] : []);
  }
}
