import { DAY_MS } from '../common/bangkok.js';

export type PolicyRun = {
  requireApproval: boolean; waitlistEnabled: boolean; perSessionRegistration: boolean; capacity: number | null;
  registrationOpensAt: Date | null; registrationClosesAt: Date | null; cancelDeadlineDays: number; status: string;
};
export type PolicySession = { id: string; startsAt: Date; status: string; capacity: number | null; cancelDeadlineOverride: Date | null };

const live = (sessions: PolicySession[]) => sessions.filter((s) => s.status !== 'cancelled');
function firstStart(sessions: PolicySession[]): Date | null {
  const pool = live(sessions).length ? live(sessions) : sessions;
  return pool.length ? new Date(Math.min(...pool.map((s) => s.startsAt.getTime()))) : null;
}

/**
 * Registration and automatic promotion end at the explicit close time. Without one, a pool ends one day before
 * its own session (per-session mode) or before the earliest non-cancelled session of the run (whole-run mode).
 */
export function promotionCutoff(run: PolicyRun, sessions: PolicySession[], session: PolicySession | null): Date | null {
  if (run.registrationClosesAt) return run.registrationClosesAt;
  const start = run.perSessionRegistration && session ? session.startsAt : firstStart(sessions);
  return start ? new Date(start.getTime() - DAY_MS) : null;
}
export const registrationCloses = promotionCutoff;

export type OpenState = 'open' | 'not_open' | 'closed';
export function registrationState(run: PolicyRun, sessions: PolicySession[], session: PolicySession | null, now: Date): OpenState {
  if (run.registrationOpensAt && now < run.registrationOpensAt) return 'not_open';
  const closes = registrationCloses(run, sessions, session);
  return closes && now >= closes ? 'closed' : 'open';
}

/** One deadline per run, counted from the first session; rescheduling can extend it for the changed session. */
export function selfCancelDeadline(run: PolicyRun, sessions: PolicySession[], changedSession: PolicySession | null): Date | null {
  const first = firstStart(sessions);
  if (!first) return null;
  const base = new Date(first.getTime() - run.cancelDeadlineDays * DAY_MS);
  // A rescheduled session keeps whichever is later: the run-wide deadline or its extended window.
  if (changedSession) return new Date(Math.max(base.getTime(), changedSession.cancelDeadlineOverride?.getTime() ?? 0));
  const overrides = live(sessions).map((s) => s.cancelDeadlineOverride?.getTime() ?? 0);
  return new Date(Math.max(base.getTime(), ...overrides));
}
/** min(max(existing, changedAt + 7 days), new start of the affected session). */
export function rescheduleDeadline(existing: Date | null, changedAt: Date, newStart: Date): Date {
  const extended = Math.max(existing?.getTime() ?? 0, changedAt.getTime() + 7 * DAY_MS);
  return new Date(Math.min(extended, newStart.getTime()));
}
export const ACTIVE = ['submitted', 'confirmed', 'waitlisted'] as const;
export const RESERVING = ['submitted', 'confirmed'] as const;
