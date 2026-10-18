import type { MemberType } from './members.js';
import type { Id } from './core.js';
export type EditableProfilePatch = Partial<{
  firstName: string; lastName: string; birthDate: string; phoneMobile: string;
  email: string; provinceId: string; districtId: string;
  memberType: Exclude<MemberType, ''>; requestedServiceIds: Id[];
}>;
export type EditableProfileField = keyof EditableProfilePatch;
export type ProfileChangeStatus = 'pending' | 'approved' | 'rejected';
export type ProfileChangeView = {
  id: Id;
  memberId: Id;
  status: ProfileChangeStatus;
  createdAt: string;
  fields: EditableProfileField[];
};
export type ProfileChangeReview = ProfileChangeView & {
  memberName: string;
  memberNumber: string;
  oldValues: EditableProfilePatch;
  newValues: EditableProfilePatch;
};
export type ReviewSummary = { signupRequests: number; profileChanges: number; total: number };
