import { Inject, Injectable } from '@nestjs/common';
import type { StaffActor } from '../../../../packages/contracts/src/core.js';
import type { AttendanceRow, AttendanceStatus, Roster } from '../../../../packages/contracts/src/attendance.js';
import { PrismaService, type Tx } from '../database/prisma.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { Audit } from '../audit/audit.service.js';

@Injectable()
export class Attendance {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
  ) {}

  /** Only confirmed bookings can attend; unmarked is distinct from absent. */
  async markInTransaction(tx: Tx, actor: StaffActor, sessionId: string, memberId: string, status: AttendanceStatus): Promise<void> {
    if (status !== 'present' && status !== 'absent') throw new AppError(422, 'INVALID_INPUT', 'กรุณาเลือกมา หรือ ไม่มา');
    const session = await tx.courseSession.findFirst({ where: { organizationId: actor.organizationId, id: sessionId }, include: { run: true } });
    if (!session) throw new AppError(404, 'NOT_FOUND', 'ไม่พบวันเรียน');
    if (session.status === 'cancelled' || session.run.status === 'cancelled' || session.run.deletedAt) throw new AppError(409, 'SESSION_CANCELLED', 'วันเรียนนี้ถูกยกเลิกแล้ว เช็คชื่อไม่ได้');
    const confirmed = session.run.perSessionRegistration
      ? await tx.registrationSession.count({ where: { organizationId: actor.organizationId, sessionId, status: 'confirmed', registration: { memberId } } })
      : await tx.registration.count({ where: { organizationId: actor.organizationId, runId: session.runId, memberId, status: 'confirmed' } });
    if (!confirmed) throw new AppError(409, 'NOT_CONFIRMED', 'เช็คชื่อได้เฉพาะผู้ที่ลงทะเบียนและยืนยันแล้ว');
    const data = { status, markedBy: actor.userId, markedAt: this.clock.now() };
    await tx.attendance.upsert({ where: { sessionId_memberId: { sessionId, memberId } }, create: { organizationId: actor.organizationId, sessionId, memberId, ...data }, update: data });
    await this.audit.record(tx, actor, { action: 'attendance.mark', entity: 'course_session', entityId: sessionId, fields: ['status'] });
  }
  async mark(actor: StaffActor, sessionId: string, memberId: string, status: AttendanceStatus): Promise<{ memberId: string; status: AttendanceStatus }> {
    await this.db.$transaction((tx) => this.markInTransaction(tx, actor, sessionId, memberId, status));
    return { memberId, status };
  }
  /** Removes a mark (back to unmarked), e.g. when staff tapped the wrong person. */
  async clear(actor: StaffActor, sessionId: string, memberId: string): Promise<{ memberId: string }> {
    await this.db.$transaction(async (tx) => {
      const session = await tx.courseSession.findFirst({ where: { organizationId: actor.organizationId, id: sessionId }, include: { run: true } });
      if (!session) throw new AppError(404, 'NOT_FOUND', 'ไม่พบวันเรียน');
      if (session.status === 'cancelled' || session.run.status === 'cancelled') throw new AppError(409, 'SESSION_CANCELLED', 'วันเรียนนี้ถูกยกเลิกแล้ว');
      await tx.attendance.deleteMany({ where: { organizationId: actor.organizationId, sessionId, memberId } });
      await this.audit.record(tx, actor, { action: 'attendance.clear', entity: 'course_session', entityId: sessionId, fields: ['status'] });
    });
    return { memberId };
  }
  async roster(actor: StaffActor, sessionId: string): Promise<Roster> {
    return this.db.$transaction(async (tx) => {
      const session = await tx.courseSession.findFirst({ where: { organizationId: actor.organizationId, id: sessionId }, include: { run: { include: { course: true } } } });
      if (!session || session.run.deletedAt) throw new AppError(404, 'NOT_FOUND', 'ไม่พบวันเรียน');
      const run = session.run;
      type Booking = { memberId: string; status: string };
      const bookings: Booking[] = run.perSessionRegistration
        ? (await tx.registrationSession.findMany({ where: { organizationId: actor.organizationId, sessionId }, include: { registration: { select: { memberId: true } } } })).map((e) => ({ memberId: e.registration.memberId, status: e.status }))
        : (await tx.registration.findMany({ where: { organizationId: actor.organizationId, runId: run.id }, select: { memberId: true, status: true } })).map((r) => ({ memberId: r.memberId, status: r.status ?? 'cancelled' }));
      const marks = await tx.attendance.findMany({ where: { organizationId: actor.organizationId, sessionId } });
      const marked = new Map(marks.map((m) => [m.memberId, m]));
      // Confirmed people attend; people who were marked and later left stay listed so history is not lost.
      const wanted = bookings.filter((b) => b.status === 'confirmed' || marked.has(b.memberId));
      const members = await tx.member.findMany({ where: { organizationId: actor.organizationId, id: { in: wanted.map((b) => b.memberId) } } });
      const byId = new Map(members.map((m) => [m.id, m]));
      const rows: AttendanceRow[] = wanted.flatMap((b) => {
        const m = byId.get(b.memberId);
        if (!m) return [];
        const mark = marked.get(b.memberId);
        return [{ memberId: m.id, memberName: `${m.firstName} ${m.lastName}`, memberNumber: m.memberNumber ?? '', phoneMobile: m.phoneMobile, bookingStatus: b.status as AttendanceRow['bookingStatus'], attendance: (mark?.status as AttendanceStatus | undefined) ?? null, markedAt: mark?.markedAt.toISOString() ?? null, unsigned: !m.signedFormAt }];
      }).sort((a, b) => a.memberName.localeCompare(b.memberName, 'th'));
      await this.audit.record(tx, actor, { action: 'attendance.roster', entity: 'course_session', entityId: sessionId, fields: ['fields'] });
      const present = rows.filter((r) => r.attendance === 'present').length;
      const absent = rows.filter((r) => r.attendance === 'absent').length;
      return { sessionId, runId: run.id, courseName: run.course.name, batchName: run.batchName, date: session.date, startTime: session.startTime, endTime: session.endTime, location: session.location, sessionStatus: (run.status === 'cancelled' ? 'cancelled' : session.status) as 'scheduled' | 'cancelled', rows, present, absent, unmarked: rows.filter((r) => r.bookingStatus === 'confirmed' && r.attendance === null).length, registered: rows.filter((r) => r.bookingStatus === 'confirmed').length };
    });
  }
  /** Sessions happening on a Bangkok calendar date, for the "today" attendance list. */
  async sessionsOn(actor: StaffActor, date: string) {
    const sessions = await this.db.courseSession.findMany({ where: { organizationId: actor.organizationId, date, run: { deletedAt: null, status: 'active' } }, include: { run: { include: { course: true } } }, orderBy: { startsAt: 'asc' } });
    return { items: sessions.map((s) => ({ sessionId: s.id, runId: s.runId, courseName: s.run.course.name, batchName: s.run.batchName, date: s.date, startTime: s.startTime, endTime: s.endTime, location: s.location, status: s.status })) };
  }
}
