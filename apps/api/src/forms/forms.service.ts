import { Inject, Injectable } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import type { StaffActor } from '../../../../packages/contracts/src/core.js';
import type { MemberRecord } from '../../../../packages/contracts/src/members.js';
import { Audit } from '../audit/audit.service.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';
import { PrismaService } from '../database/prisma.service.js';
import { Members } from '../members/members.service.js';
import { OrgSettings } from '../settings/org-settings.service.js';

const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (character) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!,
  );

const field = (label: string, value: unknown, full = false): string =>
  `<div class="field${full ? ' full' : ''}"><span class="label">${escapeHtml(label)}</span><span class="value">${escapeHtml(value)}</span></div>`;

const group = (heading: string, fields: string[]): string =>
  `<section class="section"><h3>${escapeHtml(heading)}</h3><div class="field-grid">${fields.join('')}</div></section>`;

const typeLabel: Record<string, string> = {
  caregiver: 'ผู้ดูแล',
  disabled: 'คนพิการ',
  at_risk: 'ผู้มีแนวโน้มจะพิการ',
};

function memberForm(member: MemberRecord, serviceNames: string[], pdf: { title: string; footer: string }): string {
  const personal = group('1.1 ข้อมูลสมาชิก', [
    field('ชื่อ', member.firstName), field('นามสกุล', member.lastName),
    field('เลขสมาชิก', member.memberNumber), field('วันเกิด', member.birthDate),
    field('เลขบัตรประชาชน', member.citizenId), field('ประเภทสมาชิก', typeLabel[member.memberType] ?? ''),
    field('โทรศัพท์มือถือ', member.phoneMobile), field('โทรศัพท์บ้าน', member.phoneHome),
    field('อีเมล', member.email), field('Facebook', member.facebook),
    field('ที่อยู่', member.address, true),
  ]);
  const household = group('1.2 ข้อมูลครัวเรือนและความเป็นอยู่', [
    field('สถานภาพสมรส', member.maritalStatus), field('การศึกษา', member.education),
    field('อาชีพ', member.occupation), field('ลักษณะที่อยู่อาศัย', member.housing),
    field('จำนวนคนในครัวเรือน', member.householdSize), field('จำนวนผู้มีรายได้', member.householdEarners),
    field('รายได้ครัวเรือน', member.householdIncome), field('ประเภทความพิการ', member.disabilityType),
  ]);
  const contacts = group('1.3 ผู้ดูแลและผู้ติดต่อฉุกเฉิน', [
    field('ชื่อผู้ดูแล', member.caregiverName), field('ความสัมพันธ์', member.caregiverRelationship),
    field('โทรศัพท์ผู้ดูแล', member.caregiverPhone), field('ชื่อผู้ติดต่อฉุกเฉิน', member.emergencyName),
    field('ความสัมพันธ์ผู้ติดต่อฉุกเฉิน', member.emergencyRelationship), field('โทรศัพท์ฉุกเฉิน', member.emergencyPhone),
  ]);
  return `<article class="form">
    <header class="heading"><h1>${escapeHtml(pdf.title)}</h1><p class="small">เลขสมาชิก ${escapeHtml(member.memberNumber)}</p></header>
    <section><h2>ส่วนที่ 1 ข้อมูลผู้ขอรับบริการ</h2>${personal}${household}${contacts}</section>
  </article><article class="form">
    <section class="section"><h2>ส่วนที่ 2 บริการที่ประสงค์ขอรับ</h2>${field('บริการที่เลือก', serviceNames.join(', '), true)}<div class="blank-lines"></div></section>
    <section class="section"><h2>ส่วนที่ 3 บันทึกของเจ้าหน้าที่</h2><div class="blank-lines"></div><div class="blank-lines"></div><div class="blank-lines"></div></section>
    <section class="section"><h2>การรับรองและลงนาม</h2><p>ข้าพเจ้ารับรองว่าข้อมูลในแบบคำขอนี้ถูกต้องตามที่ให้ไว้</p><div class="signatures"><div class="signature"><p>ลายมือชื่อผู้ขอรับบริการ / ผู้แทนโดยชอบธรรม</p><p>วันที่ ................................</p></div><div class="signature"><p>ลายมือชื่อเจ้าหน้าที่ผู้รับเอกสาร</p><p>วันที่ ................................</p></div></div></section>
    ${pdf.footer ? `<p class="small">${escapeHtml(pdf.footer)}</p>` : ''}
  </article>`;
}

@Injectable()
export class Forms {
  private readonly rendererUrl: URL;
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(Members) private readonly members: Members,
    @Inject(Audit) private readonly audit: Audit,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(OrgSettings) private readonly orgSettings: OrgSettings,
    @Inject(APP_CONFIG) config: ApplicationConfig,
  ) {
    const configured = process.env['PDF_RENDERER_URL'];
    if (config.production && !configured) throw new Error('PDF_RENDERER_URL is required in production');
    this.rendererUrl = new URL(configured ?? 'http://127.0.0.1:3002');
    if (
      this.rendererUrl.protocol !== 'http:' || this.rendererUrl.username || this.rendererUrl.password ||
      this.rendererUrl.pathname !== '/' || this.rendererUrl.search || this.rendererUrl.hash
    ) throw new Error('PDF_RENDERER_URL must be an HTTP renderer origin');
  }

  private async html(members: MemberRecord[], serviceNames: Map<string, string>, pdf: { title: string; footer: string }): Promise<string> {
    const template = await readFile(new URL('./templates/signup-form.html', import.meta.url), 'utf8');
    const fonts = await Promise.all([
      'sarabun-400-thai.woff2', 'sarabun-400-latin.woff2',
      'sarabun-600-thai.woff2', 'sarabun-600-latin.woff2',
    ].map((name) => readFile(new URL(`./assets/${name}`, import.meta.url))));
    return template
      .replace('{{FONT400THAI}}', fonts[0]!.toString('base64'))
      .replace('{{FONT400LATIN}}', fonts[1]!.toString('base64'))
      .replace('{{FONT600THAI}}', fonts[2]!.toString('base64'))
      .replace('{{FONT600LATIN}}', fonts[3]!.toString('base64'))
      .replace('{{FORMS}}', members.map((member) => memberForm(member, member.requestedServiceIds.map((id) => serviceNames.get(id) ?? ''), pdf)).join(''));
  }

  async renderSignup(actor: StaffActor, memberIds: string[]): Promise<Buffer> {
    if (!Array.isArray(memberIds) || memberIds.length < 1 || memberIds.length > 20 ||
      new Set(memberIds).size !== memberIds.length || memberIds.some((id) => typeof id !== 'string'))
      throw new AppError(422, 'INVALID_INPUT', 'กรุณาเลือกสมาชิก 1–20 คน');
    const members = await Promise.all(memberIds.map((id) => this.members.get(actor, id)));
    const requestedServiceIds = [...new Set(members.flatMap((member) => member.requestedServiceIds))];
    const serviceTypes = requestedServiceIds.length
      ? await this.db.serviceType.findMany({ where: { organizationId: actor.organizationId, id: { in: requestedServiceIds } } })
      : [];
    const serviceNames = new Map(serviceTypes.map(({ id, name }) => [id, name]));
    const upload = new FormData();
    upload.append('files', new Blob([await this.html(members, serviceNames, (await this.orgSettings.get(actor.organizationId)).pdf)], { type: 'text/html; charset=utf-8' }), 'index.html');
    upload.append('preferCssPageSize', 'true');
    upload.append('printBackground', 'true');
    let response: Response;
    try {
      response = await fetch(new URL('/forms/chromium/convert/html', this.rendererUrl), {
        method: 'POST', body: upload, signal: AbortSignal.timeout(30000),
      });
    } catch {
      throw new AppError(503, 'PDF_UNAVAILABLE', 'ยังสร้างแบบคำขอไม่ได้ กรุณาลองอีกครั้ง');
    }
    if (!response.ok || !response.headers.get('content-type')?.startsWith('application/pdf'))
      throw new AppError(503, 'PDF_UNAVAILABLE', 'ยังสร้างแบบคำขอไม่ได้ กรุณาลองอีกครั้ง');
    if (Number(response.headers.get('content-length')) > 30_000_000)
      throw new AppError(503, 'PDF_TOO_LARGE', 'แบบคำขอมีขนาดใหญ่เกินไป กรุณาพิมพ์ครั้งละน้อยคน');
    const pdf = Buffer.from(await response.arrayBuffer());
    if (pdf.length > 30_000_000 || pdf.subarray(0, 5).toString() !== '%PDF-')
      throw new AppError(503, 'PDF_UNAVAILABLE', 'ยังสร้างแบบคำขอไม่ได้ กรุณาลองอีกครั้ง');
    await this.db.$transaction(async (tx) => {
      for (const memberId of memberIds)
        await this.audit.record(tx, actor, { action: 'form.print', entity: 'member', entityId: memberId, fields: ['fields'] });
    });
    return pdf;
  }

  async markSigned(actor: StaffActor, memberId: string, receivedAt: string): Promise<{ signedFormAt: string }> {
    const parsed = typeof receivedAt === 'string' ? new Date(receivedAt) : new Date(NaN);
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(receivedAt) ||
      !Number.isFinite(parsed.getTime()) || parsed.toISOString() !== receivedAt ||
      parsed.getTime() > this.clock.now().getTime() || parsed.getUTCFullYear() < 1900)
      throw new AppError(422, 'INVALID_INPUT', 'กรุณาระบุวันที่รับเอกสารที่ถูกต้อง');
    return this.db.$transaction(async (tx) => {
      const member = await tx.member.findFirst({ where: { id: memberId, organizationId: actor.organizationId, deletedAt: null } });
      if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      await tx.member.update({ where: { id: memberId }, data: { signedFormAt: parsed } });
      await this.audit.record(tx, actor, { action: 'form.signature_received', entity: 'member', entityId: memberId, fields: ['signedFormAt'] });
      return { signedFormAt: parsed.toISOString() };
    });
  }
}
