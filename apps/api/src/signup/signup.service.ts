import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import type { MemberActor, StaffActor } from '../../../../packages/contracts/src/core.js';
import type { ConsentInput, SignupContext, SignupDecision, SignupInput, SignupResult } from '../../../../packages/contracts/src/signup.js';
import { PrismaService, type Tx } from '../database/prisma.service.js';
import { FieldCrypto, type EncryptedValue } from '../crypto/field-crypto.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { Audit } from '../audit/audit.service.js';
import { Authorization } from '../authorization/authorization.service.js';
import { Outbox } from '../notifications/outbox.service.js';
import { ReferenceData } from '../members/reference-data.service.js';
import { validateIntake } from '../members/member-validation.js';
import { normalizeName } from '../members/member-matching.js';
import { findCandidates } from '../members/members.repository.js';
import { hashToken } from './invites.service.js';

type RecordedConsent = ConsentInput & { purpose: 'privacy' | 'sensitive_upload' | 'news' | 'photo'; granted: boolean; createdAt: string };
const ONLINE_FIELDS = new Set(['inviteToken','draftId','draftToken','firstName','lastName','birthDate','phoneMobile','email','citizenId','noCitizenId','citizenIdMissingReason','memberType','provinceId','districtId','requestedServiceIds','registeringFor','relationship','caregiverMemberId','privacyConsent','newsConsent','photoConsent']);
function validConsent(value: ConsentInput | undefined, required: boolean): boolean {
  if (!value) return !required;
  return typeof value.version === 'string' && value.version.trim().length > 0 &&
    ['self','guardian','caregiver'].includes(value.consentedBy) &&
    typeof value.granted === 'boolean' && (!required || value.granted) &&
    (value.consentedBy === 'self' || (typeof value.guardianName === 'string' && !!value.guardianName.trim() && typeof value.guardianRelationship === 'string' && !!value.guardianRelationship.trim()));
}
@Injectable()
export class Signup {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
    @Inject(Authorization) private readonly authorization: Authorization,
    @Inject(Outbox) private readonly outbox: Outbox,
    @Inject(ReferenceData) private readonly references: ReferenceData,
  ) {}
  private validate(input: SignupInput, rawKeys: string[]) {
    if (rawKeys.some((key) => !ONLINE_FIELDS.has(key))) throw new AppError(422, 'INVALID_INPUT', 'มีข้อมูลที่ไม่อนุญาต');
    if (!['caregiver','disabled','at_risk'].includes(input.memberType) ||
      !['self','another'].includes(input.registeringFor) ||
      !input.provinceId || !input.districtId ||
      !Array.isArray(input.requestedServiceIds) || !input.requestedServiceIds.length ||
      input.requestedServiceIds.some((x) => typeof x !== 'string') ||
      new Set(input.requestedServiceIds).size !== input.requestedServiceIds.length ||
      (input.registeringFor === 'another' && !input.relationship?.trim()) ||
      (input.registeringFor === 'self' && (!!input.relationship || !!input.caregiverMemberId)) ||
      !validConsent(input.privacyConsent, true) ||
      !validConsent(input.newsConsent, false) || !validConsent(input.photoConsent, false))
      throw new AppError(422, 'INVALID_INPUT', 'กรุณากรอกข้อมูลสมัครและยินยอมให้ครบ');
    if (typeof input.citizenId === 'string') input.citizenId = input.citizenId.replace(/[\s-]/g, '');
    if (input.citizenId === undefined || typeof input.citizenId !== 'string') input.citizenId = '';
    if (input.noCitizenId !== undefined && typeof input.noCitizenId !== 'boolean' || (input.citizenIdMissingReason !== undefined && typeof input.citizenIdMissingReason !== 'string'))
      throw new AppError(422, 'INVALID_INPUT', 'กรุณาตรวจสอบเลขบัตรประชาชน');
    validateIntake({ ...input, caregiverRelationship: input.relationship ?? '' }, this.clock.now(), { requireCitizenId: true });
    this.references.validateAddress(input);
    if (!input.birthDate || !input.phoneMobile || !input.firstName || !input.lastName ||
      !/^0[689]\d{8}$/.test(input.phoneMobile) ||
      (input.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)))
      throw new AppError(422, 'INVALID_INPUT', 'กรุณากรอกข้อมูลสมัครให้ครบ');
  }
  private recorded(input: SignupInput, uploadConsent: RecordedConsent | null): RecordedConsent[] {
    const at = this.clock.now().toISOString();
    const list: RecordedConsent[] = [
      { ...input.privacyConsent, purpose: 'privacy', granted: true, createdAt: at },
    ];
    if (input.newsConsent) list.push({ ...input.newsConsent, purpose: 'news', granted: !!input.newsConsent.granted, createdAt: at });
    if (input.photoConsent) list.push({ ...input.photoConsent, purpose: 'photo', granted: !!input.photoConsent.granted, createdAt: at });
    if (uploadConsent) list.push(uploadConsent);
    return list;
  }
  private async persistConsents(tx: Tx, organizationId: string, memberId: string, consents: RecordedConsent[]) {
    for (const item of consents) await tx.consent.create({ data: {
      organizationId, memberId, purpose: item.purpose, version: item.version,
      granted: item.granted, consentedBy: item.consentedBy,
      guardianName: item.guardianName ?? '', guardianRelationship: item.guardianRelationship ?? '',
      createdAt: new Date(item.createdAt),
    } });
  }
  private async createMember(tx: Tx, orgId: string, input: SignupInput, lineAccountId: string | null, source: 'line' | 'invite', consents: RecordedConsent[], duplicateReason?: string) {
    const normalized = normalizeName(input);
    const citizenIdHash = input.citizenId ? this.crypto.citizenIdIndex(orgId, input.citizenId) : null;
    if (citizenIdHash && await tx.member.findFirst({ where: { organizationId: orgId, citizenIdHash } }))
      throw new AppError(409, 'CITIZEN_ID_EXISTS', 'เลขบัตรประชาชนนี้มีข้อมูลแล้ว กรุณาเชื่อมกับสมาชิกเดิม');
    const organization = await tx.organization.update({ where: { id: orgId }, data: { memberSequence: { increment: 1 } } });
    const member = await tx.member.create({ data: {
      organizationId: orgId,
      lineAccountId,
      source,
      memberNumber: `FL${String(organization.memberSequence).padStart(6, '0')}`,
      firstName: input.firstName.trim(), lastName: input.lastName.trim(),
      normalizedFirstName: normalized.firstName, normalizedLastName: normalized.lastName,
      birthDate: input.birthDate, phoneMobile: input.phoneMobile, email: input.email ?? '',
      caregiverMemberId: input.caregiverMemberId ?? null,
      citizenIdHash,
      intakeEncrypted: this.crypto.encrypt(JSON.stringify({citizenId: input.citizenId ?? '', citizenIdMissingReason: input.citizenId ? '' : (input.citizenIdMissingReason ?? '').trim(), memberType: input.memberType, provinceId: input.provinceId, districtId: input.districtId, requestedServiceIds: input.requestedServiceIds, caregiverRelationship: input.relationship ?? ''})),
      ...(duplicateReason ? {duplicateReviewReason: this.crypto.encrypt(duplicateReason)} : {}),
    } });
    await tx.memberServiceInterest.createMany({ data: input.requestedServiceIds.map((serviceTypeId) => ({ organizationId: orgId, memberId: member.id, serviceTypeId })) });
    await this.persistConsents(tx, orgId, member.id, consents);
    if (lineAccountId) await tx.lineAccount.update({ where: { organizationId_id: { organizationId: orgId, id: lineAccountId } }, data: { richMenuState: 'member' } });
    return member;
  }
  async submit(context: SignupContext, input: SignupInput, rawKeys: string[] = Object.keys(input)): Promise<SignupResult> {
    this.validate(input, rawKeys);
    const orgId = context.kind === 'line' ? context.actor.organizationId : context.organizationId;
    const lineAccountId = context.kind === 'line' ? context.actor.lineAccountId : null;
    const token = context.inviteToken;
    if (!lineAccountId && !token) throw new AppError(401, 'INVITE_REQUIRED', 'กรุณาใช้ลิงก์สมัครสมาชิก');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${orgId} FOR UPDATE`;
      let inviteId: string | null = null;
      if (token) {
        const invite = await tx.signupInvite.findFirst({ where: { organizationId: orgId, tokenHash: hashToken(token), mode: 'signup', usedAt: null, expiresAt: { gt: this.clock.now() } } });
        if (!invite) throw new AppError(409, 'INVITE_UNAVAILABLE', 'ลิงก์หมดอายุหรือถูกใช้แล้ว');
        inviteId = invite.id;
      }
      const activeIds = await tx.serviceType.findMany({ where: { organizationId: orgId, id: { in: input.requestedServiceIds }, active: true }, select: { id: true } });
      if (activeIds.length !== input.requestedServiceIds.length) throw new AppError(422, 'INVALID_SERVICE', 'กรุณาเลือกบริการที่เปิดอยู่');
      if (input.caregiverMemberId) {
        if (!lineAccountId) throw new AppError(403, 'FORBIDDEN', 'ลิงก์สมัครสมาชิกไม่ให้สิทธิ์ดูแลสมาชิกเดิม');
        const caregiver = await tx.member.findFirst({ where: { organizationId: orgId, id: input.caregiverMemberId, lineAccountId, deletedAt: null } });
        if (!caregiver) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิกผู้ดูแล');
      }
      let uploadConsent: RecordedConsent | null = null;
      if (input.draftId || input.draftToken) {
        if (!input.draftId || !input.draftToken) throw new AppError(422, 'INVALID_DRAFT', 'ข้อมูลเอกสารไม่ครบ');
        const draft = await tx.signupDraft.findFirst({ where: { organizationId: orgId, id: input.draftId, tokenHash: hashToken(input.draftToken), consumedAt: null, expiresAt: { gt: this.clock.now() } } });
        if (!draft || draft.ownerKind !== (lineAccountId ? 'line' : 'invite') || draft.ownerId !== (lineAccountId ?? hashToken(token!)))
          throw new AppError(403, 'DRAFT_FORBIDDEN', 'ไม่สามารถใช้เอกสารนี้');
        const files = await tx.memberDocument.count({ where: { organizationId: orgId, draftId: draft.id, deletedAt: null } });
        if (files && !draft.uploadConsentEncrypted) throw new AppError(422, 'UPLOAD_CONSENT_REQUIRED', 'กรุณายินยอมก่อนแนบเอกสาร');
        if (draft.uploadConsentEncrypted) uploadConsent = JSON.parse(this.crypto.decrypt(draft.uploadConsentEncrypted as EncryptedValue)) as RecordedConsent;
        await tx.signupDraft.update({ where: { organizationId_id: { organizationId: orgId, id: draft.id } }, data: { consumedAt: this.clock.now() } });
      }
      const consents = this.recorded(input, uploadConsent);
      const byName = await findCandidates(tx, orgId, input, input.birthDate);
      const byId = input.citizenId
        ? await tx.member.findMany({ where: { organizationId: orgId, deletedAt: null, citizenIdHash: this.crypto.citizenIdIndex(orgId, input.citizenId) } })
        : [];
      const matches = [...byName, ...byId.filter((m) => !byName.some((n) => n.id === m.id))];
      let result: SignupResult;
      if (matches.length) {
        const request = await tx.signupRequest.create({ data: {
          organizationId: orgId, lineAccountId, inviteId,
          submittedDataEncrypted: this.crypto.encrypt(JSON.stringify(input)),
          consentsEncrypted: this.crypto.encrypt(JSON.stringify(consents)),
          candidateMemberIds: matches.map((member) => member.id),
        } });
        if (input.draftId) await tx.memberDocument.updateMany({ where: { organizationId: orgId, draftId: input.draftId }, data: { draftId: null, signupRequestId: request.id } });
        result = { kind: 'pending', requestId: request.id };
      } else {
        const member = await this.createMember(tx, orgId, input, lineAccountId, lineAccountId ? 'line' : 'invite', consents);
        if (input.draftId) await tx.memberDocument.updateMany({ where: { organizationId: orgId, draftId: input.draftId }, data: { draftId: null, memberId: member.id } });
        await this.outbox.enqueue(tx, { kind: 'system', organizationId: orgId }, { eventId: randomUUID(), kind: 'signup.created', recipient: { kind: 'member', memberId: member.id }, entityRefs: { memberIds: [member.id] } });
        result = { kind: 'created', memberId: member.id };
      }
      if (inviteId) await tx.signupInvite.update({ where: { organizationId_id: { organizationId: orgId, id: inviteId } }, data: { usedAt: this.clock.now() } });
      await this.audit.record(tx, { kind: 'system', organizationId: orgId }, { action: 'member.signup', entity: result.kind === 'created' ? 'member' : 'signup_request', entityId: result.kind === 'created' ? result.memberId : result.requestId, fields: ['fields'] });
      return result;
    });
  }
  async pending(actor: MemberActor) {
    const rows = await this.db.signupRequest.findMany({ where: { organizationId: actor.organizationId, lineAccountId: actor.lineAccountId, status: 'pending' }, orderBy: { createdAt: 'desc' } });
    return rows.map(({ id, status, createdAt }) => ({ requestId: id, status, createdAt: createdAt.toISOString() }));
  }
  async queue(actor: StaffActor) {
    const rows = await this.db.signupRequest.findMany({ where: { organizationId: actor.organizationId, status: 'pending' }, orderBy: { createdAt: 'asc' } });
    const candidates = await this.db.member.findMany({ where: { organizationId: actor.organizationId, id: { in: [...new Set(rows.flatMap((row) => row.candidateMemberIds))] }, deletedAt: null } });
    const documents = await this.db.memberDocument.findMany({ where: { organizationId: actor.organizationId, signupRequestId: { in: rows.map((row) => row.id) }, deletedAt: null } });
    const byId = new Map(candidates.map((member) => [member.id, member]));
    await this.db.$transaction((tx) => this.audit.record(tx, actor, { action: 'signup_request.view', entity: 'signup_request', entityId: actor.userId, fields: ['fields'] }));
    return rows.map((row) => ({
      id: row.id,
      submitted: JSON.parse(this.crypto.decrypt(row.submittedDataEncrypted as EncryptedValue)) as SignupInput,
      candidateMemberIds: row.candidateMemberIds,
      candidates: row.candidateMemberIds.flatMap((id) => {
        const member = byId.get(id);
        return member ? [{ id: member.id, memberNumber: member.memberNumber ?? '', firstName: member.firstName, lastName: member.lastName, birthDate: member.birthDate, phoneMobile: member.phoneMobile, linked: !!member.lineAccountId }] : [];
      }),
      documents: documents.filter((doc) => doc.signupRequestId === row.id).map((doc) => ({ id: doc.id, mime: doc.mime, size: doc.size, documentTypeId: doc.documentTypeId })),
      source: row.lineAccountId ? 'line' : 'invite',
      createdAt: row.createdAt.toISOString(),
    }));
  }
  async review(actor: StaffActor, requestId: string, decision: SignupDecision): Promise<{memberId?: string; status: string}> {
    if (!['link_existing','create_new','reject'].includes(decision.decision) ||
      ((decision.decision === 'create_new' || decision.decision === 'reject') && !decision.reason?.trim()))
      throw new AppError(422, 'INVALID_INPUT', 'กรุณาระบุเหตุผล');
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id = ${actor.organizationId} FOR UPDATE`;
      const request = await tx.signupRequest.findFirst({ where: { organizationId: actor.organizationId, id: requestId } });
      if (!request) throw new AppError(404, 'NOT_FOUND', 'ไม่พบคำขอ');
      if (request.status !== 'pending') throw new AppError(409, 'ALREADY_REVIEWED', 'คำขอนี้ถูกตรวจสอบแล้ว');
      const input = JSON.parse(this.crypto.decrypt(request.submittedDataEncrypted as EncryptedValue)) as SignupInput;
      const consents = JSON.parse(this.crypto.decrypt(request.consentsEncrypted as EncryptedValue)) as RecordedConsent[];
      let memberId: string | undefined;
      let status: string;
      if (decision.decision === 'link_existing') {
        if (!request.candidateMemberIds.includes(decision.memberId)) throw new AppError(422, 'INVALID_CANDIDATE', 'กรุณาเลือกสมาชิกที่ตรงกัน');
        const member = await tx.member.findFirst({ where: { organizationId: actor.organizationId, id: decision.memberId, deletedAt: null } });
        if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
        await this.authorization.assertCanReview(tx, actor, member.id);
        if (member.lineAccountId && member.lineAccountId !== request.lineAccountId) throw new AppError(409, 'LINK_EXISTS', 'สมาชิกนี้มีบัญชี LINE แล้ว');
        if (request.lineAccountId) await tx.member.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: member.id } }, data: { lineAccountId: request.lineAccountId, version: { increment: 1 } } });
        await this.persistConsents(tx, actor.organizationId, member.id, consents);
        memberId = member.id;
        status = 'linked';
      } else if (decision.decision === 'create_new') {
        const matches = await findCandidates(tx, actor.organizationId, input, input.birthDate);
        for (const candidate of matches) await this.authorization.assertCanReview(tx, actor, candidate.id);
        const member = await this.createMember(tx, actor.organizationId, input, request.lineAccountId, request.lineAccountId ? 'line' : 'invite', consents, decision.reason);
        memberId = member.id;
        status = 'created_new';
      } else {
        for (const candidateId of request.candidateMemberIds) await this.authorization.assertCanReview(tx, actor, candidateId);
        status = 'rejected';
      }
      await tx.signupRequest.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: request.id } }, data: { status, reviewedById: actor.userId, resolvedAt: this.clock.now(), resolvedMemberId: memberId ?? null } });
      if (memberId) {
        await tx.memberDocument.updateMany({ where: { organizationId: actor.organizationId, signupRequestId: request.id }, data: { signupRequestId: null, memberId } });
        if (request.lineAccountId) await tx.lineAccount.update({ where: { organizationId_id: { organizationId: actor.organizationId, id: request.lineAccountId } }, data: { richMenuState: 'member' } });
      }
      await this.outbox.enqueue(tx, actor, { eventId: randomUUID(), kind: status === 'linked' ? 'signup.linked' : status === 'created_new' ? 'signup.created' : 'signup.rejected', recipient: { kind: 'signup_request', requestId }, entityRefs: { signupRequestIds: [requestId], ...(memberId ? { memberIds: [memberId] } : {}) } });
      await this.audit.record(tx, actor, { action: `signup.review.${status}`, entity: 'signup_request', entityId: requestId, fields: ['fields'] });
      return { status, ...(memberId ? { memberId } : {}) };
    });
  }
}
