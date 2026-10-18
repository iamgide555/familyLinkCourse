export type MemberName = { firstName: string; lastName: string };
export type MemberType = '' | 'caregiver' | 'disabled' | 'at_risk';
export type StaffIntakeInput = MemberName & {
  birthDate?: string;
  phoneMobile?: string;
  email?: string;
  memberType?: MemberType;
  citizenId?: string;
  /** Set when the person truly has no ID number; the reason is stored with the record and the field is left empty. */
  noCitizenId?: boolean;
  citizenIdMissingReason?: string;
  disabilityType?: string;
  householdIncome?: string;
  householdSize?: number | null;
  householdEarners?: number | null;
  address?: string;
  provinceId?: string;
  districtId?: string;
  subdistrictId?: string;
  postcode?: string;
  requestedServiceIds?: string[];
  phoneHome?: string;
  facebook?: string;
  maritalStatus?: string;
  education?: string;
  occupation?: string;
  housing?: string;
  caregiverMemberId?: string | null;
  caregiverName?: string;
  caregiverRelationship?: string;
  caregiverPhone?: string;
  emergencyName?: string;
  emergencyRelationship?: string;
  emergencyPhone?: string;
  duplicateDecision?: 'create_new';
  duplicateReason?: string;
};
export type MemberSummary = MemberName & {
  id: string;
  membershipStatus?: 'general' | 'active' | 'expired' | 'lifetime';
  tierName?: string;
  membershipExpiresAt?: string | null;
  memberNumber: string;
  birthDate: string;
  phoneMobile: string;
  completeness: 'incomplete';
  signedFormAt: string | null;
};
export type MemberRecord = MemberSummary &
  Required<Omit<StaffIntakeInput, keyof MemberName | 'duplicateDecision' | 'duplicateReason' | 'noCitizenId'>> & {
    source: 'paper' | 'line' | 'walkin' | 'invite';
    lineLinked: boolean;
    version: number;
    createdAt: string;
    updatedAt: string;
  };
export type MemberEditInput = StaffIntakeInput & { expectedVersion: number };
export type MemberSearchResult = {
  items: MemberSummary[];
  total: number;
  page: number;
  pageSize: number;
};
export type ParticipantProfile = Pick<
  MemberRecord,
  | 'id'
  | 'firstName'
  | 'lastName'
  | 'birthDate'
  | 'phoneMobile'
  | 'email'
  | 'provinceId'
  | 'districtId'
  | 'memberType'
  | 'requestedServiceIds'
  | 'completeness'
  | 'signedFormAt'
> & { membership?: { status: 'general' | 'active' | 'expired' | 'lifetime'; tierName: string; expiresAt: string | null } };
