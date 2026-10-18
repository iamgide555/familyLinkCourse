import { Inject, Injectable } from '@nestjs/common';
import type { StaffActor } from '../../../../packages/contracts/src/core.js';
import type { DashboardRun, DashboardSession, DashboardSummary } from '../../../../packages/contracts/src/reports.js';
import { PrismaService } from '../database/prisma.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { bangkokDate, isDate } from '../common/bangkok.js';

const addDays = (date: string, n: number) => new Date(new Date(`${date}T00:00:00.000Z`).getTime() + n * 86400000).toISOString().slice(0, 10);

@Injectable()
export class Dashboard {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
  ) {}
  /** Reservations (seats held) are counted separately from attendance (people who actually came). */
  async summary(actor: StaffActor, range: { from?: string; to?: string } = {}): Promise<DashboardSummary> {
    const today = bangkokDate(this.clock.now());
    const from = range.from ?? today;
    if (!isDate(from)) throw new AppError(422, 'INVALID_INPUT', 'ช่วงวันที่ไม่ถูกต้อง');
    const to = range.to ?? addDays(from, 6);
    if (!isDate(to) || to < from || (new Date(to).getTime() - new Date(from).getTime()) / 86400000 > 92) throw new AppError(422, 'INVALID_INPUT', 'ช่วงวันที่ไม่ถูกต้อง (ไม่เกิน 3 เดือน)');
    const org = actor.organizationId;
    const [signupRequests, profileChanges, failedNotices] = await Promise.all([
      this.db.signupRequest.count({ where: { organizationId: org, status: 'pending' } }),
      this.db.profileChangeRequest.count({ where: { organizationId: org, status: 'pending' } }),
      this.db.notification.count({ where: { organizationId: org, status: { in: ['failed', 'staff_followup'] } } }),
    ]);
    const runs = await this.db.courseRun.findMany({ where: { organizationId: org, deletedAt: null, status: 'active', sessions: { some: { date: { gte: today } } } }, include: { course: true, sessions: { orderBy: { startsAt: 'asc' } } }, orderBy: { createdAt: 'desc' } });
    const runIds = runs.map((r) => r.id);
    const wholeCounts = await this.db.registration.groupBy({ by: ['runId', 'status'], where: { organizationId: org, runId: { in: runIds }, status: { in: ['submitted', 'confirmed', 'waitlisted'] } }, _count: true });
    const perRun = new Map<string, { confirmed: number; submitted: number; waitlisted: number }>();
    for (const r of runs) perRun.set(r.id, { confirmed: 0, submitted: 0, waitlisted: 0 });
    for (const row of wholeCounts) (perRun.get(row.runId) as Record<string, number>)[row.status as string] = row._count;
    const entryRows = await this.db.registrationSession.groupBy({ by: ['status', 'registrationId'], where: { organizationId: org, registration: { runId: { in: runIds } }, status: { in: ['submitted', 'confirmed', 'waitlisted'] }, session: { status: 'scheduled' } }, _count: true });
    const regRun = new Map((await this.db.registration.findMany({ where: { organizationId: org, runId: { in: runIds } }, select: { id: true, runId: true } })).map((r) => [r.id, r.runId]));
    for (const row of entryRows) { const run = regRun.get(row.registrationId); if (run) (perRun.get(run) as Record<string, number>)[row.status] += row._count; }
    const dashRuns: DashboardRun[] = runs.map((r) => ({
      runId: r.id, courseName: r.course.name, batchName: r.batchName, perSession: r.perSessionRegistration,
      firstDate: r.sessions[0]?.date ?? null, lastDate: r.sessions[r.sessions.length - 1]?.date ?? null, ...perRun.get(r.id)!,
      capacity: r.perSessionRegistration ? null : r.capacity,
    }));
    const sessions = await this.db.courseSession.findMany({ where: { organizationId: org, date: { gte: from, lte: to }, run: { deletedAt: null, status: 'active' } }, include: { run: { include: { course: true } } }, orderBy: { startsAt: 'asc' } });
    const attendance = await this.db.attendance.findMany({ where: { organizationId: org, sessionId: { in: sessions.map((s) => s.id) } } });
    const dashSessions: DashboardSession[] = [];
    for (const s of sessions) {
      const registered = s.status === 'cancelled' ? 0 : s.run.perSessionRegistration
        ? await this.db.registrationSession.count({ where: { organizationId: org, sessionId: s.id, status: 'confirmed' } })
        : await this.db.registration.count({ where: { organizationId: org, runId: s.runId, status: 'confirmed' } });
      const marks = attendance.filter((a) => a.sessionId === s.id);
      const present = marks.filter((m) => m.status === 'present').length;
      const absent = marks.filter((m) => m.status === 'absent').length;
      dashSessions.push({ sessionId: s.id, runId: s.runId, courseName: s.run.course.name, batchName: s.run.batchName, date: s.date, startTime: s.startTime, endTime: s.endTime, status: s.status as 'scheduled' | 'cancelled', registered, present, absent, unmarked: Math.max(0, registered - present - absent) });
    }
    const unsigned = await this.db.member.count({ where: { organizationId: org, deletedAt: null, signedFormAt: null, OR: [{ registrations: { some: { run: { deletedAt: null, status: 'active' }, status: { in: ['submitted', 'confirmed'] } } } }, { registrations: { some: { run: { deletedAt: null, status: 'active' }, entries: { some: { status: { in: ['submitted', 'confirmed'] } } } } } }] } });
    const totals = dashRuns.reduce((t, r) => ({ confirmed: t.confirmed + r.confirmed, submitted: t.submitted + r.submitted, waitlisted: t.waitlisted + r.waitlisted }), { confirmed: 0, submitted: 0, waitlisted: 0 });
    return {
      today, from, to, reviews: { signupRequests, profileChanges }, followUp: { failedNotices }, unsignedForms: unsigned,
      totals: { ...totals, registeredForRange: dashSessions.reduce((n, s) => n + s.registered, 0), attendedForRange: dashSessions.reduce((n, s) => n + s.present, 0) },
      runs: dashRuns, sessions: dashSessions,
    };
  }
}
