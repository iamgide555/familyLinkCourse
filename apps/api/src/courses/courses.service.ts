import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { StaffActor } from '../../../../packages/contracts/src/core.js';
import type { CourseDetail, CourseRecord, CreateCourseInput, CreateRunInput, RunPatch, RunRecord, SessionInput, SessionPatch, SessionRecord } from '../../../../packages/contracts/src/courses.js';
import type { QuestionInput } from '../../../../packages/contracts/src/questions.js';
import { PrismaService, type Tx } from '../database/prisma.service.js';
import { FieldCrypto } from '../crypto/field-crypto.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { instantOf, isDate, isTime } from '../common/bangkok.js';
import { Audit } from '../audit/audit.service.js';
import { Outbox } from '../notifications/outbox.service.js';
import { Questions, toDefinition } from '../questions/questions.service.js';
import { ACTIVE, promotionCutoff, rescheduleDeadline, selfCancelDeadline, type PolicySession } from '../bookings/booking-policy.js';
import { Queue } from '../bookings/queue.service.js';
import { RunLock } from '../bookings/run-lock.js';
import { reserved, waiting } from '../bookings/pools.js';

const bad = (message: string, fields?: Record<string, string>) => new AppError(422, 'INVALID_INPUT', message, fields);
const iso = (d: Date | null | undefined) => d?.toISOString() ?? null;
const positive = (v: unknown, max = 5000): v is number => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= max;
const RUN_KEYS = ['batchName', 'location', 'capacity', 'requireApproval', 'waitlistEnabled', 'perSessionRegistration', 'registrationOpensAt', 'registrationClosesAt', 'cancelDeadlineDays'];

function parseWhen(value: unknown, label: string): Date | null {
  if (value === null || value === undefined || value === '') return null;
  const d = typeof value === 'string' ? new Date(value) : new Date(NaN);
  if (!Number.isFinite(d.getTime())) throw bad(`${label}ไม่ถูกต้อง`);
  return d;
}
function cleanSession(input: SessionInput, perSession: boolean) {
  if (!input || !isDate(input.date) || !isTime(input.startTime) || !isTime(input.endTime)) throw bad('กรุณาระบุวันและเวลาของแต่ละวันเรียนให้ถูกต้อง');
  const startsAt = instantOf(input.date, input.startTime);
  const endsAt = instantOf(input.date, input.endTime);
  if (endsAt <= startsAt) throw bad('เวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม');
  if (perSession && !positive(input.capacity)) throw bad('กรุณาระบุจำนวนที่นั่งของแต่ละวันเรียน (1–5000)');
  if (input.location !== undefined && (typeof input.location !== 'string' || input.location.length > 200)) throw bad('สถานที่ยาวเกินไป');
  if (input.onlineUrl && (typeof input.onlineUrl !== 'string' || !/^https?:\/\/\S{3,500}$/.test(input.onlineUrl))) throw bad('ลิงก์ออนไลน์ต้องขึ้นต้นด้วย http:// หรือ https://');
  return { date: input.date, startTime: input.startTime, endTime: input.endTime, startsAt, endsAt, location: input.location?.trim() ?? '', onlineUrl: input.onlineUrl?.trim() ?? '', capacity: perSession ? (input.capacity as number) : null };
}

@Injectable()
export class Courses {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
    @Inject(Outbox) private readonly outbox: Outbox,
    @Inject(Questions) private readonly questions: Questions,
    @Inject(RunLock) private readonly lock: RunLock,
    @Inject(Queue) private readonly queue: Queue,
  ) {}

  // ---- courses -------------------------------------------------------------------------------------------
  async listCourses(actor: StaffActor): Promise<{ items: CourseRecord[] }> {
    const rows = await this.db.course.findMany({ where: { organizationId: actor.organizationId, deletedAt: null }, orderBy: { createdAt: 'desc' }, include: { serviceTags: true, runs: { where: { deletedAt: null }, select: { id: true } } } });
    return { items: rows.map((c) => ({ id: c.id, name: c.name, description: c.description, serviceTypeIds: c.serviceTags.map((t) => t.serviceTypeId), runCount: c.runs.length })) };
  }
  private async tags(tx: Tx, organizationId: string, ids: unknown): Promise<string[]> {
    if (ids === undefined) return [];
    if (!Array.isArray(ids) || ids.some((id) => typeof id !== 'string') || new Set(ids).size !== ids.length) throw bad('บริการที่เลือกไม่ถูกต้อง');
    if (ids.length && (await tx.serviceType.count({ where: { organizationId, id: { in: ids as string[] } } })) !== ids.length) throw bad('ไม่พบบริการที่เลือก');
    return ids as string[];
  }
  private courseText(input: { name?: unknown; description?: unknown }, requireName: boolean) {
    const out: { name?: string; description?: string } = {};
    if (input.name !== undefined || requireName) {
      if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 200) throw bad('กรุณาระบุชื่อคอร์สไม่เกิน 200 ตัวอักษร', { name: 'กรุณาระบุชื่อคอร์ส' });
      out.name = input.name.trim();
    }
    if (input.description !== undefined) {
      if (typeof input.description !== 'string' || input.description.length > 4000) throw bad('คำอธิบายยาวเกินไป');
      out.description = input.description.trim();
    }
    return out;
  }
  async createCourse(actor: StaffActor, input: CreateCourseInput): Promise<CourseRecord> {
    const text = this.courseText(input, true);
    return this.db.$transaction(async (tx) => {
      const tags = await this.tags(tx, actor.organizationId, input.serviceTypeIds);
      const course = await tx.course.create({ data: { organizationId: actor.organizationId, name: text.name!, description: text.description ?? '' } });
      if (tags.length) await tx.courseServiceTag.createMany({ data: tags.map((serviceTypeId) => ({ organizationId: actor.organizationId, courseId: course.id, serviceTypeId })) });
      await this.audit.record(tx, actor, { action: 'course.create', entity: 'course', entityId: course.id, fields: ['name', 'description'] });
      return { id: course.id, name: course.name, description: course.description, serviceTypeIds: tags, runCount: 0 };
    });
  }
  async updateCourse(actor: StaffActor, id: string, patch: { name?: string; description?: string; serviceTypeIds?: string[] }): Promise<CourseRecord> {
    if (!patch || Object.keys(patch).some((k) => !['name', 'description', 'serviceTypeIds'].includes(k))) throw bad('ข้อมูลไม่ถูกต้อง');
    const text = this.courseText(patch, false);
    await this.db.$transaction(async (tx) => {
      if (!(await tx.course.findFirst({ where: { organizationId: actor.organizationId, id, deletedAt: null } }))) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคอร์ส');
      if (Object.keys(text).length) await tx.course.update({ where: { organizationId_id: { organizationId: actor.organizationId, id } }, data: text });
      if (patch.serviceTypeIds !== undefined) {
        const tags = await this.tags(tx, actor.organizationId, patch.serviceTypeIds);
        await tx.courseServiceTag.deleteMany({ where: { organizationId: actor.organizationId, courseId: id } });
        if (tags.length) await tx.courseServiceTag.createMany({ data: tags.map((serviceTypeId) => ({ organizationId: actor.organizationId, courseId: id, serviceTypeId })) });
      }
      await this.audit.record(tx, actor, { action: 'course.update', entity: 'course', entityId: id, fields: Object.keys(patch).map((k) => (k === 'serviceTypeIds' ? 'serviceTypeIds' : k)) });
    });
    return (await this.getCourse(actor, id));
  }
  async getCourse(actor: StaffActor, id: string): Promise<CourseDetail> {
    const course = await this.db.course.findFirst({ where: { organizationId: actor.organizationId, id, deletedAt: null }, include: { serviceTags: true, questions: { orderBy: { position: 'asc' } }, runs: { where: { deletedAt: null }, include: { sessions: { orderBy: { startsAt: 'asc' } } }, orderBy: { createdAt: 'desc' } } } });
    if (!course) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคอร์ส');
    return {
      id: course.id, name: course.name, description: course.description, serviceTypeIds: course.serviceTags.map((t) => t.serviceTypeId), runCount: course.runs.length,
      questions: course.questions.map(toDefinition),
      runs: course.runs.map((r) => ({ id: r.id, batchName: r.batchName, status: r.status as 'active' | 'cancelled', perSessionRegistration: r.perSessionRegistration, structureLocked: r.structureLocked, firstDate: r.sessions[0]?.date ?? null, sessionCount: r.sessions.length })),
    };
  }
  async deleteCourse(actor: StaffActor, id: string): Promise<{ id: string; deleted: true }> {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'เฉพาะผู้ดูแลระบบลบคอร์สได้');
    const runs = await this.db.courseRun.findMany({ where: { organizationId: actor.organizationId, courseId: id, deletedAt: null }, select: { id: true } });
    for (const run of runs) await this.deleteRun(actor, run.id);
    await this.db.$transaction(async (tx) => {
      const course = await tx.course.findFirst({ where: { organizationId: actor.organizationId, id, deletedAt: null } });
      if (!course) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคอร์ส');
      await tx.course.update({ where: { organizationId_id: { organizationId: actor.organizationId, id } }, data: { deletedAt: this.clock.now() } });
      await this.audit.record(tx, actor, { action: 'course.delete', entity: 'course', entityId: id, fields: ['deletedAt'] });
    });
    return { id, deleted: true };
  }

  // ---- runs ----------------------------------------------------------------------------------------------
  async runRecord(tx: Tx, organizationId: string, runId: string): Promise<RunRecord> {
    const run = await tx.courseRun.findFirst({ where: { organizationId, id: runId, deletedAt: null }, include: { sessions: { orderBy: { startsAt: 'asc' } } } });
    if (!run) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรอบของคอร์ส');
    const hasBookings = run.structureLocked || (await tx.registration.count({ where: { organizationId, runId } })) > 0;
    const sessions: SessionRecord[] = [];
    for (const s of run.sessions) {
      const [res, wait] = run.perSessionRegistration ? [await reserved(tx, organizationId, { runId, sessionId: s.id }), await waiting(tx, organizationId, { runId, sessionId: s.id })] : [0, 0];
      sessions.push({
        id: s.id, dayNo: s.dayNo, date: s.date, startTime: s.startTime, endTime: s.endTime, startsAt: s.startsAt.toISOString(), endsAt: s.endsAt.toISOString(),
        location: s.location, onlineUrl: s.onlineUrl, capacity: s.capacity, status: s.status as 'scheduled' | 'cancelled',
        cancelDeadline: iso(selfCancelDeadline(run, run.sessions, s)), reserved: res, waiting: wait, free: s.capacity === null ? null : Math.max(0, s.capacity - res),
      });
    }
    const [res, wait] = run.perSessionRegistration ? [sessions.reduce((n, s) => n + s.reserved, 0), sessions.reduce((n, s) => n + s.waiting, 0)] : [await reserved(tx, organizationId, { runId, sessionId: null }), await waiting(tx, organizationId, { runId, sessionId: null })];
    const cutoff = promotionCutoff(run, run.sessions, null);
    return {
      id: run.id, courseId: run.courseId, batchName: run.batchName, location: run.location, capacity: run.capacity,
      requireApproval: run.requireApproval, waitlistEnabled: run.waitlistEnabled, perSessionRegistration: run.perSessionRegistration,
      registrationOpensAt: iso(run.registrationOpensAt), registrationClosesAt: iso(run.registrationClosesAt), cancelDeadlineDays: run.cancelDeadlineDays,
      status: run.status as RunRecord['status'], structureLocked: hasBookings, cancelDeadline: iso(selfCancelDeadline(run, run.sessions, null)),
      reserved: res, waiting: wait, free: run.perSessionRegistration || run.capacity === null ? null : Math.max(0, run.capacity - res),
      promotionCutoff: iso(cutoff), sessions, questions: await this.questions.runQuestions(tx, organizationId, runId),
    };
  }
  async getRun(actor: StaffActor, runId: string): Promise<RunRecord> {
    return this.db.$transaction((tx) => this.runRecord(tx, actor.organizationId, runId));
  }
  private cleanRun(input: CreateRunInput) {
    if (!input || typeof input !== 'object') throw bad('ข้อมูลไม่ถูกต้อง');
    const batchName = typeof input.batchName === 'string' ? input.batchName.trim() : '';
    if (!batchName || batchName.length > 150) throw bad('กรุณาระบุชื่อรุ่น/รอบไม่เกิน 150 ตัวอักษร', { batchName: 'กรุณาระบุชื่อรุ่น' });
    if (typeof input.requireApproval !== 'boolean' || typeof input.waitlistEnabled !== 'boolean' || typeof input.perSessionRegistration !== 'boolean') throw bad('กรุณาตั้งค่าการอนุมัติ คิวรอ และรูปแบบการลงทะเบียน');
    if (!Number.isInteger(input.cancelDeadlineDays) || input.cancelDeadlineDays < 0 || input.cancelDeadlineDays > 365) throw bad('จำนวนวันก่อนหมดเขตยกเลิกต้องอยู่ระหว่าง 0–365', { cancelDeadlineDays: 'ระหว่าง 0–365 วัน' });
    if (!input.perSessionRegistration && !positive(input.capacity)) throw bad('กรุณาระบุจำนวนที่นั่ง (1–5000)', { capacity: 'กรุณาระบุจำนวนที่นั่ง' });
    if (!Array.isArray(input.sessions) || input.sessions.length < 1 || input.sessions.length > 60) throw bad('กรุณาเพิ่มวันเรียนอย่างน้อย 1 วัน');
    const opens = parseWhen(input.registrationOpensAt, 'เวลาเปิดรับลงทะเบียน');
    const closes = parseWhen(input.registrationClosesAt, 'เวลาปิดรับลงทะเบียน');
    if (opens && closes && closes <= opens) throw bad('เวลาปิดรับต้องอยู่หลังเวลาเปิดรับ');
    if (input.location !== undefined && (typeof input.location !== 'string' || input.location.length > 200)) throw bad('สถานที่ยาวเกินไป');
    const sessions = input.sessions.map((s) => cleanSession(s, input.perSessionRegistration)).sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
    return { batchName, location: input.location?.trim() ?? '', capacity: input.perSessionRegistration ? null : input.capacity!, requireApproval: input.requireApproval, waitlistEnabled: input.waitlistEnabled, perSessionRegistration: input.perSessionRegistration, registrationOpensAt: opens, registrationClosesAt: closes, cancelDeadlineDays: input.cancelDeadlineDays, sessions };
  }
  async createRun(actor: StaffActor, courseId: string, input: CreateRunInput): Promise<RunRecord> {
    const data = this.cleanRun(input);
    const { sessions, ...runData } = data;
    return this.db.$transaction(async (tx) => {
      if (!(await tx.course.findFirst({ where: { organizationId: actor.organizationId, id: courseId, deletedAt: null } }))) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคอร์ส');
      const run = await tx.courseRun.create({ data: { ...runData, organizationId: actor.organizationId, courseId } });
      for (const [index, s] of sessions.entries()) await tx.courseSession.create({ data: { ...s, organizationId: actor.organizationId, runId: run.id, dayNo: index + 1 } });
      await this.questions.copyToRun(tx, actor.organizationId, courseId, run.id);
      await this.audit.record(tx, actor, { action: 'run.create', entity: 'course_run', entityId: run.id, fields: ['batchName', 'capacity', 'requireApproval', 'waitlistEnabled', 'perSessionRegistration', 'cancelDeadlineDays'] });
      return this.runRecord(tx, actor.organizationId, run.id);
    });
  }
  async updateRun(actor: StaffActor, runId: string, patch: RunPatch): Promise<RunRecord> {
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some((k) => !RUN_KEYS.includes(k))) throw bad('แก้ไขได้เฉพาะข้อมูลของรอบที่อนุญาต');
    return this.lock.withRun(actor.organizationId, runId, async (tx) => {
      const run = await tx.courseRun.findFirstOrThrow({ where: { organizationId: actor.organizationId, id: runId }, include: { sessions: true } });
      if (run.status === 'cancelled') throw new AppError(409, 'RUN_CANCELLED', 'รอบนี้ถูกยกเลิกแล้ว');
      const locked = run.structureLocked || (await tx.registration.count({ where: { organizationId: actor.organizationId, runId } })) > 0;
      const data: Record<string, unknown> = {};
      if (patch.batchName !== undefined) { if (typeof patch.batchName !== 'string' || !patch.batchName.trim() || patch.batchName.length > 150) throw bad('กรุณาระบุชื่อรุ่น'); data['batchName'] = patch.batchName.trim(); }
      if (patch.location !== undefined) { if (typeof patch.location !== 'string' || patch.location.length > 200) throw bad('สถานที่ยาวเกินไป'); data['location'] = patch.location.trim(); }
      if (patch.waitlistEnabled !== undefined) { if (typeof patch.waitlistEnabled !== 'boolean') throw bad('ข้อมูลไม่ถูกต้อง'); data['waitlistEnabled'] = patch.waitlistEnabled; }
      if (patch.cancelDeadlineDays !== undefined) { if (!Number.isInteger(patch.cancelDeadlineDays) || patch.cancelDeadlineDays < 0 || patch.cancelDeadlineDays > 365) throw bad('จำนวนวันไม่ถูกต้อง'); data['cancelDeadlineDays'] = patch.cancelDeadlineDays; }
      for (const key of ['requireApproval', 'perSessionRegistration'] as const) {
        if (patch[key] === undefined || patch[key] === run[key]) continue;
        if (typeof patch[key] !== 'boolean') throw bad('ข้อมูลไม่ถูกต้อง');
        if (locked) throw new AppError(409, 'RUN_LOCKED', 'เปลี่ยนรูปแบบการลงทะเบียนหรือการอนุมัติไม่ได้ เพราะมีผู้ลงทะเบียนแล้ว');
        data[key] = patch[key];
      }
      const opens = patch.registrationOpensAt === undefined ? run.registrationOpensAt : parseWhen(patch.registrationOpensAt, 'เวลาเปิดรับลงทะเบียน');
      const closes = patch.registrationClosesAt === undefined ? run.registrationClosesAt : parseWhen(patch.registrationClosesAt, 'เวลาปิดรับลงทะเบียน');
      if (opens && closes && closes <= opens) throw bad('เวลาปิดรับต้องอยู่หลังเวลาเปิดรับ');
      if (patch.registrationOpensAt !== undefined) data['registrationOpensAt'] = opens;
      if (patch.registrationClosesAt !== undefined) data['registrationClosesAt'] = closes;
      const perSession = (data['perSessionRegistration'] as boolean | undefined) ?? run.perSessionRegistration;
      if (patch.capacity !== undefined || data['perSessionRegistration'] !== undefined) {
        if (perSession) {
          if (run.sessions.some((s) => !positive(s.capacity))) throw bad('กรุณาระบุจำนวนที่นั่งของทุกวันเรียนก่อนเปลี่ยนเป็นลงทะเบียนรายวัน');
          data['capacity'] = null;
        } else {
          const capacity = patch.capacity !== undefined ? patch.capacity : run.capacity;
          if (!positive(capacity)) throw bad('กรุณาระบุจำนวนที่นั่ง (1–5000)', { capacity: 'กรุณาระบุจำนวนที่นั่ง' });
          const held = await reserved(tx, actor.organizationId, { runId, sessionId: null });
          if (capacity < held) throw new AppError(409, 'CAPACITY_BELOW_RESERVED', `ลดที่นั่งต่ำกว่าจำนวนที่ถูกจองแล้ว (${held}) ไม่ได้`);
          data['capacity'] = capacity;
        }
      }
      if (!Object.keys(data).length) throw bad('ไม่มีข้อมูลที่เปลี่ยนแปลง');
      await tx.courseRun.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: runId } }, data });
      if (data['capacity'] !== undefined && !perSession) await this.queue.fill(tx, actor, runId, null, this.clock.now());
      await this.audit.record(tx, actor, { action: 'run.update', entity: 'course_run', entityId: runId, fields: Object.keys(data) });
      return this.runRecord(tx, actor.organizationId, runId);
    });
  }
  async deleteRun(actor: StaffActor, runId: string): Promise<{ id: string; deleted: true }> {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'เฉพาะผู้ดูแลระบบลบรอบได้');
    return this.lock.withRun(actor.organizationId, runId, async (tx) => {
      const run = await tx.courseRun.findFirstOrThrow({ where: { organizationId: actor.organizationId, id: runId } });
      const live = await tx.registration.count({ where: { organizationId: actor.organizationId, runId, OR: [{ status: { in: [...ACTIVE] } }, { entries: { some: { status: { in: [...ACTIVE] } } } }] } });
      if (run.status !== 'cancelled' && live) throw new AppError(409, 'CANCEL_FIRST', 'รอบนี้ยังมีผู้ลงทะเบียน กรุณายกเลิกรอบก่อนลบ เพื่อแจ้งผู้ลงทะเบียนทุกคน');
      await tx.courseRun.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: runId } }, data: { deletedAt: this.clock.now() } });
      await this.audit.record(tx, actor, { action: 'run.delete', entity: 'course_run', entityId: runId, fields: ['deletedAt'] });
      return { id: runId, deleted: true as const };
    });
  }
  async replaceRunQuestions(actor: StaffActor, runId: string, inputs: QuestionInput[]): Promise<RunRecord> {
    return this.lock.withRun(actor.organizationId, runId, async (tx) => {
      const run = await tx.courseRun.findFirstOrThrow({ where: { organizationId: actor.organizationId, id: runId } });
      const locked = run.structureLocked || (await tx.registration.count({ where: { organizationId: actor.organizationId, runId } })) > 0;
      await this.questions.replaceRun(tx, actor, runId, inputs, locked);
      return this.runRecord(tx, actor.organizationId, runId);
    });
  }

  // ---- sessions ------------------------------------------------------------------------------------------
  async addSession(actor: StaffActor, runId: string, input: SessionInput): Promise<RunRecord> {
    return this.lock.withRun(actor.organizationId, runId, async (tx) => {
      const run = await tx.courseRun.findFirstOrThrow({ where: { organizationId: actor.organizationId, id: runId } });
      if (run.status === 'cancelled') throw new AppError(409, 'RUN_CANCELLED', 'รอบนี้ถูกยกเลิกแล้ว');
      if (run.structureLocked || (await tx.registration.count({ where: { organizationId: actor.organizationId, runId } })) > 0) throw new AppError(409, 'RUN_LOCKED', 'เพิ่มวันเรียนไม่ได้ เพราะมีผู้ลงทะเบียนแล้ว');
      await tx.courseSession.create({ data: { ...cleanSession(input, run.perSessionRegistration), organizationId: actor.organizationId, runId, dayNo: 0 } });
      await this.renumber(tx, actor.organizationId, runId);
      await this.audit.record(tx, actor, { action: 'session.create', entity: 'course_run', entityId: runId, fields: ['date', 'startTime', 'endTime', 'capacity'] });
      return this.runRecord(tx, actor.organizationId, runId);
    });
  }
  private async runOf(actor: StaffActor, sessionId: string): Promise<string> {
    const s = await this.db.courseSession.findFirst({ where: { organizationId: actor.organizationId, id: sessionId }, select: { runId: true } });
    if (!s) throw new AppError(404, 'NOT_FOUND', 'ไม่พบวันเรียน');
    return s.runId;
  }
  private async renumber(tx: Tx, organizationId: string, runId: string): Promise<void> {
    const rows = await tx.courseSession.findMany({ where: { organizationId, runId }, orderBy: { startsAt: 'asc' } });
    for (const [index, row] of rows.entries()) if (row.dayNo !== index + 1) await tx.courseSession.update({ where: { organizationId_id: { organizationId, id: row.id } }, data: { dayNo: index + 1 } });
  }
  async deleteSession(actor: StaffActor, sessionId: string): Promise<RunRecord> {
    const runId = await this.runOf(actor, sessionId);
    return this.lock.withRun(actor.organizationId, runId, async (tx) => {
      const run = await tx.courseRun.findFirstOrThrow({ where: { organizationId: actor.organizationId, id: runId } });
      if (run.structureLocked || (await tx.registration.count({ where: { organizationId: actor.organizationId, runId } })) > 0) throw new AppError(409, 'RUN_LOCKED', 'ลบวันเรียนไม่ได้ เพราะมีผู้ลงทะเบียนแล้ว ใช้การยกเลิกวันเรียนแทน');
      if ((await tx.courseSession.count({ where: { organizationId: actor.organizationId, runId } })) <= 1) throw bad('รอบต้องมีวันเรียนอย่างน้อย 1 วัน');
      await tx.courseSession.delete({ where: { organizationId_id: { organizationId: actor.organizationId, id: sessionId } } });
      await this.renumber(tx, actor.organizationId, runId);
      await this.audit.record(tx, actor, { action: 'session.delete', entity: 'course_run', entityId: runId, fields: ['date'] });
      return this.runRecord(tx, actor.organizationId, runId);
    });
  }
  async updateSession(actor: StaffActor, sessionId: string, patch: SessionPatch): Promise<RunRecord> {
    if (!patch || typeof patch !== 'object' || Object.keys(patch).some((k) => !['location', 'onlineUrl', 'capacity'].includes(k))) throw bad('แก้ไขได้เฉพาะสถานที่ ลิงก์ออนไลน์ และจำนวนที่นั่ง ใช้การเลื่อนวันสำหรับเปลี่ยนวันเวลา');
    const runId = await this.runOf(actor, sessionId);
    return this.lock.withRun(actor.organizationId, runId, async (tx) => {
      const run = await tx.courseRun.findFirstOrThrow({ where: { organizationId: actor.organizationId, id: runId } });
      const session = await tx.courseSession.findFirstOrThrow({ where: { organizationId: actor.organizationId, id: sessionId } });
      if (run.status === 'cancelled' || session.status === 'cancelled') throw new AppError(409, 'SESSION_CANCELLED', 'วันเรียนนี้ถูกยกเลิกแล้ว');
      const data: Record<string, unknown> = {};
      if (patch.location !== undefined) { if (typeof patch.location !== 'string' || patch.location.length > 200) throw bad('สถานที่ยาวเกินไป'); data['location'] = patch.location.trim(); }
      if (patch.onlineUrl !== undefined) { if (patch.onlineUrl && !/^https?:\/\/\S{3,500}$/.test(patch.onlineUrl)) throw bad('ลิงก์ออนไลน์ไม่ถูกต้อง'); data['onlineUrl'] = patch.onlineUrl.trim(); }
      if (patch.capacity !== undefined) {
        if (!run.perSessionRegistration) throw bad('จำนวนที่นั่งของรอบนี้กำหนดที่ระดับรอบ ไม่ใช่รายวัน');
        if (!positive(patch.capacity)) throw bad('จำนวนที่นั่งต้องอยู่ระหว่าง 1–5000');
        const held = await reserved(tx, actor.organizationId, { runId, sessionId });
        if (patch.capacity < held) throw new AppError(409, 'CAPACITY_BELOW_RESERVED', `ลดที่นั่งต่ำกว่าจำนวนที่ถูกจองแล้ว (${held}) ไม่ได้`);
        data['capacity'] = patch.capacity;
      }
      if (!Object.keys(data).length) throw bad('ไม่มีข้อมูลที่เปลี่ยนแปลง');
      await tx.courseSession.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: sessionId } }, data });
      if (data['capacity'] !== undefined) await this.queue.fill(tx, actor, runId, sessionId, this.clock.now());
      await this.audit.record(tx, actor, { action: 'session.update', entity: 'course_session', entityId: sessionId, fields: Object.keys(data) });
      return this.runRecord(tx, actor.organizationId, runId);
    });
  }

  /** Members to tell about a session change: everyone registered or waiting on it. */
  private async affected(tx: Tx, organizationId: string, run: { id: string; perSessionRegistration: boolean }, sessionId: string | null): Promise<Array<{ memberId: string; registrationId: string }>> {
    if (run.perSessionRegistration && sessionId) {
      const rows = await tx.registrationSession.findMany({ where: { organizationId, sessionId, status: { in: [...ACTIVE] } }, include: { registration: { select: { memberId: true } } } });
      return rows.map((r) => ({ memberId: r.registration.memberId, registrationId: r.registrationId }));
    }
    const rows = await tx.registration.findMany({ where: { organizationId, runId: run.id, OR: [{ status: { in: [...ACTIVE] } }, { entries: { some: { status: { in: [...ACTIVE] } } } }] }, select: { id: true, memberId: true } });
    return rows.map((r) => ({ memberId: r.memberId, registrationId: r.id }));
  }
  private async tell(tx: Tx, actor: StaffActor, kind: 'session.cancelled' | 'run.cancelled' | 'session.rescheduled', people: Array<{ memberId: string; registrationId: string }>, sessionIds: string[]): Promise<void> {
    for (const person of people)
      await this.outbox.enqueue(tx, actor, { eventId: randomUUID(), kind, recipient: { kind: 'member', memberId: person.memberId }, entityRefs: { registrationIds: [person.registrationId], sessionIds } });
  }
  async reschedule(actor: StaffActor, sessionId: string, input: { date: string; startTime: string; endTime: string }): Promise<RunRecord> {
    const runId = await this.runOf(actor, sessionId);
    const next = cleanSession({ ...input, capacity: 1 }, false);
    return this.lock.withRun(actor.organizationId, runId, async (tx) => {
      const run = await tx.courseRun.findFirstOrThrow({ where: { organizationId: actor.organizationId, id: runId }, include: { sessions: true } });
      const session = run.sessions.find((s) => s.id === sessionId)!;
      if (run.status === 'cancelled' || session.status === 'cancelled') throw new AppError(409, 'SESSION_CANCELLED', 'วันเรียนนี้ถูกยกเลิกแล้ว');
      if (session.date === next.date && session.startTime === next.startTime && session.endTime === next.endTime) throw bad('วันเวลาใหม่เหมือนเดิม');
      const now = this.clock.now();
      const existing = selfCancelDeadline(run, run.sessions as PolicySession[], session as PolicySession);
      const override = rescheduleDeadline(existing, now, next.startsAt);
      await tx.courseSession.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: sessionId } }, data: { date: next.date, startTime: next.startTime, endTime: next.endTime, startsAt: next.startsAt, endsAt: next.endsAt, rescheduledAt: now, cancelDeadlineOverride: override } });
      await this.renumber(tx, actor.organizationId, runId);
      await this.tell(tx, actor, 'session.rescheduled', await this.affected(tx, actor.organizationId, run, sessionId), [sessionId]);
      await this.audit.record(tx, actor, { action: 'session.reschedule', entity: 'course_session', entityId: sessionId, fields: ['date', 'startTime', 'endTime'] });
      return this.runRecord(tx, actor.organizationId, runId);
    });
  }
  async cancelSession(actor: StaffActor, sessionId: string, reason: unknown): Promise<RunRecord> {
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) throw bad('กรุณาระบุเหตุผลที่ยกเลิก', { reason: 'กรุณาระบุเหตุผล' });
    const runId = await this.runOf(actor, sessionId);
    return this.lock.withRun(actor.organizationId, runId, async (tx) => {
      const run = await tx.courseRun.findFirstOrThrow({ where: { organizationId: actor.organizationId, id: runId } });
      const session = await tx.courseSession.findFirstOrThrow({ where: { organizationId: actor.organizationId, id: sessionId } });
      if (run.status === 'cancelled' || session.status === 'cancelled') throw new AppError(409, 'SESSION_CANCELLED', 'วันเรียนนี้ถูกยกเลิกแล้ว');
      const people = await this.affected(tx, actor.organizationId, run, sessionId);
      const now = this.clock.now();
      await tx.courseSession.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: sessionId } }, data: { status: 'cancelled', cancelledAt: now, cancelReasonEncrypted: this.crypto.encrypt(reason.trim()) as never } });
      if (run.perSessionRegistration)
        await tx.registrationSession.updateMany({ where: { organizationId: actor.organizationId, sessionId, status: { in: [...ACTIVE] } }, data: { status: 'cancelled', cancelReason: 'organization', cancelledAt: now, queueSeq: null } });
      await tx.courseRun.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: runId } }, data: { structureLocked: true } });
      await this.tell(tx, actor, 'session.cancelled', people, [sessionId]);
      await this.audit.record(tx, actor, { action: 'session.cancel', entity: 'course_session', entityId: sessionId, fields: ['status'] });
      return this.runRecord(tx, actor.organizationId, runId);
    });
  }
  async cancelRun(actor: StaffActor, runId: string, reason: unknown): Promise<RunRecord> {
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) throw bad('กรุณาระบุเหตุผลที่ยกเลิก', { reason: 'กรุณาระบุเหตุผล' });
    return this.lock.withRun(actor.organizationId, runId, async (tx) => {
      const run = await tx.courseRun.findFirstOrThrow({ where: { organizationId: actor.organizationId, id: runId } });
      if (run.status === 'cancelled') throw new AppError(409, 'RUN_CANCELLED', 'รอบนี้ถูกยกเลิกแล้ว');
      const people = await this.affected(tx, actor.organizationId, { id: runId, perSessionRegistration: false }, null);
      const now = this.clock.now();
      await tx.registration.updateMany({ where: { organizationId: actor.organizationId, runId, status: { in: [...ACTIVE] } }, data: { status: 'cancelled', cancelReason: 'organization', cancelledAt: now, queueSeq: null } });
      await tx.registrationSession.updateMany({ where: { organizationId: actor.organizationId, registration: { runId }, status: { in: [...ACTIVE] } }, data: { status: 'cancelled', cancelReason: 'organization', cancelledAt: now, queueSeq: null } });
      await tx.courseSession.updateMany({ where: { organizationId: actor.organizationId, runId, status: 'scheduled' }, data: { status: 'cancelled', cancelledAt: now } });
      await tx.courseRun.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: runId } }, data: { status: 'cancelled', cancelledAt: now, structureLocked: true } });
      await this.tell(tx, actor, 'run.cancelled', people, []);
      await this.audit.record(tx, actor, { action: 'run.cancel', entity: 'course_run', entityId: runId, fields: ['status'] });
      return this.runRecord(tx, actor.organizationId, runId);
    });
  }
}
