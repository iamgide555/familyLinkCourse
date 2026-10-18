import type { Tx } from '../database/prisma.service.js';
import { RESERVING } from './booking-policy.js';

/** A seat pool is the whole run, or one session in per-session mode. */
export type PoolRef = { runId: string; sessionId: string | null };
export async function reserved(tx: Tx, organizationId: string, pool: PoolRef): Promise<number> {
  return pool.sessionId
    ? tx.registrationSession.count({ where: { organizationId, sessionId: pool.sessionId, status: { in: [...RESERVING] } } })
    : tx.registration.count({ where: { organizationId, runId: pool.runId, status: { in: [...RESERVING] } } });
}
export async function waiting(tx: Tx, organizationId: string, pool: PoolRef): Promise<number> {
  return pool.sessionId
    ? tx.registrationSession.count({ where: { organizationId, sessionId: pool.sessionId, status: 'waitlisted' } })
    : tx.registration.count({ where: { organizationId, runId: pool.runId, status: 'waitlisted' } });
}
export async function nextQueueSeq(tx: Tx, organizationId: string, pool: PoolRef): Promise<number> {
  if (pool.sessionId) {
    const row = await tx.courseSession.update({ where: { organizationId_id: { organizationId, id: pool.sessionId } }, data: { queueCounter: { increment: 1 } }, select: { queueCounter: true } });
    return row.queueCounter;
  }
  const row = await tx.courseRun.update({ where: { organizationId_id: { organizationId, id: pool.runId } }, data: { queueCounter: { increment: 1 } }, select: { queueCounter: true } });
  return row.queueCounter;
}
/** 1-based position among waiting entries of the pool, in arrival order. */
export async function queuePosition(tx: Tx, organizationId: string, pool: PoolRef, seq: number): Promise<number> {
  return pool.sessionId
    ? tx.registrationSession.count({ where: { organizationId, sessionId: pool.sessionId, status: 'waitlisted', queueSeq: { lte: seq } } })
    : tx.registration.count({ where: { organizationId, runId: pool.runId, status: 'waitlisted', queueSeq: { lte: seq } } });
}
