import { Inject, Injectable } from '@nestjs/common';
import type {
  CaseNote as StoredNote,
  CaseNoteRevision as StoredRevision,
} from '../generated/prisma/client.js';
import type { Id, StaffActor } from '../../../../packages/contracts/src/core.js';
import type { CaseNote, CaseNoteRevision } from '../../../../packages/contracts/src/case-notes.js';
import { PrismaService } from '../database/prisma.service.js';
import { FieldCrypto, type EncryptedValue } from '../crypto/field-crypto.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { Audit } from '../audit/audit.service.js';

type NoteWithAuthor = StoredNote & { author: { name: string } };
type RevisionWithAuthor = StoredRevision & { author: { name: string } };
const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class CaseNotes {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
  ) {}

  private requireStaff(actor: StaffActor): void {
    if (actor.kind !== 'staff' || !actor.userId || !['admin', 'staff'].includes(actor.role))
      throw new AppError(403, 'FORBIDDEN', 'รายการนี้สำหรับเจ้าหน้าที่เท่านั้น');
  }

  private text(body: string): string {
    if (typeof body !== 'string' || !body.trim() || body.trim().length > 10000)
      throw new AppError(422, 'INVALID_INPUT', 'กรุณาระบุบันทึกไม่เกิน 10,000 ตัวอักษร');
    return body.trim();
  }

  private note(row: NoteWithAuthor): CaseNote {
    return {
      id: row.id,
      memberId: row.memberId,
      body: this.crypto.decrypt(row.bodyEncrypted as EncryptedValue),
      authorId: row.authorId,
      authorName: row.author.name,
      currentVersion: row.currentVersion,
      createdAt: row.createdAt.toISOString(),
      editedAt: row.editedAt?.toISOString() ?? null,
    };
  }

  private revision(row: RevisionWithAuthor): CaseNoteRevision {
    return {
      id: row.id,
      caseNoteId: row.caseNoteId,
      version: row.version,
      body: this.crypto.decrypt(row.bodyEncrypted as EncryptedValue),
      createdBy: row.createdBy,
      createdByName: row.author.name,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async create(actor: StaffActor, memberId: Id, body: string): Promise<CaseNote> {
    this.requireStaff(actor);
    const text = this.text(body);
    return this.db.$transaction(async (tx) => {
      const member = await tx.member.findFirst({
        where: { id: memberId, organizationId: actor.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      const now = this.clock.now();
      const encrypted = this.crypto.encrypt(text);
      const saved = await tx.caseNote.create({
        data: {
          organizationId: actor.organizationId,
          memberId,
          authorId: actor.userId,
          bodyEncrypted: encrypted,
          createdAt: now,
        },
        include: { author: { select: { name: true } } },
      });
      await tx.caseNoteRevision.create({
        data: {
          organizationId: actor.organizationId,
          caseNoteId: saved.id,
          version: 1,
          bodyEncrypted: encrypted,
          createdBy: actor.userId,
          createdAt: now,
        },
      });
      await this.audit.record(tx, actor, {
        action: 'case_note.create',
        entity: 'case_note',
        entityId: saved.id,
        fields: ['body'],
      });
      return this.note(saved);
    });
  }

  async list(actor: StaffActor, memberId: Id): Promise<CaseNote[]> {
    this.requireStaff(actor);
    return this.db.$transaction(async (tx) => {
      const member = await tx.member.findFirst({
        where: { id: memberId, organizationId: actor.organizationId, deletedAt: null },
        select: { id: true },
      });
      if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      const notes = await tx.caseNote.findMany({
        where: { organizationId: actor.organizationId, memberId, deletedAt: null },
        include: { author: { select: { name: true } } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      });
      await this.audit.record(tx, actor, {
        action: 'case_note.list_view',
        entity: 'member',
        entityId: memberId,
        fields: ['body'],
      });
      return notes.map((row) => this.note(row));
    });
  }

  async edit(actor: StaffActor, noteId: Id, body: string): Promise<CaseNote> {
    this.requireStaff(actor);
    const text = this.text(body);
    return this.db.$transaction(async (tx) => {
      // A row lock serializes version allocation and the current-body update.
      await tx.$queryRaw`SELECT id FROM case_notes WHERE id = ${noteId} AND organization_id = ${actor.organizationId} FOR UPDATE`;
      const current = await tx.caseNote.findFirst({
        where: {
          id: noteId,
          organizationId: actor.organizationId,
          deletedAt: null,
          member: { deletedAt: null },
        },
      });
      if (!current) throw new AppError(404, 'NOT_FOUND', 'ไม่พบบันทึก');
      if (current.authorId !== actor.userId)
        throw new AppError(403, 'FORBIDDEN', 'แก้ไขได้เฉพาะบันทึกที่ตนเองเขียน');
      const now = this.clock.now();
      if (now.getTime() - current.createdAt.getTime() >= EDIT_WINDOW_MS)
        throw new AppError(403, 'EDIT_WINDOW_CLOSED', 'แก้ไขได้ภายใน 24 ชั่วโมงหลังสร้างบันทึก');
      const encrypted = this.crypto.encrypt(text);
      const version = current.currentVersion + 1;
      await tx.caseNoteRevision.create({
        data: {
          organizationId: actor.organizationId,
          caseNoteId: noteId,
          version,
          bodyEncrypted: encrypted,
          createdBy: actor.userId,
          createdAt: now,
        },
      });
      const updated = await tx.caseNote.update({
        where: { organizationId_id: { organizationId: actor.organizationId, id: noteId } },
        data: { bodyEncrypted: encrypted, currentVersion: version, editedAt: now },
        include: { author: { select: { name: true } } },
      });
      await this.audit.record(tx, actor, {
        action: 'case_note.edit',
        entity: 'case_note',
        entityId: noteId,
        fields: ['body'],
      });
      return this.note(updated);
    });
  }

  async history(actor: StaffActor, noteId: Id): Promise<CaseNoteRevision[]> {
    this.requireStaff(actor);
    return this.db.$transaction(async (tx) => {
      const note = await tx.caseNote.findFirst({
        where: {
          id: noteId,
          organizationId: actor.organizationId,
          deletedAt: null,
          member: { deletedAt: null },
        },
        select: { id: true },
      });
      if (!note) throw new AppError(404, 'NOT_FOUND', 'ไม่พบบันทึก');
      const rows = await tx.caseNoteRevision.findMany({
        where: { organizationId: actor.organizationId, caseNoteId: noteId },
        include: { author: { select: { name: true } } },
        orderBy: { version: 'asc' },
      });
      await this.audit.record(tx, actor, {
        action: 'case_note.history_view',
        entity: 'case_note',
        entityId: noteId,
        fields: ['body'],
      });
      return rows.map((row) => this.revision(row));
    });
  }

  async delete(actor: StaffActor, noteId: Id): Promise<void> {
    this.requireStaff(actor);
    if (actor.role !== 'admin')
      throw new AppError(403, 'FORBIDDEN', 'รายการนี้ต้องให้ผู้ดูแลระบบดำเนินการ');
    await this.db.$transaction(async (tx) => {
      const note = await tx.caseNote.findFirst({
        where: {
          id: noteId,
          organizationId: actor.organizationId,
          deletedAt: null,
          member: { deletedAt: null },
        },
        select: { id: true },
      });
      if (!note) throw new AppError(404, 'NOT_FOUND', 'ไม่พบบันทึก');
      await tx.caseNote.update({
        where: { organizationId_id: { organizationId: actor.organizationId, id: noteId } },
        data: { deletedAt: this.clock.now() },
      });
      await this.audit.record(tx, actor, {
        action: 'case_note.delete',
        entity: 'case_note',
        entityId: noteId,
        fields: ['deletedAt'],
      });
    });
  }
}
