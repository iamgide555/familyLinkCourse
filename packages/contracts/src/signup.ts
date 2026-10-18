import type { Id, MemberActor, StaffActor } from './core.js';
import type { MemberType } from './members.js';

export type ConsentPurpose = 'privacy' | 'sensitive_upload' | 'news' | 'photo';
export type ConsentInput = {
  version: string;
  consentedBy: 'self' | 'guardian' | 'caregiver';
  guardianName?: string;
  guardianRelationship?: string;
  granted?: boolean;
};
export type InvitePrefill = { firstName?: string; lastName?: string; phoneMobile?: string };
export type SignupContext =
  | { kind: 'line'; actor: MemberActor; inviteToken?: string }
  | { kind: 'invite'; organizationId: Id; inviteToken: string };
export type SignupInput = {
  firstName: string;
  lastName: string;
  birthDate: string;
  phoneMobile: string;
  email?: string;
  memberType: Exclude<MemberType, ''>;
  provinceId: string;
  districtId: string;
  requestedServiceIds: Id[];
  registeringFor: 'self' | 'another';
  relationship?: string;
  caregiverMemberId?: Id;
  privacyConsent: ConsentInput;
  newsConsent?: ConsentInput;
  photoConsent?: ConsentInput;
  draftId?: Id;
  draftToken?: string;
};
export type SignupResult = { kind: 'created'; memberId: Id } | { kind: 'pending'; requestId: Id };
export type SignupDecision =
  | { decision: 'link_existing'; memberId: Id }
  | { decision: 'create_new'; reason: string }
  | { decision: 'reject'; reason: string };
export type InviteIssue = (actor: StaffActor, mode: 'signup' | 'link', memberId: Id | null, prefill: InvitePrefill) => Promise<{url: string; token: string; expiresAt: string}>;
