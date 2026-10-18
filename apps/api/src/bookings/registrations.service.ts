import { Inject, Injectable } from '@nestjs/common';
import type { BookingStatus, MemberActor, StaffActor } from '../../../../packages/contracts/src/core.js';
import type { EntryView, MemberRunSession, MemberRunView, RegistrationView, SnapshotView } from '../../../../packages/contracts/src/bookings.js';
import type { Availability } from '../../../../packages/contracts/src/courses.js';
import type { Answers } from '../../../../packages/contracts/src/questions.js';
import { PrismaService, type Tx } from '../database/prisma.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { Audit } from '../audit/audit.service.js';
import { Questions } from '../questions/questions.service.js';
import { ACTIVE, registrationState, selfCancelDeadline, type PolicyRun, type PolicySession } from './booking-policy.js';
import { queuePosition, reserved } from './pools.js';
import { Snapshots } from './snapshots.service.js';

type Loaded = Awaited<ReturnType<Registrations['load']>>[number];
const WORDS: Record<string, string> = { submitted: 'รอเจ้าหน้าที่อนุมัติ', confirmed: 'ยืนยันแล้ว', waitlisted: 'อยู่ในคิวรอ', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว' };

@Injectable()
export class Registrations {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
    @Inject(Questions) private readonly questions: Questions,
    @Inject(Snapshots) private readonly snapshots: Snapshots,
  ) {}

  private async load(tx: Tx, organizationId: string, where: Record<string, unknown>) {
    return tx.registration.findMany({
      where: { organizationId, ...where },
      include: { member: true, entries: true, run: { include: { course: true, sessions: { orderBy: { startsAt: 'asc' } } } } },
      orderBy: { createdAt: 'asc' },
    });
  }
  private async view(tx: Tx, organizationId: string, row: Loaded): Promise<RegistrationView> {
    const run = row.run;
    const now = this.clock.now();
    const sessions = run.sessions as PolicySession[];
    const attendance = await tx.attendance.findMany({ where: { organizationId, memberId: row.memberId, session: { runId: run.id } } });
    const att = (sessionId: string) => (attendance.find((a) => a.sessionId === sessionId)?.status as 'present' | 'absent' | undefined) ?? null;
    const entries: EntryView[] = [];
    if (run.perSessionRegistration) {
      for (const e of [...row.entries].sort((a, b) => (run.sessions.findIndex((s) => s.id === a.sessionId)) - (run.sessions.findIndex((s) => s.id === b.sessionId)))) {
        const s = run.sessions.find((x) => x.id === e.sessionId)!;
        entries.push({ sessionId: s.id, date: s.date, startTime: s.startTime, endTime: s.endTime, dayNo: s.dayNo, status: e.status as BookingStatus, queuePosition: e.status === 'waitlisted' && e.queueSeq ? await queuePosition(tx, organizationId, { runId: run.id, sessionId: s.id }, e.queueSeq) : null, sessionStatus: s.status as 'scheduled' | 'cancelled', attendance: att(s.id) });
      }
    } else if (row.status) {
      entries.push({ sessionId: null, date: null, startTime: null, endTime: null, dayNo: null, status: row.status as BookingStatus, queuePosition: row.status === 'waitlisted' && row.queueSeq ? await queuePosition(tx, organizationId, { runId: run.id, sessionId: null }, row.queueSeq) : null, sessionStatus: null, attendance: null });
    }
    const counts = new Map<string, number>();
    for (const e of entries) counts.set(e.status, (counts.get(e.status) ?? 0) + 1);
    const summary = run.perSessionRegistration
      ? ['confirmed', 'submitted', 'waitlisted', 'rejected', 'cancelled'].filter((k) => counts.get(k)).map((k) => `${WORDS[k]} ${counts.get(k)} วัน`).join(' · ')
      : WORDS[row.status ?? ''] ?? '';
    const active = entries.filter((e) => ACTIVE.includes(e.status as 'submitted'));
    const deadlines = run.perSessionRegistration
      ? active.map((e) => selfCancelDeadline(run as unknown as PolicyRun, sessions, sessions.find((s) => s.id === e.sessionId) ?? null))
      : active.length ? [selfCancelDeadline(run as unknown as PolicyRun, sessions, null)] : [];
    const open = deadlines.filter((d): d is Date => !!d && now < d);
    const latest = deadlines.filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return {
      id: row.id, runId: run.id, memberId: row.memberId, memberName: `${row.member.firstName} ${row.member.lastName}`, memberNumber: row.member.memberNumber ?? '',
      perSession: run.perSessionRegistration, courseName: run.course.name, batchName: run.batchName, source: row.source, registeredBy: row.registeredBy,
      createdAt: row.createdAt.toISOString(), entries, summary, unsigned: !row.member.signedFormAt,
      canSelfCancel: run.status !== 'cancelled' && open.length > 0, cancelDeadline: latest?.toISOString() ?? null,
    };
  }

  // ---- staff ---------------------------------------------------------------------------------------------
  async forRun(actor: StaffActor, runId: string): Promise<{ items: RegistrationView[] }> {
    return this.db.$transaction(async (tx) => {
      if (!(await tx.courseRun.findFirst({ where: { organizationId: actor.organizationId, id: runId, deletedAt: null } }))) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรอบของคอร์ส');
      const rows = await this.load(tx, actor.organizationId, { runId });
      const items: RegistrationView[] = [];
      for (const row of rows) items.push(await this.view(tx, actor.organizationId, row));
      await this.audit.record(tx, actor, { action: 'registration.list', entity: 'course_run', entityId: runId, fields: ['fields'] });
      return { items };
    });
  }
  async detail(actor: StaffActor, registrationId: string): Promise<{ registration: RegistrationView; current: SnapshotView | null; history: SnapshotView[] }> {
    return this.db.$transaction(async (tx) => {
      const [row] = await this.load(tx, actor.organizationId, { id: registrationId });
      if (!row) throw new AppError(404, 'NOT_FOUND', 'ไม่พบการลงทะเบียน');
      const snaps = await tx.registrationSnapshot.findMany({ where: { organizationId: actor.organizationId, registrationId }, orderBy: { version: 'asc' } });
      const history = snaps.map((s) => this.snapshots.view(s));
      const current = row.snapshotId ? history.find((_, i) => snaps[i]!.id === row.snapshotId) ?? history[history.length - 1] ?? null : history[history.length - 1] ?? null;
      await this.audit.record(tx, actor, { action: 'registration.view', entity: 'registration', entityId: registrationId, fields: ['fields'] });
      return { registration: await this.view(tx, actor.organizationId, row), current, history };
    });
  }
  async forMember(actor: StaffActor, memberId: string): Promise<{ items: RegistrationView[] }> {
    return this.db.$transaction(async (tx) => {
      const rows = await this.load(tx, actor.organizationId, { memberId });
      const items: RegistrationView[] = [];
      for (const row of rows) items.push(await this.view(tx, actor.organizationId, row));
      return { items };
    });
  }

  // ---- member (LINE) -------------------------------------------------------------------------------------
  async mine(actor: MemberActor): Promise<{ items: RegistrationView[] }> {
    return this.db.$transaction(async (tx) => {
      const rows = await this.load(tx, actor.organizationId, { member: { lineAccountId: actor.lineAccountId, deletedAt: null } });
      const items: RegistrationView[] = [];
      for (const row of rows) items.push(await this.view(tx, actor.organizationId, row));
      return { items: items.reverse() };
    });
  }
  private availability(run: PolicyRun & { id: string }, sessions: PolicySession[], session: PolicySession | null, free: number): Availability {
    if (run.status === 'cancelled' || session?.status === 'cancelled') return 'cancelled';
    const state = registrationState(run, sessions, session, this.clock.now());
    if (state === 'not_open') return 'not_open';
    if (state === 'closed') return 'closed';
    if (free > 0) return 'available';
    return run.waitlistEnabled ? 'full_waitlist' : 'full_closed';
  }
  async courses(actor: MemberActor): Promise<{ items: MemberRunView[] }> {
    return this.db.$transaction(async (tx) => {
      const runs = await tx.courseRun.findMany({ where: { organizationId: actor.organizationId, deletedAt: null, status: 'active', course: { deletedAt: null } }, include: { course: true, sessions: { orderBy: { startsAt: 'asc' } } }, orderBy: { createdAt: 'desc' } });
      const upcoming = runs.filter((r) => r.sessions.some((s) => s.status !== 'cancelled' && s.endsAt > this.clock.now()));
      const items: MemberRunView[] = [];
      for (const run of upcoming) items.push(await this.runView(tx, actor.organizationId, run));
      return { items };
    });
  }
  private async runView(tx: Tx, organizationId: string, run: Awaited<ReturnType<Tx['courseRun']['findFirstOrThrow']>> & { course: { id: string; name: string; description: string }; sessions: Array<NonNullable<Awaited<ReturnType<Tx['courseSession']['findFirst']>>>> }): Promise<MemberRunView> {
    const sessions = run.sessions as PolicySession[];
    const rows: MemberRunSession[] = [];
    for (const s of run.sessions) {
      const free = run.perSessionRegistration ? (s.capacity ?? 0) - (await reserved(tx, organizationId, { runId: run.id, sessionId: s.id })) : 0;
      rows.push({ id: s.id, dayNo: s.dayNo, date: s.date, startTime: s.startTime, endTime: s.endTime, location: s.location, onlineUrl: s.onlineUrl, status: s.status as 'scheduled' | 'cancelled', availability: run.perSessionRegistration ? this.availability(run, sessions, s as PolicySession, free) : this.availability(run, sessions, null, (run.capacity ?? 0) - (await reserved(tx, organizationId, { runId: run.id, sessionId: null }))) });
    }
    const wholeFree = (run.capacity ?? 0) - (await reserved(tx, organizationId, { runId: run.id, sessionId: null }));
    return {
      runId: run.id, courseId: run.courseId, courseName: run.course.name, description: run.course.description, batchName: run.batchName, location: run.location,
      perSession: run.perSessionRegistration, requireApproval: run.requireApproval, waitlistEnabled: run.waitlistEnabled,
      availability: run.perSessionRegistration ? (rows.some((r) => r.availability === 'available' || r.availability === 'full_waitlist') ? 'available' : (rows[0]?.availability ?? 'closed')) : this.availability(run, sessions, null, wholeFree),
      sessions: rows, questions: await this.questions.runQuestions(tx, organizationId, run.id),
      cancelDeadline: selfCancelDeadline(run, sessions, null)?.toISOString() ?? null,
      registrationClosesAt: run.registrationClosesAt?.toISOString() ?? null,
    };
  }
  /** Run details for registering one of the caller's members, with that member's earlier answers prefilled. */
  async course(actor: MemberActor, runId: string, memberId: string | null): Promise<{ run: MemberRunView; prefill: Answers; registration: RegistrationView | null }> {
    return this.db.$transaction(async (tx) => {
      const run = await tx.courseRun.findFirst({ where: { organizationId: actor.organizationId, id: runId, deletedAt: null, course: { deletedAt: null } }, include: { course: true, sessions: { orderBy: { startsAt: 'asc' } } } });
      if (!run) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรอบของคอร์ส');
      const view = await this.runView(tx, actor.organizationId, run);
      let prefill: Answers = {};
      let registration: RegistrationView | null = null;
      if (memberId) {
        const member = await tx.member.findFirst({ where: { organizationId: actor.organizationId, id: memberId, lineAccountId: actor.lineAccountId, deletedAt: null } });
        if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
        const [row] = await this.load(tx, actor.organizationId, { runId, memberId });
        if (row) {
          registration = await this.view(tx, actor.organizationId, row);
          const last = await tx.registrationSnapshot.findFirst({ where: { organizationId: actor.organizationId, registrationId: row.id }, orderBy: { version: 'desc' } });
          if (last) {
            const body = this.snapshots.read(last);
            const current = new Set(view.questions.map((q) => q.id));
            prefill = Object.fromEntries(Object.entries(body.answers).filter(([id]) => current.has(id)));
          }
        }
      }
      return { run: view, prefill, registration };
    });
  }
}
