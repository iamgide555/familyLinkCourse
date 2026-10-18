import type { Request } from 'express';
import { Inject, Injectable } from '@nestjs/common';
import type { StaffActor } from '../../../../packages/contracts/src/core.js';
import type { DocumentReceipt } from '../../../../packages/contracts/src/documents.js';
import type { ConsentInput, SignupContext } from '../../../../packages/contracts/src/signup.js';
import { PrismaService } from '../database/prisma.service.js';
import { FieldCrypto, type EncryptedValue } from '../crypto/field-crypto.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { Audit } from '../audit/audit.service.js';
import { hashToken, mintToken } from '../signup/invites.service.js';
import { sanitizeUpload } from './document-processor.js';
import { FileStore } from './file-store.js';
import { MAX_FILES_PER_DRAFT, MAX_UPLOAD_BYTES, detectMime } from './upload-policy.js';

const DAY = 24 * 60 * 60 * 1000;
type DraftRow = NonNullable<Awaited<ReturnType<PrismaService['signupDraft']['findFirst']>>>;
type DocRow = Awaited<ReturnType<PrismaService['memberDocument']['findFirstOrThrow']>>;

/** Reads at most MAX_UPLOAD_BYTES+1 bytes so an oversize body is refused without buffering all of it. */
export async function readLimitedBody(req: Request): Promise<Buffer> {
  const declared = Number(req.headers['content-length'] ?? 0);
  if (declared > MAX_UPLOAD_BYTES) throw new AppError(413, 'FILE_TOO_LARGE', 'ไฟล์ใหญ่เกิน 10 MB');
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const part = chunk as Buffer;
    total += part.length;
    if (total > MAX_UPLOAD_BYTES) {
      req.destroy();
      throw new AppError(413, 'FILE_TOO_LARGE', 'ไฟล์ใหญ่เกิน 10 MB');
    }
    chunks.push(part);
  }
  if (!total) throw new AppError(422, 'EMPTY_FILE', 'ไม่พบไฟล์ที่ต้องการอัปโหลด');
  return Buffer.concat(chunks);
}

@Injectable()
export class Documents {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
    @Inject(FileStore) private readonly files: FileStore,
  ) {}

  private owner(context: SignupContext): { orgId: string; kind: 'line' | 'invite'; id: string } {
    if (context.kind === 'line') return { orgId: context.actor.organizationId, kind: 'line', id: context.actor.lineAccountId };
    if (!context.inviteToken) throw new AppError(401, 'INVITE_REQUIRED', 'กรุณาใช้ลิงก์สมัครสมาชิก');
    return { orgId: context.organizationId, kind: 'invite', id: hashToken(context.inviteToken) };
  }
  private async requireDraft(context: SignupContext, draftId: string, draftToken: string): Promise<DraftRow> {
    const owner = this.owner(context);
    if (typeof draftId !== 'string' || typeof draftToken !== 'string' || !draftToken)
      throw new AppError(403, 'DRAFT_FORBIDDEN', 'ไม่สามารถใช้เอกสารนี้');
    const draft = await this.db.signupDraft.findFirst({ where: {
      organizationId: owner.orgId, id: draftId, tokenHash: hashToken(draftToken),
      ownerKind: owner.kind, ownerId: owner.id, consumedAt: null, expiresAt: { gt: this.clock.now() },
    } });
    if (!draft) throw new AppError(403, 'DRAFT_FORBIDDEN', 'ไม่สามารถใช้เอกสารนี้');
    return draft;
  }

  async beginDraft(context: SignupContext): Promise<{ draftId: string; draftToken: string }> {
    const owner = this.owner(context);
    if (owner.kind === 'invite') {
      const invite = await this.db.signupInvite.findFirst({ where: {
        organizationId: owner.orgId, tokenHash: owner.id, mode: 'signup', usedAt: null, expiresAt: { gt: this.clock.now() },
      } });
      if (!invite) throw new AppError(409, 'INVITE_UNAVAILABLE', 'ลิงก์หมดอายุหรือถูกใช้แล้ว');
    }
    const draftToken = mintToken();
    const draft = await this.db.signupDraft.create({ data: {
      organizationId: owner.orgId, ownerKind: owner.kind, ownerId: owner.id,
      tokenHash: hashToken(draftToken), expiresAt: new Date(this.clock.now().getTime() + DAY),
    } });
    return { draftId: draft.id, draftToken };
  }

  async grantUploadConsent(context: SignupContext, draftId: string, draftToken: string, consent: ConsentInput): Promise<void> {
    const draft = await this.requireDraft(context, draftId, draftToken);
    const valid = !!consent && consent.granted === true && typeof consent.version === 'string' && !!consent.version.trim() &&
      ['self', 'guardian', 'caregiver'].includes(consent.consentedBy) &&
      (consent.consentedBy === 'self' || (!!consent.guardianName?.trim() && !!consent.guardianRelationship?.trim()));
    if (!valid) throw new AppError(422, 'UPLOAD_CONSENT_REQUIRED', 'กรุณายินยอมก่อนแนบเอกสาร');
    const recorded = {
      version: consent.version, consentedBy: consent.consentedBy,
      ...(consent.guardianName ? { guardianName: consent.guardianName } : {}),
      ...(consent.guardianRelationship ? { guardianRelationship: consent.guardianRelationship } : {}),
      purpose: 'sensitive_upload', granted: true, createdAt: this.clock.now().toISOString(),
    };
    await this.db.signupDraft.update({ where: { organizationId_id: { organizationId: draft.organizationId, id: draft.id } },
      data: { uploadConsentEncrypted: this.crypto.encrypt(JSON.stringify(recorded)) } });
  }

  private receipt(row: DocRow): DocumentReceipt {
    return { id: row.id, kind: row.kind, documentTypeId: row.documentTypeId, mime: row.mime, size: row.size,
      status: row.verifiedAt ? 'verified' : 'received', createdAt: row.createdAt.toISOString() };
  }
  private async checkType(orgId: string, documentTypeId: string | null): Promise<void> {
    if (!documentTypeId) return;
    const type = await this.db.documentType.findFirst({ where: { organizationId: orgId, id: documentTypeId, active: true } });
    if (!type) throw new AppError(422, 'INVALID_DOCUMENT_TYPE', 'กรุณาเลือกประเภทเอกสารที่เปิดใช้งาน');
  }
  private async store(orgId: string, raw: Buffer) {
    const mime = detectMime(raw);
    if (!mime) throw new AppError(415, 'UNSUPPORTED_FILE', 'รองรับเฉพาะไฟล์ JPG, PNG, HEIC และ PDF');
    const clean = await sanitizeUpload(raw, mime);
    return { clean, fileKey: await this.files.put(orgId, clean.bytes) };
  }

  /** Consent is verified before any request body is read. */
  async uploadToDraft(context: SignupContext, draftId: string, draftToken: string, documentTypeId: string | null, req: Request): Promise<DocumentReceipt> {
    const draft = await this.requireDraft(context, draftId, draftToken);
    if (!draft.uploadConsentEncrypted) throw new AppError(422, 'UPLOAD_CONSENT_REQUIRED', 'กรุณายินยอมก่อนแนบเอกสาร');
    await this.checkType(draft.organizationId, documentTypeId);
    const existing = await this.db.memberDocument.count({ where: { organizationId: draft.organizationId, draftId: draft.id, deletedAt: null } });
    if (existing >= MAX_FILES_PER_DRAFT) throw new AppError(422, 'TOO_MANY_FILES', `แนบเอกสารได้ไม่เกิน ${MAX_FILES_PER_DRAFT} ไฟล์`);
    const raw = await readLimitedBody(req);
    const { clean, fileKey } = await this.store(draft.organizationId, raw);
    try {
      const row = await this.db.memberDocument.create({ data: {
        organizationId: draft.organizationId, draftId: draft.id, documentTypeId, kind: 'online',
        fileKeyEncrypted: fileKey, mime: clean.mime, size: clean.bytes.length,
        uploadedByKind: 'member', uploadedById: draft.ownerId,
      } });
      return this.receipt(row);
    } catch (error) {
      await this.files.remove(fileKey);
      throw error;
    }
  }

  async listForMember(actor: StaffActor, memberId: string): Promise<{ items: DocumentReceipt[] }> {
    const member = await this.db.member.findFirst({ where: { organizationId: actor.organizationId, id: memberId, deletedAt: null } });
    if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
    const rows = await this.db.memberDocument.findMany({ where: { organizationId: actor.organizationId, memberId, deletedAt: null }, orderBy: { createdAt: 'asc' } });
    return { items: rows.map((row) => this.receipt(row)) };
  }

  async uploadForMember(actor: StaffActor, memberId: string, kind: 'document' | 'signed_form', documentTypeId: string | null, paperConsent: boolean, req: Request): Promise<DocumentReceipt> {
    if (kind === 'signed_form' && actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'เฉพาะผู้ดูแลระบบอัปโหลดเอกสารลงนามได้');
    if (!paperConsent) throw new AppError(422, 'UPLOAD_CONSENT_REQUIRED', 'กรุณายืนยันว่าได้รับความยินยอมจากสมาชิกแล้ว');
    const member = await this.db.member.findFirst({ where: { organizationId: actor.organizationId, id: memberId, deletedAt: null } });
    if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
    await this.checkType(actor.organizationId, documentTypeId);
    const raw = await readLimitedBody(req);
    const { clean, fileKey } = await this.store(actor.organizationId, raw);
    try {
      return await this.db.$transaction(async (tx) => {
        const row = await tx.memberDocument.create({ data: {
          organizationId: actor.organizationId, memberId, documentTypeId, kind,
          fileKeyEncrypted: fileKey, mime: clean.mime, size: clean.bytes.length,
          uploadedByKind: actor.role, uploadedById: actor.userId,
        } });
        await this.audit.record(tx, actor, { action: 'document.upload', entity: 'member_document', entityId: row.id, fields: ['fields'] });
        return this.receipt(row);
      });
    } catch (error) {
      await this.files.remove(fileKey);
      throw error;
    }
  }

  private async find(actor: StaffActor, documentId: string): Promise<DocRow> {
    const row = await this.db.memberDocument.findFirst({ where: { organizationId: actor.organizationId, id: documentId, deletedAt: null } });
    if (!row) throw new AppError(404, 'NOT_FOUND', 'ไม่พบเอกสาร');
    return row;
  }
  async download(actor: StaffActor, documentId: string): Promise<{ bytes: Buffer; mime: string }> {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'เฉพาะผู้ดูแลระบบเปิดเอกสารได้');
    const row = await this.find(actor, documentId);
    const bytes = await this.files.get(row.fileKeyEncrypted as EncryptedValue);
    await this.db.$transaction((tx) => this.audit.record(tx, actor, { action: 'document.view', entity: 'member_document', entityId: row.id, fields: ['fields'] }));
    return { bytes, mime: row.mime };
  }
  async verify(actor: StaffActor, documentId: string): Promise<DocumentReceipt> {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'เฉพาะผู้ดูแลระบบตรวจสอบเอกสารได้');
    const row = await this.find(actor, documentId);
    return this.db.$transaction(async (tx) => {
      const updated = await tx.memberDocument.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: row.id } }, data: { verifiedById: actor.userId, verifiedAt: this.clock.now() } });
      await this.audit.record(tx, actor, { action: 'document.verify', entity: 'member_document', entityId: row.id, fields: ['fields'] });
      return this.receipt(updated);
    });
  }
  async remove(actor: StaffActor, documentId: string): Promise<{ id: string; deleted: true }> {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'เฉพาะผู้ดูแลระบบลบเอกสารได้');
    const row = await this.find(actor, documentId);
    await this.db.$transaction(async (tx) => {
      await tx.memberDocument.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: row.id } }, data: { deletedAt: this.clock.now() } });
      await this.audit.record(tx, actor, { action: 'document.delete', entity: 'member_document', entityId: row.id, fields: ['fields'] });
    });
    await this.files.remove(row.fileKeyEncrypted as EncryptedValue);
    return { id: row.id, deleted: true };
  }

  /** Deletes matching documents and their encrypted files (retention and purge jobs only). */
  async purgeWhere(where: Parameters<PrismaService['memberDocument']['findMany']>[0] extends { where?: infer W } | undefined ? W : never): Promise<number> {
    const rows = await this.db.memberDocument.findMany({ where });
    for (const row of rows) await this.files.remove(row.fileKeyEncrypted as EncryptedValue);
    await this.db.memberDocument.deleteMany({ where: { id: { in: rows.map((r) => r.id) } } });
    return rows.length;
  }

  /** Removes unsubmitted drafts older than 24 hours with their staged files. Submitted files are untouched. */
  async cleanupExpiredDrafts(now: Date): Promise<number> {
    const drafts = await this.db.signupDraft.findMany({ where: { consumedAt: null, expiresAt: { lte: now } } });
    for (const draft of drafts) {
      const docs = await this.db.memberDocument.findMany({ where: { organizationId: draft.organizationId, draftId: draft.id } });
      for (const doc of docs) await this.files.remove(doc.fileKeyEncrypted as EncryptedValue);
      await this.db.memberDocument.deleteMany({ where: { organizationId: draft.organizationId, draftId: draft.id } });
      await this.db.signupDraft.delete({ where: { organizationId_id: { organizationId: draft.organizationId, id: draft.id } } });
    }
    return drafts.length;
  }
}
