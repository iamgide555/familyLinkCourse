import { Inject, Injectable } from '@nestjs/common';
import ExcelJS from 'exceljs';
import type { Response } from 'express';
import type { StaffActor } from '../../../../packages/contracts/src/core.js';
import type { MemberRecord } from '../../../../packages/contracts/src/members.js';
import type { MembershipFilter } from '../../../../packages/contracts/src/memberships.js';
import type { QuestionDefinition } from '../../../../packages/contracts/src/questions.js';
import { PrismaService, type Tx } from '../database/prisma.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { bangkokDate } from '../common/bangkok.js';
import { Audit } from '../audit/audit.service.js';
import { Members } from '../members/members.service.js';
import { memberWhere } from '../members/members.repository.js';
import { Snapshots } from '../bookings/snapshots.service.js';

const TYPE_WORD: Record<string, string> = { caregiver: 'ผู้ดูแล', disabled: 'คนพิการ', at_risk: 'ผู้มีแนวโน้มจะพิการ' };
const STATUS_WORD: Record<string, string> = { submitted: 'รออนุมัติ', confirmed: 'ยืนยันแล้ว', waitlisted: 'คิวรอ', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิก' };
const MEMBERSHIP_WORD: Record<string, string> = { general: 'สมาชิกทั่วไป', active: 'ใช้งานอยู่', expired: 'หมดอายุ', lifetime: 'ตลอดชีพ' };
const SOURCE_WORD: Record<string, string> = { paper: 'ใบสมัครกระดาษ', line: 'LINE', invite: 'ลิงก์เชิญ', walkin: 'หน้างาน' };
const ATT_WORD: Record<string, string> = { present: 'มา', absent: 'ไม่มา' };

/** Excel cells keep user text as text; ExcelJS only evaluates values passed as formula objects, never plain strings. */
const text = (value: unknown): string | number => (typeof value === 'number' ? value : value === null || value === undefined ? '' : String(value));

@Injectable()
export class Reports {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
    @Inject(Members) private readonly members: Members,
    @Inject(Snapshots) private readonly snapshots: Snapshots,
  ) {}

  private requireSensitive(actor: StaffActor, includeSensitive: boolean): void {
    if (includeSensitive && actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'เฉพาะผู้ดูแลระบบส่งออกข้อมูลอ่อนไหวได้');
  }
  private begin(res: Response, filename: string): ExcelJS.stream.xlsx.WorkbookWriter {
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.setHeader('Cache-Control', 'no-store');
    return new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: true });
  }
  private async log(actor: StaffActor, action: string, entity: string, entityId: string): Promise<void> {
    await this.db.$transaction((tx) => this.audit.record(tx, actor, { action, entity, entityId, fields: ['fields'] }));
  }
  private header(sheet: { addRow(values: unknown[]): ExcelJS.Row }, labels: string[]): void {
    const row = sheet.addRow(labels);
    row.font = { bold: true };
    row.commit();
  }

  /** Members in the order of the sign-up form. Sensitive columns exist only in an admin export that opted in. */
  async exportMembers(actor: StaffActor, q: string, filter: MembershipFilter, includeSensitive: boolean, res: Response): Promise<void> {
    this.requireSensitive(actor, includeSensitive);
    const today = bangkokDate(this.clock.now());
    const where = memberWhere(actor.organizationId, q, filter, today);
    const services = new Map((await this.db.serviceType.findMany({ where: { organizationId: actor.organizationId } })).map((s) => [s.id, s.name]));
    await this.log(actor, includeSensitive ? 'export.members.sensitive' : 'export.members', 'export', actor.userId);
    const wb = this.begin(res, 'สมาชิก.xlsx');
    const sheet = wb.addWorksheet('สมาชิก', { views: [{ state: 'frozen', ySplit: 1 }] });
    const columns: Array<[string, boolean, (m: MemberRecord) => unknown]> = [
      ['เลขสมาชิก', false, (m) => m.memberNumber], ['ประเภทสมาชิก', false, (m) => TYPE_WORD[m.memberType] ?? ''], ['ชื่อ', false, (m) => m.firstName], ['นามสกุล', false, (m) => m.lastName],
      ['วันเกิด', false, (m) => m.birthDate], ['เบอร์มือถือ', false, (m) => m.phoneMobile], ['จังหวัด', false, (m) => m.provinceId], ['อำเภอ/เขต', false, (m) => m.districtId],
      ['บริการที่ต้องการ', false, (m) => m.requestedServiceIds.map((id) => services.get(id) ?? '').filter(Boolean).join(', ')], ['อีเมล', false, (m) => m.email],
      ['เลขบัตรประชาชน', true, (m) => m.citizenId], ['ที่อยู่', false, (m) => m.address], ['ตำบล/แขวง', false, (m) => m.subdistrictId], ['รหัสไปรษณีย์', false, (m) => m.postcode],
      ['โทรศัพท์บ้าน', false, (m) => m.phoneHome], ['Facebook', false, (m) => m.facebook], ['ประเภทความพิการ', true, (m) => m.disabilityType],
      ['สถานภาพสมรส', false, (m) => m.maritalStatus], ['การศึกษา', false, (m) => m.education], ['อาชีพ', false, (m) => m.occupation], ['ลักษณะที่อยู่อาศัย', false, (m) => m.housing],
      ['จำนวนคนในครัวเรือน', false, (m) => m.householdSize], ['จำนวนผู้มีรายได้', false, (m) => m.householdEarners], ['รายได้ครัวเรือน', true, (m) => m.householdIncome],
      ['ชื่อผู้ดูแล', false, (m) => m.caregiverName], ['ความสัมพันธ์ของผู้ดูแล', false, (m) => m.caregiverRelationship], ['เบอร์ผู้ดูแล', false, (m) => m.caregiverPhone],
      ['ผู้ติดต่อฉุกเฉิน', false, (m) => m.emergencyName], ['ความสัมพันธ์ผู้ติดต่อฉุกเฉิน', false, (m) => m.emergencyRelationship], ['เบอร์ฉุกเฉิน', false, (m) => m.emergencyPhone],
      ['ประเภทสมาชิกภาพ', false, (m) => m.tierName], ['วันหมดอายุสมาชิกภาพ', false, (m) => m.membershipExpiresAt ?? ''], ['สถานะสมาชิกภาพ', false, (m) => MEMBERSHIP_WORD[m.membershipStatus ?? 'general']],
      ['ได้รับเอกสารลงนามเมื่อ', false, (m) => m.signedFormAt ?? ''], ['ช่องทางสมัคร', false, (m) => SOURCE_WORD[m.source] ?? m.source], ['เชื่อมต่อ LINE', false, (m) => (m.lineLinked ? 'ใช่' : 'ไม่')],
    ];
    const used = columns.filter(([, sensitive]) => includeSensitive || !sensitive);
    this.header(sheet, used.map(([label]) => label));
    for (let skip = 0; ; skip += 200) {
      const batch = await this.db.member.findMany({ where, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip, take: 200, select: { id: true } });
      if (!batch.length) break;
      for (const { id } of batch) {
        const record = await this.members.snapshotDetails(this.db as unknown as Tx, actor.organizationId, id);
        sheet.addRow(used.map(([, , get]) => text(get(record)))).commit();
      }
    }
    await sheet.commit();
    await wb.commit();
  }

  /**
   * One row per booking: per member in whole-run mode, per member and session in per-session mode. Answers come
   * from the snapshot that booking references, in columns keyed by the stable question id.
   */
  async exportRun(actor: StaffActor, runId: string, includeSensitive: boolean, res: Response): Promise<void> {
    this.requireSensitive(actor, includeSensitive);
    const run = await this.db.courseRun.findFirst({ where: { organizationId: actor.organizationId, id: runId, deletedAt: null }, include: { course: true, sessions: { orderBy: { startsAt: 'asc' } }, questions: { orderBy: { position: 'asc' } }, registrations: { include: { entries: true }, orderBy: { createdAt: 'asc' } } } });
    if (!run) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรอบของคอร์ส');
    const questions = run.questions.filter((q) => includeSensitive || !q.sensitive);
    const snapIds = [...new Set(run.registrations.flatMap((r) => [r.snapshotId, ...r.entries.map((e) => e.snapshotId)]).filter((id): id is string => !!id))];
    const snapRows = await this.db.registrationSnapshot.findMany({ where: { organizationId: actor.organizationId, id: { in: snapIds } } });
    const snaps = new Map(snapRows.map((s) => [s.id, { version: s.version, body: this.snapshots.read(s) }]));
    const attendance = await this.db.attendance.findMany({ where: { organizationId: actor.organizationId, session: { runId } } });
    const att = (sessionId: string, memberId: string) => attendance.find((a) => a.sessionId === sessionId && a.memberId === memberId)?.status;
    const position = async (sessionId: string | null, seq: number | null): Promise<number | ''> => {
      if (seq === null) return '';
      return sessionId
        ? this.db.registrationSession.count({ where: { organizationId: actor.organizationId, sessionId, status: 'waitlisted', queueSeq: { lte: seq } } })
        : this.db.registration.count({ where: { organizationId: actor.organizationId, runId, status: 'waitlisted', queueSeq: { lte: seq } } });
    };
    await this.log(actor, includeSensitive ? 'export.run.sensitive' : 'export.run', 'course_run', runId);
    const wb = this.begin(res, `ผู้ลงทะเบียน-${run.batchName}.xlsx`);
    const sheet = wb.addWorksheet('ผู้ลงทะเบียน', { views: [{ state: 'frozen', ySplit: 1 }] });
    const fixed = ['เลขสมาชิก', 'ชื่อ', 'นามสกุล', 'เบอร์มือถือ', 'อีเมล', ...(includeSensitive ? ['เลขบัตรประชาชน', 'ประเภทความพิการ', 'รายได้ครัวเรือน'] : []), 'สถานะการลงทะเบียน', 'คิวที่', ...(run.perSessionRegistration ? ['วันเรียน', 'เวลา'] : []), 'การเข้าร่วม', 'ลงทะเบียนเมื่อ', 'ครั้งที่ส่งข้อมูล'];
    this.header(sheet, [...fixed, ...questions.map((q) => q.label)]);
    const emit = async (reg: (typeof run.registrations)[number], status: string, seq: number | null, snapshotId: string | null, session: (typeof run.sessions)[number] | null) => {
      const snap = snapshotId ? snaps.get(snapshotId) : undefined;
      const m = (snap?.body.member ?? {}) as Partial<MemberRecord>;
      const answers = snap?.body.answers ?? {};
      const defs = new Map<string, QuestionDefinition>((snap?.body.questions ?? []).map((d) => [d.id, d]));
      const answer = (id: string) => {
        const v = answers[id];
        if (v === undefined) return '';
        const d = defs.get(id);
        const label = (opt: string) => d?.options.find((o) => o.id === opt)?.label ?? opt;
        return Array.isArray(v) ? v.map(label).join(', ') : d && (d.type === 'single_choice' || d.type === 'dropdown') ? label(v) : v;
      };
      const row = [m.memberNumber, m.firstName, m.lastName, m.phoneMobile, m.email, ...(includeSensitive ? [m.citizenId, m.disabilityType, m.householdIncome] : []), STATUS_WORD[status] ?? status, await position(session?.id ?? null, seq), ...(run.perSessionRegistration ? [session?.date ?? '', session ? `${session.startTime}-${session.endTime}` : ''] : []), session ? (ATT_WORD[att(session.id, reg.memberId) ?? ''] ?? 'ยังไม่เช็คชื่อ') : (run.sessions.some((s) => att(s.id, reg.memberId) === 'present') ? `มา ${run.sessions.filter((s) => att(s.id, reg.memberId) === 'present').length} วัน` : 'ยังไม่เช็คชื่อ'), reg.createdAt.toISOString(), snap?.version ?? '', ...questions.map((q) => answer(q.id))];
      sheet.addRow(row.map(text)).commit();
    };
    for (const reg of run.registrations) {
      if (run.perSessionRegistration) for (const e of reg.entries) await emit(reg, e.status, e.queueSeq, e.snapshotId, run.sessions.find((s) => s.id === e.sessionId) ?? null);
      else if (reg.status) await emit(reg, reg.status, reg.queueSeq, reg.snapshotId, null);
    }
    await sheet.commit();
    await wb.commit();
  }
}
