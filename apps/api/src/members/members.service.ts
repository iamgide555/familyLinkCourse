import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service.js';
import { FieldCrypto, type EncryptedValue } from '../crypto/field-crypto.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { Audit } from '../audit/audit.service.js';
import type { MemberActor, StaffActor } from '../../../../packages/contracts/src/core.js';
import type {
  MemberRecord,
  MemberSearchResult,
  MemberSummary,
  ParticipantProfile,
  StaffIntakeInput,
} from '../../../../packages/contracts/src/members.js';
import type { Member } from '../generated/prisma/client.js';
import type { Tx } from '../database/prisma.service.js';
import { ReferenceData } from './reference-data.service.js';
import { normalizeName } from './member-matching.js';
import { validateIntake } from './member-validation.js';
import { findCandidates, memberWhere } from './members.repository.js';
import { bangkokDate } from '../common/bangkok.js';
import { GENERAL_TIER, membershipStatus } from '../memberships/memberships.service.js';
import type { MembershipFilter } from '../../../../packages/contracts/src/memberships.js';
const EMPTY = {
  memberType: '' as const,
  citizenId: '',
  citizenIdMissingReason: '',
  disabilityType: '',
  householdIncome: '',
  householdSize: null,
  householdEarners: null,
  address: '',
  provinceId: '',
  districtId: '',
  subdistrictId: '',
  postcode: '',
  requestedServiceIds: [] as string[],
  phoneHome: '',
  facebook: '',
  maritalStatus: '',
  education: '',
  occupation: '',
  housing: '',
  caregiverName: '',
  caregiverRelationship: '',
  caregiverPhone: '',
  emergencyName: '',
  emergencyRelationship: '',
  emergencyPhone: '',
};
@Injectable()
export class Members {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
    @Inject(ReferenceData) private readonly references: ReferenceData,
  ) {}
  private async tiers(tx: Tx, organizationId: string): Promise<Map<string, string>> {
    return new Map((await tx.membershipTier.findMany({ where: { organizationId }, select: { id: true, name: true } })).map((t) => [t.id, t.name]));
  }
  private summary(member: Member, tiers: Map<string, string> = new Map()): MemberSummary {
    const today = bangkokDate(this.clock.now());
    return {
      membershipStatus: membershipStatus(member.currentTierId, member.membershipExpiresAt, today),
      tierName: (member.currentTierId && tiers.get(member.currentTierId)) || GENERAL_TIER,
      membershipExpiresAt: member.membershipExpiresAt ? member.membershipExpiresAt.toISOString().slice(0, 10) : null,
      id: member.id,
      memberNumber: member.memberNumber ?? member.id.slice(0, 8),
      firstName: member.firstName,
      lastName: member.lastName,
      birthDate: member.birthDate,
      phoneMobile: member.phoneMobile,
      completeness: 'incomplete',
      signedFormAt: member.signedFormAt?.toISOString() ?? null,
    };
  }
  private record(member: Member, requestedServiceIds: string[] = [], tiers: Map<string, string> = new Map()): MemberRecord {
    const details: Partial<StaffIntakeInput> = member.intakeEncrypted
      ? JSON.parse(this.crypto.decrypt(member.intakeEncrypted as EncryptedValue))
      : {};
    return {
      ...EMPTY,
      ...details,
      ...this.summary(member, tiers),
      requestedServiceIds,
      email: member.email,
      caregiverMemberId: member.caregiverMemberId,
      source: member.source as MemberRecord['source'],
      lineLinked: !!member.lineAccountId,
      createdAt: member.createdAt.toISOString(),
      updatedAt: member.updatedAt.toISOString(),
      version: member.version,
    };
  }
  async matches(
    actor: StaffActor,
    input: StaffIntakeInput,
    excludeId?: string,
  ): Promise<MemberSummary[]> {
    validateIntake(input, this.clock.now());
    return this.db.$transaction(async (tx) => {
      const members = await findCandidates(
        tx,
        actor.organizationId,
        input,
        input.birthDate ?? '',
        excludeId,
      );
      await this.audit.record(tx, actor, {
        action: 'member.search',
        entity: 'member',
        entityId: actor.userId,
        fields: ['firstName', 'lastName', 'birthDate'],
      });
      return members.map((member) => this.summary(member));
    });
  }
  async list(actor: StaffActor, q: string, page: number, filter: MembershipFilter = {}): Promise<MemberSearchResult> {
    if (!Number.isInteger(page) || page < 1 || page > 100000 || q.length > 150)
      throw new AppError(422, 'INVALID_INPUT', 'กรุณาตรวจสอบคำค้นหา');
    return this.db.$transaction(async (tx) => {
      const where = memberWhere(actor.organizationId, q, filter, bangkokDate(this.clock.now()));
      const [members, total, tiers] = await Promise.all([
        tx.member.findMany({ where, skip: (page - 1) * 20, take: 20, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] }),
        tx.member.count({ where }),
        this.tiers(tx, actor.organizationId),
      ]);
      await this.audit.record(tx, actor, {
        action: 'member.search',
        entity: 'member',
        entityId: actor.userId,
        fields: ['firstName', 'lastName', 'phoneMobile'],
      });
      return { items: members.map((member) => this.summary(member, tiers)), total, page, pageSize: 20 };
    });
  }
  async get(actor: StaffActor, id: string): Promise<MemberRecord> {
    return this.db.$transaction(async (tx) => {
      const member = await tx.member.findFirst({
        where: { organizationId: actor.organizationId, id, deletedAt: null },
        include: { serviceInterests: true },
      });
      if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      await this.audit.record(tx, actor, {
        action: 'member.view',
        entity: 'member',
        entityId: id,
        fields: ['fields'],
      });
      return this.record(member, member.serviceInterests.map((x) => x.serviceTypeId), await this.tiers(tx, actor.organizationId));
    });
  }
  /** Full member details for immutable registration snapshots. */
  async snapshotDetails(tx: Tx, organizationId: string, memberId: string): Promise<MemberRecord> {
    const member = await tx.member.findFirst({ where: { organizationId, id: memberId, deletedAt: null }, include: { serviceInterests: true } });
    if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
    return this.record(member, member.serviceInterests.map((x) => x.serviceTypeId), await this.tiers(tx, organizationId));
  }
  async getParticipantView(actor: MemberActor, memberId: string): Promise<ParticipantProfile> {
    return this.db.$transaction(async (tx) => {
      const member = await tx.member.findFirst({
        where: { organizationId: actor.organizationId, id: memberId, lineAccountId: actor.lineAccountId, deletedAt: null },
        include: { serviceInterests: true },
      });
      if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      await this.audit.record(tx, actor, { action: 'member.participant_view', entity: 'member', entityId: memberId, fields: ['fields'] });
      const full = this.record(member, member.serviceInterests.map((x) => x.serviceTypeId));
      const { id, firstName, lastName, birthDate, phoneMobile, email, provinceId, districtId, memberType, requestedServiceIds, completeness, signedFormAt } = full;
      const tiers = await this.tiers(tx, actor.organizationId);
      const summary = this.summary(member, tiers);
      return { id, firstName, lastName, birthDate, phoneMobile, email, provinceId, districtId, memberType, requestedServiceIds, completeness, signedFormAt, membership: { status: summary.membershipStatus!, tierName: summary.tierName!, expiresAt: summary.membershipExpiresAt ?? null } };
    });
  }
  async findCandidates(tx: Tx, organizationId: string, name: StaffIntakeInput, birthDate: string): Promise<string[]> {
    return (await findCandidates(tx, organizationId, name, birthDate)).map((x) => x.id);
  }
  async createPaper(tx: Tx, actor: StaffActor, input: StaffIntakeInput, source: 'paper' | 'walkin' = 'paper'): Promise<MemberRecord> {
    return this.saveInTransaction(tx, actor, input, undefined, source);
  }
  async save(actor: StaffActor, input: StaffIntakeInput & { expectedVersion?: number }, id?: string): Promise<MemberRecord> {
    validateIntake(input, this.clock.now());
    if (id && !Number.isInteger(input.expectedVersion))
      throw new AppError(428, 'MEMBER_VERSION_REQUIRED', 'กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก');
    return this.db.$transaction((tx) => this.saveInTransaction(tx, actor, input, id));
  }
  private async saveInTransaction(tx: Tx, actor: StaffActor, input: StaffIntakeInput & { expectedVersion?: number }, id?: string, source: 'paper' | 'walkin' = 'paper'): Promise<MemberRecord> {
      validateIntake(input, this.clock.now());
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${actor.organizationId} FOR UPDATE`;
      const existing = id
        ? await tx.member.findFirst({
            where: { organizationId: actor.organizationId, id, deletedAt: null },
          })
        : null;
      if (id && !existing) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      if (existing && existing.version !== input.expectedVersion)
        throw new AppError(409, 'MEMBER_EDIT_CONFLICT', 'ข้อมูลสมาชิกถูกแก้ไขแล้ว กรุณาโหลดข้อมูลล่าสุดก่อนบันทึก');
      const previous = existing ? this.record(existing) : null;
      const definedInput = Object.fromEntries(
        Object.entries(input).filter(([key, value]) => key !== 'expectedVersion' && value !== undefined),
      );
      const merged: StaffIntakeInput = {
        ...EMPTY,
        ...previous,
        ...definedInput,
        firstName: input.firstName,
        lastName: input.lastName,
      };
      // A new record needs an ID number or a stated reason. An existing one may not lose what it already has, but an older
      // record that never had either can still be edited for something else.
      const hadIdentity = !!(previous?.citizenId || previous?.citizenIdMissingReason);
      validateIntake(merged, this.clock.now(), { requireCitizenId: !existing || hadIdentity, requireBirthDate: !existing || !!previous?.birthDate });
      if (merged.citizenId) merged.citizenIdMissingReason = '';
      this.references.validateAddress(merged);
      if (input.requestedServiceIds?.length) {
        const ids = [...new Set(input.requestedServiceIds)];
        if (ids.length !== input.requestedServiceIds.length) throw new AppError(422, 'INVALID_INPUT', 'กรุณาตรวจสอบบริการที่เลือก', { requestedServiceIds: 'บริการซ้ำกัน' });
        const previousIds = existing
          ? (await tx.memberServiceInterest.findMany({ where: { organizationId: actor.organizationId, memberId: existing.id } })).map((x) => x.serviceTypeId)
          : [];
        const count = await tx.serviceType.count({ where: { organizationId: actor.organizationId, id: { in: ids }, OR: [{ active: true }, { id: { in: previousIds } }] } });
        if (count !== ids.length) throw new AppError(422, 'INVALID_INPUT', 'กรุณาตรวจสอบบริการที่เลือก', { requestedServiceIds: 'ไม่พบบริการที่เปิดใช้งาน' });
      }
      const citizenIdHash = merged.citizenId
        ? this.crypto.citizenIdIndex(actor.organizationId, merged.citizenId)
        : null;
      if (
        citizenIdHash &&
        (await tx.member.findFirst({
          where: {
            organizationId: actor.organizationId,
            citizenIdHash,
            ...(id ? { id: { not: id } } : {}),
          },
        }))
      )
        throw new AppError(
          409,
          'CITIZEN_ID_EXISTS',
          'เลขบัตรประชาชนนี้มีข้อมูลแล้ว กรุณาค้นหาสมาชิกเดิมหรือตรวจสอบเลขอีกครั้ง',
        );
      if (merged.caregiverMemberId) {
        if (merged.caregiverMemberId === id)
          throw new AppError(422, 'INVALID_INPUT', 'ไม่สามารถเลือกตนเองเป็นผู้ดูแล');
        const caregiver = await tx.member.findFirst({
          where: {
            organizationId: actor.organizationId,
            id: merged.caregiverMemberId,
            deletedAt: null,
          },
        });
        if (!caregiver) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิกผู้ดูแล');
      }
      const matches = await findCandidates(
        tx,
        actor.organizationId,
        merged,
        merged.birthDate ?? '',
        id,
      );
      if (matches.length && input.duplicateDecision !== 'create_new')
        throw new AppError(
          409,
          'MEMBER_REVIEW_REQUIRED',
          'พบชื่อและวันเกิดตรงกับสมาชิกเดิม กรุณาตรวจสอบก่อนบันทึก',
        );
      const normalized = normalizeName(merged);
      const encryptedDetails = {
        ...EMPTY,
        ...Object.fromEntries(
          Object.keys(EMPTY).map((key) => [key, merged[key as keyof typeof EMPTY]]),
        ),
      };
      const data = {
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        normalizedFirstName: normalized.firstName,
        normalizedLastName: normalized.lastName,
        birthDate: merged.birthDate ?? '',
        phoneMobile: merged.phoneMobile ?? '',
        email: merged.email ?? '',
        citizenIdHash,
        intakeEncrypted: this.crypto.encrypt(JSON.stringify(encryptedDetails)),
        caregiverMemberId: merged.caregiverMemberId || null,
        ...(matches.length
          ? { duplicateReviewReason: this.crypto.encrypt(input.duplicateReason!) }
          : {}),
      };
      let member: Member;
      if (existing)
        member = await tx.member.update({
          where: { organizationId_id: { organizationId: actor.organizationId, id: existing.id }, version: input.expectedVersion },
          data: { ...data, version: { increment: 1 } },
        });
      else {
        const organization = await tx.organization.update({
          where: { id: actor.organizationId },
          data: { memberSequence: { increment: 1 } },
        });
        member = await tx.member.create({
          data: {
            ...data,
            organizationId: actor.organizationId,
            source,
            memberNumber: `FL${String(organization.memberSequence).padStart(6, '0')}`,
          },
        });
      }
      if (input.requestedServiceIds !== undefined) {
        await tx.memberServiceInterest.deleteMany({ where: { organizationId: actor.organizationId, memberId: member.id } });
        if (input.requestedServiceIds.length) await tx.memberServiceInterest.createMany({ data: input.requestedServiceIds.map((serviceTypeId) => ({ organizationId: actor.organizationId, memberId: member.id, serviceTypeId })) });
      }
      await this.audit.record(tx, actor, {
        action: existing ? 'member.update' : 'member.create',
        entity: 'member',
        entityId: member.id,
        fields: Object.keys(definedInput).filter(
          (key) =>
            !['duplicateDecision', 'duplicateReason'].includes(key) &&
            (!previous ||
              previous[key as keyof MemberRecord] !== merged[key as keyof StaffIntakeInput]),
        ),
      });
      if (matches.length)
        await this.audit.record(tx, actor, {
          action: 'member.duplicate_override',
          entity: 'member',
          entityId: member.id,
          fields: ['fields'],
        });
      const interests = await tx.memberServiceInterest.findMany({ where: { organizationId: actor.organizationId, memberId: member.id } });
      return this.record(member, interests.map((x) => x.serviceTypeId));
  }
}
