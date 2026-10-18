import { Inject, Injectable } from '@nestjs/common';
import type { StaffActor } from '../../../../packages/contracts/src/core.js';
import type { ConsentPurposeKey, OrganizationSettings, OrganizationSettingsPatch } from '../../../../packages/contracts/src/settings.js';
import { PrismaService } from '../database/prisma.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { Audit } from '../audit/audit.service.js';
import { DEFAULT_TEMPLATES, TEMPLATE_KINDS, templateProblem } from '../notifications/templates.js';

const CONSENT_KEYS: ConsentPurposeKey[] = ['privacy', 'sensitiveUpload', 'news', 'photo'];
const DEFAULT_CONSENTS: Record<ConsentPurposeKey, { version: string; text: string }> = {
  privacy: { version: 'poc-2026-10-17', text: 'ข้าพเจ้าได้อ่านและรับทราบประกาศความเป็นส่วนตัวของสมาคม FamilyLink และยินยอมให้เก็บข้อมูลเพื่อการเป็นสมาชิก (จำเป็น)' },
  sensitiveUpload: { version: 'poc-2026-10-17', text: 'ข้าพเจ้ายินยอมให้สมาคม FamilyLink เก็บและใช้ข้อมูลอ่อนไหวในเอกสารที่แนบ เพื่อตรวจสอบสิทธิ์และให้บริการ' },
  news: { version: 'poc-2026-10-17', text: 'ยินยอมให้ส่งข่าวสารและกิจกรรม (ไม่บังคับ)' },
  photo: { version: 'poc-2026-10-17', text: 'ยินยอมให้ถ่ายภาพในกิจกรรมของสมาคม (ไม่บังคับ)' },
};
export const DEFAULT_SETTINGS: OrganizationSettings = {
  consents: DEFAULT_CONSENTS,
  retention: { generalDays: null, sensitiveDays: null, idCopyDays: null },
  pdf: { title: 'แบบคำขอรับบริการ', footer: '' },
  messages: DEFAULT_TEMPLATES,
};
const bad = (message: string, fields?: Record<string, string>) => new AppError(422, 'INVALID_INPUT', message, fields);

@Injectable()
export class OrgSettings {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
  ) {}
  /** Stored overrides merged over code defaults, so a fresh organization always has working text. */
  async get(organizationId: string): Promise<OrganizationSettings> {
    const row = await this.db.organization.findUnique({ where: { id: organizationId }, select: { settings: true } });
    const stored = (row?.settings ?? {}) as Partial<OrganizationSettings>;
    return {
      consents: { ...DEFAULT_SETTINGS.consents, ...(stored.consents ?? {}) },
      retention: { ...DEFAULT_SETTINGS.retention, ...(stored.retention ?? {}) },
      pdf: { ...DEFAULT_SETTINGS.pdf, ...(stored.pdf ?? {}) },
      messages: { ...DEFAULT_SETTINGS.messages, ...(stored.messages ?? {}) },
    };
  }
  async update(actor: StaffActor, patch: OrganizationSettingsPatch): Promise<OrganizationSettings> {
    if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', 'เฉพาะผู้ดูแลระบบแก้ไขการตั้งค่าองค์กรได้');
    if (!patch || typeof patch !== 'object' || Array.isArray(patch) || Object.keys(patch).some((k) => !['consents', 'retention', 'pdf', 'messages'].includes(k))) throw bad('ข้อมูลไม่ถูกต้อง');
    const changed: string[] = [];
    const current = await this.get(actor.organizationId);
    const next: OrganizationSettings = JSON.parse(JSON.stringify(current));
    if (patch.consents) {
      for (const [key, value] of Object.entries(patch.consents)) {
        if (!CONSENT_KEYS.includes(key as ConsentPurposeKey) || typeof value?.text !== 'string' || !value.text.trim() || value.text.length > 1500 || Object.keys(value).some((k) => k !== 'text')) throw bad('ข้อความยินยอมไม่ถูกต้อง', { [key]: 'กรุณาตรวจสอบข้อความ' });
        if (value.text.trim() !== current.consents[key as ConsentPurposeKey].text) {
          // New wording is a new consent version; earlier consent rows keep the version they agreed to.
          next.consents[key as ConsentPurposeKey] = { text: value.text.trim(), version: `v${this.clock.now().toISOString().slice(0, 19).replace(/[-:T]/g, '')}` };
          changed.push('name');
        }
      }
    }
    if (patch.retention) {
      for (const [key, value] of Object.entries(patch.retention)) {
        if (!['generalDays', 'sensitiveDays', 'idCopyDays'].includes(key) || (value !== null && (!Number.isInteger(value) || (value as number) < 30 || (value as number) > 36500))) throw bad('ระยะเวลาเก็บข้อมูลต้องเป็น 30–36500 วัน หรือเว้นว่าง (เก็บไว้ตลอด)');
        (next.retention as Record<string, number | null>)[key] = value as number | null;
      }
      changed.push('status');
    }
    if (patch.pdf) {
      for (const [key, value] of Object.entries(patch.pdf)) {
        if (!['title', 'footer'].includes(key) || typeof value !== 'string' || value.length > 200 || /[<>]/.test(value) || (key === 'title' && !value.trim())) throw bad('ข้อความหัวและท้ายแบบฟอร์มไม่ถูกต้อง');
        (next.pdf as Record<string, string>)[key] = value.trim();
      }
      changed.push('description');
    }
    if (patch.messages) {
      for (const [kind, value] of Object.entries(patch.messages)) {
        if (!TEMPLATE_KINDS.includes(kind as never)) throw bad('ไม่รู้จักประเภทข้อความแจ้งเตือน');
        const problem = templateProblem(value);
        if (problem) throw bad(problem, { [kind]: problem });
        next.messages[kind] = value.trim();
      }
      changed.push('questions');
    }
    if (!changed.length) throw bad('ไม่มีข้อมูลที่เปลี่ยนแปลง');
    await this.db.$transaction(async (tx) => {
      await tx.organization.update({ where: { id: actor.organizationId }, data: { settings: next as never } });
      await this.audit.record(tx, actor, { action: 'organization_settings.update', entity: 'organization', entityId: actor.organizationId, fields: [...new Set(changed)] });
    });
    return next;
  }
}
