import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { Audit } from '../audit/audit.service.js';
import { AppError } from '../common/errors.js';
import type { StaffActor } from '../../../../packages/contracts/src/core.js';

const DOCUMENT_LABELS = [
  'บัตรคนพิการ', 'ทะเบียนบ้าน', 'ใบรับรองแพทย์', 'ใบรับรองการอาศัยในนนทบุรี', 'อื่น ๆ',
];
@Injectable()
export class Settings {
  constructor(@Inject(PrismaService) private readonly db: PrismaService, @Inject(Audit) private readonly audit: Audit) {}
  private name(input: unknown): string {
    if (typeof input !== 'string' || !input.trim() || input.trim().length > 150)
      throw new AppError(422, 'INVALID_INPUT', 'กรุณาระบุชื่อ 1–150 ตัวอักษร', { name: 'กรุณาระบุชื่อ 1–150 ตัวอักษร' });
    return input.trim();
  }
  async serviceTypes(actor: StaffActor) {
    const items = await this.db.serviceType.findMany({ where: { organizationId: actor.organizationId }, orderBy: { name: 'asc' } });
    return { items: items.map(({ id, name, active }) => ({ id, name, active })), source: 'configured' as const };
  }
  async documentTypes(actor: StaffActor) {
    await this.db.$transaction(async (tx) => {
      for (const name of DOCUMENT_LABELS) await tx.documentType.upsert({
        where: { organizationId_name: { organizationId: actor.organizationId, name } },
        create: { organizationId: actor.organizationId, name, sensitive: true },
        update: {},
      });
    });
    const items = await this.db.documentType.findMany({ where: { organizationId: actor.organizationId }, orderBy: { name: 'asc' } });
    return { items: items.map(({ id, name, active, sensitive }) => ({ id, name, active, sensitive })), source: 'configured' as const };
  }
  async create(actor: StaffActor, kind: 'service' | 'document', rawName: unknown) {
    const name = this.name(rawName);
    return this.db.$transaction(async (tx) => {
      const existing = kind === 'service'
        ? await tx.serviceType.findFirst({ where: { organizationId: actor.organizationId, name } })
        : await tx.documentType.findFirst({ where: { organizationId: actor.organizationId, name } });
      if (existing) throw new AppError(409, 'SETTING_EXISTS', 'ชื่อนี้มีอยู่แล้ว');
      const item = kind === 'service'
        ? await tx.serviceType.create({ data: { organizationId: actor.organizationId, name } })
        : await tx.documentType.create({ data: { organizationId: actor.organizationId, name, sensitive: true } });
      await this.audit.record(tx, actor, { action: `${kind}_type.create`, entity: `${kind}_type`, entityId: item.id, fields: ['name'] });
      return { id: item.id, name: item.name, active: item.active, ...(kind === 'document' ? { sensitive: true } : {}) };
    });
  }
  async update(actor: StaffActor, kind: 'service' | 'document', id: string, body: { name?: unknown; active?: unknown }) {
    if (body.active !== undefined && typeof body.active !== 'boolean') throw new AppError(422, 'INVALID_INPUT', 'กรุณาตรวจสอบสถานะ');
    const name = body.name === undefined ? undefined : this.name(body.name);
    if (name === undefined && body.active === undefined) throw new AppError(422, 'INVALID_INPUT', 'ไม่มีข้อมูลให้แก้ไข');
    return this.db.$transaction(async (tx) => {
      const current = kind === 'service'
        ? await tx.serviceType.findFirst({ where: { organizationId: actor.organizationId, id } })
        : await tx.documentType.findFirst({ where: { organizationId: actor.organizationId, id } });
      if (!current) throw new AppError(404, 'NOT_FOUND', 'ไม่พบประเภท');
      if (name && name !== current.name) {
        const collision = kind === 'service'
          ? await tx.serviceType.findFirst({ where: { organizationId: actor.organizationId, name } })
          : await tx.documentType.findFirst({ where: { organizationId: actor.organizationId, name } });
        if (collision) throw new AppError(409, 'SETTING_EXISTS', 'ชื่อนี้มีอยู่แล้ว');
      }
      const item = kind === 'service'
        ? await tx.serviceType.update({ where: { organizationId_id: { organizationId: actor.organizationId, id } }, data: { name, active: body.active as boolean | undefined } })
        : await tx.documentType.update({ where: { organizationId_id: { organizationId: actor.organizationId, id } }, data: { name, active: body.active as boolean | undefined } });
      await this.audit.record(tx, actor, { action: `${kind}_type.update`, entity: `${kind}_type`, entityId: id, fields: [name !== undefined ? 'name' : '', body.active !== undefined ? 'active' : ''].filter(Boolean) });
      return { id: item.id, name: item.name, active: item.active, ...(kind === 'document' ? { sensitive: true } : {}) };
    });
  }
}
