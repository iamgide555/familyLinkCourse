import { Inject, Injectable } from '@nestjs/common';
import type { StaffActor } from '../../../../packages/contracts/src/core.js';
import type { LibraryQuestion, QuestionDefinition, QuestionInput, QuestionOption } from '../../../../packages/contracts/src/questions.js';
import { PrismaService, type Tx } from '../database/prisma.service.js';
import { AppError } from '../common/errors.js';
import { Audit } from '../audit/audit.service.js';
import { cleanQuestion } from './question-validation.js';

type Row = { id: string; label: string; type: string; options: unknown; required?: boolean; sensitive: boolean; position?: number };
export const toDefinition = (row: Row): QuestionDefinition => ({
  id: row.id, label: row.label, type: row.type as QuestionDefinition['type'], options: (row.options ?? []) as QuestionOption[],
  required: !!row.required, sensitive: row.sensitive, position: row.position ?? 0,
});
const locked = (message: string) => new AppError(409, 'RUN_LOCKED', message);

@Injectable()
export class Questions {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Audit) private readonly audit: Audit,
  ) {}

  // ---- shared library ------------------------------------------------------------------------------------
  async library(actor: StaffActor): Promise<{ items: LibraryQuestion[] }> {
    const rows = await this.db.questionLibrary.findMany({ where: { organizationId: actor.organizationId }, orderBy: { createdAt: 'asc' } });
    return { items: rows.map((r) => ({ id: r.id, label: r.label, type: r.type as LibraryQuestion['type'], options: r.options as QuestionOption[], sensitive: r.sensitive, active: r.active })) };
  }
  async createLibrary(actor: StaffActor, input: QuestionInput): Promise<LibraryQuestion> {
    const q = cleanQuestion({ ...input, required: false });
    return this.db.$transaction(async (tx) => {
      const row = await tx.questionLibrary.create({ data: { organizationId: actor.organizationId, label: q.label, type: q.type, options: q.options as never, sensitive: q.sensitive } });
      await this.audit.record(tx, actor, { action: 'question_library.create', entity: 'question_library', entityId: row.id, fields: ['name'] });
      return { id: row.id, label: row.label, type: q.type, options: q.options, sensitive: row.sensitive, active: row.active };
    });
  }
  async updateLibrary(actor: StaffActor, id: string, patch: { label?: string; active?: boolean }): Promise<LibraryQuestion> {
    return this.db.$transaction(async (tx) => {
      const row = await tx.questionLibrary.findFirst({ where: { organizationId: actor.organizationId, id } });
      if (!row) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำถามในคลัง');
      const label = patch.label === undefined ? row.label : patch.label.trim();
      if (!label || label.length > 300) throw new AppError(422, 'INVALID_INPUT', 'กรุณาระบุคำถาม');
      const updated = await tx.questionLibrary.update({ where: { organizationId_id: { organizationId: actor.organizationId, id } }, data: { label, ...(typeof patch.active === 'boolean' ? { active: patch.active } : {}) } });
      await this.audit.record(tx, actor, { action: 'question_library.update', entity: 'question_library', entityId: id, fields: ['name'] });
      return { id, label: updated.label, type: updated.type as LibraryQuestion['type'], options: updated.options as QuestionOption[], sensitive: updated.sensitive, active: updated.active };
    });
  }

  // ---- course defaults -----------------------------------------------------------------------------------
  async courseQuestions(tx: Tx, organizationId: string, courseId: string): Promise<QuestionDefinition[]> {
    return (await tx.courseQuestion.findMany({ where: { organizationId, courseId }, orderBy: { position: 'asc' } })).map(toDefinition);
  }
  async replaceCourse(actor: StaffActor, courseId: string, inputs: QuestionInput[]): Promise<QuestionDefinition[]> {
    if (!Array.isArray(inputs) || inputs.length > 60) throw new AppError(422, 'INVALID_INPUT', 'รายการคำถามไม่ถูกต้อง');
    const cleaned = inputs.map((input) => cleanQuestion(input));
    return this.db.$transaction(async (tx) => {
      if (!(await tx.course.findFirst({ where: { organizationId: actor.organizationId, id: courseId, deletedAt: null } }))) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคอร์ส');
      await this.assertLibrary(tx, actor.organizationId, cleaned.map((c) => c.libraryQuestionId));
      const existing = await tx.courseQuestion.findMany({ where: { organizationId: actor.organizationId, courseId } });
      const keep = new Set(cleaned.map((c) => c.id).filter(Boolean));
      if (cleaned.some((c) => c.id && !existing.some((e) => e.id === c.id))) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำถามที่ต้องการแก้ไข');
      await tx.courseQuestion.deleteMany({ where: { organizationId: actor.organizationId, courseId, id: { notIn: [...keep] as string[] } } });
      for (const [position, q] of cleaned.entries()) {
        const data = { label: q.label, type: q.type, options: q.options as never, required: q.required, sensitive: q.sensitive, position, libraryQuestionId: q.libraryQuestionId };
        if (q.id) await tx.courseQuestion.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: q.id } }, data });
        else await tx.courseQuestion.create({ data: { ...data, organizationId: actor.organizationId, courseId } });
      }
      await this.audit.record(tx, actor, { action: 'course.questions', entity: 'course', entityId: courseId, fields: ['fields'] });
      return this.courseQuestions(tx, actor.organizationId, courseId);
    });
  }
  private async assertLibrary(tx: Tx, organizationId: string, ids: Array<string | null>): Promise<void> {
    const wanted = [...new Set(ids.filter((id): id is string => !!id))];
    if (wanted.length && (await tx.questionLibrary.count({ where: { organizationId, id: { in: wanted } } })) !== wanted.length) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำถามในคลัง');
  }

  // ---- run forms -----------------------------------------------------------------------------------------
  async runQuestions(tx: Tx, organizationId: string, runId: string): Promise<QuestionDefinition[]> {
    return (await tx.runQuestion.findMany({ where: { organizationId, runId }, orderBy: { position: 'asc' } })).map(toDefinition);
  }
  /** Copies the course defaults into a new run; later course or library edits never reach it. */
  async copyToRun(tx: Tx, organizationId: string, courseId: string, runId: string): Promise<void> {
    const rows = await tx.courseQuestion.findMany({ where: { organizationId, courseId }, orderBy: { position: 'asc' } });
    for (const [position, row] of rows.entries())
      await tx.runQuestion.create({ data: { organizationId, runId, courseQuestionId: row.id, label: row.label, type: row.type, options: (row.options as QuestionOption[]).map((o) => ({ ...o })) as never, required: row.required, sensitive: row.sensitive, position } });
  }
  /**
   * Replaces a run's ordered question list. Once the run is locked by its first booking only safe edits pass:
   * wording, order, new optional questions, appended options, and relaxing required to optional.
   * The caller holds the run lock.
   */
  async replaceRun(tx: Tx, actor: StaffActor, runId: string, inputs: QuestionInput[], isLocked: boolean): Promise<QuestionDefinition[]> {
    if (!Array.isArray(inputs) || inputs.length > 60) throw new AppError(422, 'INVALID_INPUT', 'รายการคำถามไม่ถูกต้อง');
    const cleaned = inputs.map((input) => cleanQuestion(input));
    await this.assertLibrary(tx, actor.organizationId, cleaned.map((c) => c.libraryQuestionId));
    const existing = await tx.runQuestion.findMany({ where: { organizationId: actor.organizationId, runId } });
    const byId = new Map(existing.map((e) => [e.id, e]));
    if (cleaned.some((c) => c.id && !byId.has(c.id))) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำถามที่ต้องการแก้ไข');
    const keep = new Set(cleaned.map((c) => c.id).filter(Boolean));
    if (isLocked) {
      if (existing.some((e) => !keep.has(e.id))) throw locked('ลบคำถามไม่ได้ เพราะมีผู้ลงทะเบียนแล้ว');
      for (const q of cleaned) {
        if (!q.id) {
          if (q.required) throw locked('เพิ่มคำถามบังคับตอบไม่ได้ เพราะมีผู้ลงทะเบียนแล้ว เพิ่มเป็นคำถามไม่บังคับแทน');
          continue;
        }
        const old = byId.get(q.id)!;
        if (old.type !== q.type) throw locked('เปลี่ยนประเภทคำถามไม่ได้ เพราะมีผู้ลงทะเบียนแล้ว');
        if (old.sensitive !== q.sensitive) throw locked('เปลี่ยนการตั้งค่าข้อมูลอ่อนไหวไม่ได้ เพราะมีผู้ลงทะเบียนแล้ว');
        if (!old.required && q.required) throw locked('เปลี่ยนคำถามเป็นบังคับตอบไม่ได้ เพราะมีผู้ลงทะเบียนแล้ว');
        const oldOptions = old.options as QuestionOption[];
        const next = new Map(q.options.map((o) => [o.id, o.label]));
        if (oldOptions.some((o) => !next.has(o.id))) throw locked('ลบตัวเลือกไม่ได้ เพราะมีผู้ลงทะเบียนแล้ว เพิ่มตัวเลือกใหม่ได้เท่านั้น');
      }
    }
    await tx.runQuestion.deleteMany({ where: { organizationId: actor.organizationId, runId, id: { notIn: [...keep] as string[] } } });
    for (const [position, q] of cleaned.entries()) {
      const data = { label: q.label, type: q.type, options: q.options as never, required: q.required, sensitive: q.sensitive, position };
      if (q.id) await tx.runQuestion.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: q.id } }, data });
      else await tx.runQuestion.create({ data: { ...data, organizationId: actor.organizationId, runId, courseQuestionId: null } });
    }
    await this.audit.record(tx, actor, { action: 'run.questions', entity: 'course_run', entityId: runId, fields: ['fields'] });
    return this.runQuestions(tx, actor.organizationId, runId);
  }
}
