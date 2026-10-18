import { Inject, Injectable } from '@nestjs/common';
import type { MemberActor, StaffActor } from '../../../../packages/contracts/src/core.js';
import type { EditableProfileField, EditableProfilePatch, ProfileChangeReview, ProfileChangeView, ReviewSummary } from '../../../../packages/contracts/src/profile.js';
import { PrismaService, type Tx } from '../database/prisma.service.js';
import { FieldCrypto, type EncryptedValue } from '../crypto/field-crypto.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { Audit } from '../audit/audit.service.js';
import { Authorization } from '../authorization/authorization.service.js';
import { Outbox } from '../notifications/outbox.service.js';
import { ReferenceData } from '../members/reference-data.service.js';
import { normalizeName } from '../members/member-matching.js';
import { findCandidates } from '../members/members.repository.js';
import { validateIntake } from '../members/member-validation.js';

export const EDITABLE_FIELDS: readonly EditableProfileField[] = ['firstName', 'lastName', 'birthDate', 'phoneMobile', 'email', 'provinceId', 'districtId', 'memberType', 'requestedServiceIds'];
const INTAKE_FIELDS = new Set<EditableProfileField>(['provinceId', 'districtId', 'memberType']);
type Stored = { old: EditableProfilePatch; new: EditableProfilePatch };
type MemberWithInterests = NonNullable<Awaited<ReturnType<Tx['member']['findFirst']>>> & { serviceInterests?: { serviceTypeId: string }[] };

@Injectable()
export class ProfileChanges {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
    @Inject(Authorization) private readonly authorization: Authorization,
    @Inject(Outbox) private readonly outbox: Outbox,
    @Inject(ReferenceData) private readonly references: ReferenceData,
  ) {}

  private current(member: MemberWithInterests): Required<EditableProfilePatch> {
    const intake = member.intakeEncrypted ? JSON.parse(this.crypto.decrypt(member.intakeEncrypted as EncryptedValue)) as Record<string, unknown> : {};
    return {
      firstName: member.firstName, lastName: member.lastName, birthDate: member.birthDate,
      phoneMobile: member.phoneMobile, email: member.email,
      provinceId: String(intake['provinceId'] ?? ''), districtId: String(intake['districtId'] ?? ''),
      memberType: (intake['memberType'] ?? '') as never,
      requestedServiceIds: [...(member.serviceInterests ?? []).map((x) => x.serviceTypeId)].sort(),
    };
  }
  private same(a: unknown, b: unknown): boolean {
    return JSON.stringify(Array.isArray(a) ? [...a].sort() : a) === JSON.stringify(Array.isArray(b) ? [...b].sort() : b);
  }
  private view(row: { id: string; memberId: string; status: string; createdAt: Date; changesEncrypted: unknown }): ProfileChangeView {
    const stored = JSON.parse(this.crypto.decrypt(row.changesEncrypted as EncryptedValue)) as Stored;
    return { id: row.id, memberId: row.memberId, status: row.status as ProfileChangeView['status'], createdAt: row.createdAt.toISOString(), fields: Object.keys(stored.new) as EditableProfileField[] };
  }

  async submit(actor: MemberActor, memberId: string, raw: Record<string, unknown>): Promise<ProfileChangeView> {
    const keys = Object.keys(raw ?? {});
    if (!keys.length || keys.some((key) => !EDITABLE_FIELDS.includes(key as EditableProfileField)))
      throw new AppError(422, 'FIELD_NOT_EDITABLE', 'แก้ไขได้เฉพาะข้อมูลติดต่อและข้อมูลพื้นฐาน กรุณาติดต่อเจ้าหน้าที่หากต้องการแก้ไขข้อมูลอื่น');
    const patch = raw as EditableProfilePatch;
    return this.db.$transaction(async (tx) => {
      const member = await tx.member.findFirst({
        where: { organizationId: actor.organizationId, id: memberId, lineAccountId: actor.lineAccountId, deletedAt: null },
        include: { serviceInterests: true },
      });
      if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      const before = this.current(member);
      const changed = keys.filter((key) => !this.same(patch[key as EditableProfileField], before[key as EditableProfileField])) as EditableProfileField[];
      if (!changed.length) throw new AppError(422, 'NO_CHANGES', 'ไม่มีข้อมูลที่เปลี่ยนแปลง');
      const merged = { ...before, ...patch };
      if (typeof merged.firstName !== 'string' || typeof merged.lastName !== 'string' || typeof merged.email !== 'string' || typeof merged.phoneMobile !== 'string' || typeof merged.birthDate !== 'string')
        throw new AppError(422, 'INVALID_INPUT', 'กรุณาตรวจสอบข้อมูล');
      validateIntake(merged, this.clock.now());
      if (!merged.birthDate || !/^0[689]\d{8}$/.test(merged.phoneMobile)) throw new AppError(422, 'INVALID_INPUT', 'กรุณาตรวจสอบวันเกิดและเบอร์มือถือ');
      if (merged.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(merged.email)) throw new AppError(422, 'INVALID_INPUT', 'กรุณาตรวจสอบอีเมล', { email: 'อีเมลไม่ถูกต้อง' });
      if (!['caregiver', 'disabled', 'at_risk'].includes(merged.memberType)) throw new AppError(422, 'INVALID_INPUT', 'กรุณาเลือกประเภทสมาชิก');
      this.references.validateAddress(merged);
      if (!Array.isArray(merged.requestedServiceIds) || !merged.requestedServiceIds.length || new Set(merged.requestedServiceIds).size !== merged.requestedServiceIds.length)
        throw new AppError(422, 'INVALID_INPUT', 'กรุณาเลือกบริการอย่างน้อย 1 รายการ');
      if (changed.includes('requestedServiceIds')) {
        const active = await tx.serviceType.count({ where: { organizationId: actor.organizationId, id: { in: merged.requestedServiceIds }, active: true } });
        if (active !== merged.requestedServiceIds.length) throw new AppError(422, 'INVALID_SERVICE', 'กรุณาเลือกบริการที่เปิดอยู่');
      }
      if ((await tx.profileChangeRequest.count({ where: { organizationId: actor.organizationId, memberId, status: 'pending' } })))
        throw new AppError(409, 'REQUEST_PENDING', 'มีคำขอแก้ไขที่รอเจ้าหน้าที่ตรวจสอบอยู่แล้ว');
      const stored: Stored = { old: {}, new: {} };
      for (const key of changed) { (stored.old as Record<string, unknown>)[key] = before[key]; (stored.new as Record<string, unknown>)[key] = patch[key]; }
      const row = await tx.profileChangeRequest.create({ data: {
        organizationId: actor.organizationId, memberId, lineAccountId: actor.lineAccountId,
        changesEncrypted: this.crypto.encrypt(JSON.stringify(stored)), baseVersion: member.version,
      } });
      await this.audit.record(tx, actor, { action: 'profile_change.submit', entity: 'profile_change_request', entityId: row.id, fields: changed });
      return this.view(row);
    });
  }

  async listForMember(actor: MemberActor, memberId: string): Promise<{ items: ProfileChangeView[] }> {
    const member = await this.db.member.findFirst({ where: { organizationId: actor.organizationId, id: memberId, lineAccountId: actor.lineAccountId, deletedAt: null } });
    if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
    const rows = await this.db.profileChangeRequest.findMany({ where: { organizationId: actor.organizationId, memberId }, orderBy: { createdAt: 'desc' }, take: 10 });
    return { items: rows.map((row) => this.view(row)) };
  }

  async queue(actor: StaffActor): Promise<{ items: ProfileChangeReview[] }> {
    const rows = await this.db.profileChangeRequest.findMany({ where: { organizationId: actor.organizationId, status: 'pending' }, orderBy: { createdAt: 'asc' } });
    const members = await this.db.member.findMany({ where: { organizationId: actor.organizationId, id: { in: rows.map((r) => r.memberId) } } });
    const byId = new Map(members.map((m) => [m.id, m]));
    return { items: rows.flatMap((row) => {
      const member = byId.get(row.memberId);
      if (!member) return [];
      const stored = JSON.parse(this.crypto.decrypt(row.changesEncrypted as EncryptedValue)) as Stored;
      return [{ ...this.view(row), memberName: `${member.firstName} ${member.lastName}`, memberNumber: member.memberNumber ?? '', oldValues: stored.old, newValues: stored.new }];
    }) };
  }

  async summary(actor: StaffActor): Promise<ReviewSummary> {
    const [signupRequests, profileChanges] = await Promise.all([
      this.db.signupRequest.count({ where: { organizationId: actor.organizationId, status: 'pending' } }),
      this.db.profileChangeRequest.count({ where: { organizationId: actor.organizationId, status: 'pending' } }),
    ]);
    return { signupRequests, profileChanges, total: signupRequests + profileChanges };
  }

  async review(actor: StaffActor, requestId: string, approve: unknown): Promise<ProfileChangeView> {
    if (typeof approve !== 'boolean') throw new AppError(422, 'INVALID_INPUT', 'กรุณาเลือกผลการตรวจสอบ');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM profile_change_requests WHERE id = ${requestId} AND organization_id = ${actor.organizationId} FOR UPDATE`;
      const request = await tx.profileChangeRequest.findFirst({ where: { organizationId: actor.organizationId, id: requestId } });
      if (!request) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำขอ');
      if (request.status !== 'pending') throw new AppError(409, 'ALREADY_REVIEWED', 'คำขอนี้ถูกตรวจสอบแล้ว');
      await this.authorization.assertCanReview(tx, actor, request.memberId);
      const stored = JSON.parse(this.crypto.decrypt(request.changesEncrypted as EncryptedValue)) as Stored;
      const fields = Object.keys(stored.new) as EditableProfileField[];
      if (approve) {
        const member = await tx.member.findFirst({ where: { organizationId: actor.organizationId, id: request.memberId, deletedAt: null }, include: { serviceInterests: true } });
        if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
        const now = this.current(member);
        // A staff correction made after the request would be silently overwritten, so stop and let staff decide.
        if (fields.some((key) => !this.same(now[key], stored.old[key])))
          throw new AppError(409, 'PROFILE_CHANGED', 'ข้อมูลสมาชิกถูกแก้ไขหลังจากส่งคำขอนี้ กรุณาปฏิเสธคำขอและให้สมาชิกส่งใหม่ หรือแก้ไขข้อมูลเอง');
        const next = { ...now, ...stored.new };
        if (fields.some((key) => ['firstName', 'lastName', 'birthDate'].includes(key)) &&
          (await findCandidates(tx, actor.organizationId, next, next.birthDate, member.id)).length)
          throw new AppError(409, 'MEMBER_REVIEW_REQUIRED', 'ชื่อและวันเกิดใหม่ตรงกับสมาชิกอื่น กรุณาตรวจสอบก่อนอนุมัติ');
        const normalized = normalizeName(next);
        const intake = member.intakeEncrypted ? JSON.parse(this.crypto.decrypt(member.intakeEncrypted as EncryptedValue)) as Record<string, unknown> : {};
        for (const key of fields) if (INTAKE_FIELDS.has(key)) intake[key] = next[key];
        await tx.member.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: member.id } }, data: {
          firstName: next.firstName.trim(), lastName: next.lastName.trim(),
          normalizedFirstName: normalized.firstName, normalizedLastName: normalized.lastName,
          birthDate: next.birthDate, phoneMobile: next.phoneMobile, email: next.email,
          intakeEncrypted: this.crypto.encrypt(JSON.stringify(intake)), version: { increment: 1 },
        } });
        if (fields.includes('requestedServiceIds')) {
          await tx.memberServiceInterest.deleteMany({ where: { organizationId: actor.organizationId, memberId: member.id } });
          await tx.memberServiceInterest.createMany({ data: next.requestedServiceIds.map((serviceTypeId) => ({ organizationId: actor.organizationId, memberId: member.id, serviceTypeId })) });
        }
      }
      const updated = await tx.profileChangeRequest.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: request.id } }, data: { status: approve ? 'approved' : 'rejected', reviewedById: actor.userId, reviewedAt: this.clock.now() } });
      await this.outbox.enqueue(tx, actor, { eventId: request.id, kind: approve ? 'profile.approved' : 'profile.rejected', recipient: { kind: 'member', memberId: request.memberId }, entityRefs: { memberIds: [request.memberId] } });
      await this.audit.record(tx, actor, { action: approve ? 'profile_change.approve' : 'profile_change.reject', entity: 'profile_change_request', entityId: request.id, fields });
      return this.view(updated);
    });
  }
}
