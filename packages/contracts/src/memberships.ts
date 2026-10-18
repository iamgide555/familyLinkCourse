import type { Id } from './core.js';
export type MembershipStatus = 'general' | 'active' | 'expired' | 'lifetime';
export type PaymentMethod = 'cash' | 'transfer' | 'other';
export type TierRecord = { id: Id; name: string; fee: string; durationMonths: number | null; active: boolean };
export type TierInput = { name: string; fee: string; durationMonths: number | null; active?: boolean };
export type PaymentInput = { tierId: Id; startsAt: string; expiresAt: string | null; amountPaid: string; paidAt: string; paymentMethod: PaymentMethod; receiptNo?: string; note?: string };
export type PaymentCorrection = Partial<PaymentInput>;
export type MembershipRecord = {
  id: Id; memberId: Id; tierId: Id; tierName: string; startsAt: string; expiresAt: string | null; amountPaid: string; paidAt: string;
  paymentMethod: PaymentMethod; receiptNo: string; note: string; voided: boolean; voidedAt: string | null;
};
export type MembershipSummary = { status: MembershipStatus; tierId: Id | null; tierName: string; expiresAt: string | null };
export type MembershipFilter = { tier?: string; membership?: 'active' | 'expired' | 'expiring30' | 'lifetime' | 'general' };
export type MonthlyFees = { month: string; total: string; count: number };
