export type Id = string;
export type Role = 'admin' | 'staff';
export type BookingStatus = 'submitted' | 'confirmed' | 'waitlisted' | 'rejected' | 'cancelled';
export type StaffActor = {
  kind: 'staff';
  organizationId: Id;
  userId: Id;
  role: Role;
  memberId: Id | null;
};
export type MemberActor = { kind: 'member'; organizationId: Id; lineAccountId: Id };
export type Actor = StaffActor | MemberActor | { kind: 'system'; organizationId: Id };
export type StaffUser = {
  id: Id;
  email: string;
  name: string;
  role: Role;
  active: boolean;
  memberId: Id | null;
};
export type StaffSession = { user: StaffUser; csrfToken: string };
export type ApiError = { code: string; message: string; fields?: Record<string, string> };
