import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Audit } from '../audit/audit.service.js';
import { FieldCrypto, type EncryptedValue } from '../crypto/field-crypto.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import type { StaffActor } from '../../../../packages/contracts/src/core.js';

@Injectable()
export class MemberAdmin {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Audit) private readonly audit: Audit,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(Clock) private readonly clock: Clock,
  ) {}
  private text(value: unknown, label: string) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 2000)
      throw new AppError(422, 'INVALID_INPUT', `กรุณาระบุ${label}`);
    return value.trim();
  }
  async deleteMember(actor: StaffActor, id: string, reason: unknown) {
    const safeReason = this.text(reason, 'เหตุผล');
    return this.db.$transaction(async (tx) => {
      const member = await tx.member.findFirst({ where: { organizationId: actor.organizationId, id, deletedAt: null } });
      if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      await tx.member.update({ where: { organizationId_id: { organizationId: actor.organizationId, id } }, data: { deletedAt: this.clock.now(), version: { increment: 1 } } });
      await tx.pdpaRequest.create({ data: {
        organizationId: actor.organizationId, memberId: id, kind: 'manual_delete', status: 'completed',
        reasonEncrypted: this.crypto.encrypt(safeReason), handledById: actor.userId,
        resolvedAt: this.clock.now(),
      } });
      await this.audit.record(tx, actor, { action: 'member.delete', entity: 'member', entityId: id, fields: ['deletedAt'] });
      return { id, deleted: true };
    });
  }
  async openRequest(actor: StaffActor, memberId: string, kind: unknown, reason: unknown) {
    if (kind !== 'access' && kind !== 'deletion') throw new AppError(422, 'INVALID_INPUT', 'กรุณาเลือกประเภทคำขอ');
    const safeReason = this.text(reason, 'รายละเอียดคำขอ');
    return this.db.$transaction(async (tx) => {
      const member = await tx.member.findFirst({ where: { organizationId: actor.organizationId, id: memberId } });
      if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      const request = await tx.pdpaRequest.create({ data: {
        organizationId: actor.organizationId, memberId, kind,
        reasonEncrypted: this.crypto.encrypt(safeReason),
      } });
      await this.audit.record(tx, actor, { action: 'member.pdpa_request_open', entity: 'member', entityId: memberId, fields: ['fields'] });
      return { id: request.id, memberId, kind, status: request.status, createdAt: request.createdAt.toISOString() };
    });
  }
  async listRequests(actor: StaffActor, memberId: string) {
    return this.db.$transaction(async (tx) => {
      const member = await tx.member.findFirst({ where: { organizationId: actor.organizationId, id: memberId } });
      if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      const rows = await tx.pdpaRequest.findMany({ where: { organizationId: actor.organizationId, memberId }, orderBy: { createdAt: 'desc' } });
      await this.audit.record(tx, actor, { action: 'member.pdpa_request_view', entity: 'member', entityId: memberId, fields: ['fields'] });
      return { items: rows.map((row) => ({
        id: row.id, memberId, kind: row.kind, status: row.status,
        reason: this.crypto.decrypt(row.reasonEncrypted as EncryptedValue),
        note: row.resolutionEncrypted ? this.crypto.decrypt(row.resolutionEncrypted as EncryptedValue) : null,
        createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null,
      })) };
    });
  }
  async resolveRequest(actor: StaffActor, memberId: string, id: string, status: unknown, note: unknown) {
    if (status !== 'completed' && status !== 'refused') throw new AppError(422, 'INVALID_INPUT', 'กรุณาเลือกผลการดำเนินการ');
    const safeNote = this.text(note, 'บันทึกผล');
    return this.db.$transaction(async (tx) => {
      const current = await tx.pdpaRequest.findFirst({ where: { organizationId: actor.organizationId, memberId, id } });
      if (!current) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำขอ');
      if (current.status !== 'open') throw new AppError(409, 'REQUEST_ALREADY_RESOLVED', 'คำขอนี้ดำเนินการแล้ว');
      const result = await tx.pdpaRequest.update({ where: { organizationId_id: { organizationId: actor.organizationId, id } }, data: {
        status, resolutionEncrypted: this.crypto.encrypt(safeNote), handledById: actor.userId, resolvedAt: this.clock.now(),
      } });
      if (status === 'completed' && current.kind === 'deletion') {
        await tx.member.updateMany({ where: { organizationId: actor.organizationId, id: memberId, deletedAt: null }, data: { deletedAt: this.clock.now(), version: { increment: 1 } } });
        await this.audit.record(tx, actor, { action: 'member.delete', entity: 'member', entityId: memberId, fields: ['deletedAt'] });
      }
      await this.audit.record(tx, actor, { action: `member.pdpa_request_${status === 'completed' ? 'complete' : 'refuse'}`, entity: 'member', entityId: memberId, fields: ['fields'] });
      return { id: result.id, memberId, kind: result.kind, status: result.status, resolvedAt: result.resolvedAt?.toISOString() };
    });
  }
}
