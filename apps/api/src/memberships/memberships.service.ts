import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import type { StaffActor } from '../../../../packages/contracts/src/core.js';
import type { MembershipRecord, MembershipStatus, MembershipSummary, MonthlyFees, PaymentCorrection, PaymentInput, PaymentMethod, TierInput, TierRecord } from '../../../../packages/contracts/src/memberships.js';
import { PrismaService, type Tx } from '../database/prisma.service.js';
import { FieldCrypto } from '../crypto/field-crypto.js';
import { Clock } from '../common/clock.js';
import { AppError } from '../common/errors.js';
import { bangkokDate, isDate } from '../common/bangkok.js';
import { Audit } from '../audit/audit.service.js';

const bad = (message: string, fields?: Record<string, string>) => new AppError(422, 'INVALID_INPUT', message, fields);
const METHODS: PaymentMethod[] = ['cash', 'transfer', 'other'];
const day = (d: Date | null): string | null => (d ? d.toISOString().slice(0, 10) : null);
const toDate = (s: string): Date => new Date(`${s}T00:00:00.000Z`);
export const GENERAL_TIER = 'สมาชิกทั่วไป';
function money(value: unknown, label: string): Prisma.Decimal {
  if (typeof value !== 'string' || !/^\d{1,10}(\.\d{1,2})?$/.test(value.trim())) throw bad(`${label}ต้องเป็นตัวเลข เช่น 500 หรือ 1200.50`, { amountPaid: `${label}ไม่ถูกต้อง` });
  return new Prisma.Decimal(value.trim());
}
export const fmt = (d: Prisma.Decimal | null | undefined): string => (d ?? new Prisma.Decimal(0)).toFixed(2);

/** Status shown to staff. An expired member keeps the paid tier; only the status word changes. */
export function membershipStatus(tierId: string | null, expiresAt: Date | null, today: string): MembershipStatus {
  if (!tierId) return 'general';
  if (!expiresAt) return 'lifetime';
  return day(expiresAt)! < today ? 'expired' : 'active';
}

@Injectable()
export class Memberships {
  constructor(
    @Inject(PrismaService) private readonly db: PrismaService,
    @Inject(FieldCrypto) private readonly crypto: FieldCrypto,
    @Inject(Clock) private readonly clock: Clock,
    @Inject(Audit) private readonly audit: Audit,
  ) {}
  private admin(actor: StaffActor, message: string) { if (actor.role !== 'admin') throw new AppError(403, 'FORBIDDEN', message); }
  today(): string { return bangkokDate(this.clock.now()); }

  // ---- tiers ---------------------------------------------------------------------------------------------
  private tier(row: { id: string; name: string; fee: Prisma.Decimal; durationMonths: number | null; active: boolean }): TierRecord {
    return { id: row.id, name: row.name, fee: fmt(row.fee), durationMonths: row.durationMonths, active: row.active };
  }
  async tiers(actor: StaffActor): Promise<{ items: TierRecord[] }> {
    const rows = await this.db.membershipTier.findMany({ where: { organizationId: actor.organizationId }, orderBy: [{ createdAt: 'asc' }] });
    return { items: rows.map((r) => this.tier(r)) };
  }
  private cleanTier(input: Partial<TierInput>, partial: boolean) {
    const out: { name?: string; fee?: Prisma.Decimal; durationMonths?: number | null; active?: boolean } = {};
    if (!partial || input.name !== undefined) { if (typeof input.name !== 'string' || !input.name.trim() || input.name.trim().length > 100) throw bad('กรุณาระบุชื่อประเภทสมาชิก', { name: 'กรุณาระบุชื่อ' }); out.name = input.name.trim(); }
    if (!partial || input.fee !== undefined) out.fee = money(input.fee, 'ค่าสมาชิก');
    if (!partial || input.durationMonths !== undefined) {
      if (input.durationMonths !== null && (!Number.isInteger(input.durationMonths) || (input.durationMonths as number) < 1 || (input.durationMonths as number) > 600)) throw bad('ระยะเวลาต้องเป็นจำนวนเดือน 1–600 หรือเว้นว่างสำหรับตลอดชีพ');
      out.durationMonths = input.durationMonths ?? null;
    }
    if (input.active !== undefined) { if (typeof input.active !== 'boolean') throw bad('ข้อมูลไม่ถูกต้อง'); out.active = input.active; }
    return out;
  }
  async createTier(actor: StaffActor, input: TierInput): Promise<TierRecord> {
    this.admin(actor, 'เฉพาะผู้ดูแลระบบจัดการประเภทสมาชิกและค่าสมาชิกได้');
    const data = this.cleanTier(input, false);
    return this.db.$transaction(async (tx) => {
      if (await tx.membershipTier.findFirst({ where: { organizationId: actor.organizationId, name: data.name! } })) throw new AppError(409, 'TIER_EXISTS', 'มีประเภทสมาชิกชื่อนี้แล้ว');
      const row = await tx.membershipTier.create({ data: { organizationId: actor.organizationId, name: data.name!, fee: data.fee!, durationMonths: data.durationMonths ?? null, active: data.active ?? true } });
      await this.audit.record(tx, actor, { action: 'membership_tier.create', entity: 'membership_tier', entityId: row.id, fields: ['name', 'amount'] });
      return this.tier(row);
    });
  }
  async updateTier(actor: StaffActor, id: string, input: Partial<TierInput>): Promise<TierRecord> {
    this.admin(actor, 'เฉพาะผู้ดูแลระบบจัดการประเภทสมาชิกและค่าสมาชิกได้');
    if (!input || Object.keys(input).some((k) => !['name', 'fee', 'durationMonths', 'active'].includes(k))) throw bad('ข้อมูลไม่ถูกต้อง');
    const data = this.cleanTier(input, true);
    return this.db.$transaction(async (tx) => {
      if (!(await tx.membershipTier.findFirst({ where: { organizationId: actor.organizationId, id } }))) throw new AppError(404, 'NOT_FOUND', 'ไม่พบประเภทสมาชิก');
      const row = await tx.membershipTier.update({ where: { organizationId_id: { organizationId: actor.organizationId, id } }, data });
      await this.audit.record(tx, actor, { action: 'membership_tier.update', entity: 'membership_tier', entityId: id, fields: ['name', 'amount'] });
      return this.tier(row);
    });
  }

  // ---- payments ------------------------------------------------------------------------------------------
  private view(row: { id: string; memberId: string; tierId: string; startsAt: Date; expiresAt: Date | null; amountPaid: Prisma.Decimal; paidAt: Date; paymentMethod: string; receiptNo: string; note: string; voidedAt: Date | null; tier: { name: string } }): MembershipRecord {
    return { id: row.id, memberId: row.memberId, tierId: row.tierId, tierName: row.tier.name, startsAt: day(row.startsAt)!, expiresAt: day(row.expiresAt), amountPaid: fmt(row.amountPaid), paidAt: day(row.paidAt)!, paymentMethod: row.paymentMethod as PaymentMethod, receiptNo: row.receiptNo, note: row.note, voided: !!row.voidedAt, voidedAt: row.voidedAt?.toISOString() ?? null };
  }
  private async clean(tx: Tx, organizationId: string, input: PaymentInput, existingTierId?: string) {
    if (!input || typeof input !== 'object') throw bad('ข้อมูลไม่ถูกต้อง');
    const tier = await tx.membershipTier.findFirst({ where: { organizationId, id: String(input.tierId) } });
    if (!tier || (!tier.active && tier.id !== existingTierId)) throw bad('กรุณาเลือกประเภทสมาชิกที่เปิดใช้งาน', { tierId: 'กรุณาเลือกประเภทสมาชิก' });
    if (!isDate(input.startsAt) || !isDate(input.paidAt)) throw bad('กรุณาระบุวันที่เริ่มและวันที่ชำระเงินให้ถูกต้อง');
    if (input.paidAt > this.today()) throw bad('วันที่ชำระเงินต้องไม่เป็นวันในอนาคต', { paidAt: 'ต้องไม่เป็นวันในอนาคต' });
    if (!METHODS.includes(input.paymentMethod)) throw bad('กรุณาเลือกวิธีชำระเงิน');
    if (tier.durationMonths === null) { if (input.expiresAt) throw bad('สมาชิกตลอดชีพไม่มีวันหมดอายุ', { expiresAt: 'เว้นว่างสำหรับตลอดชีพ' }); }
    else if (!isDate(input.expiresAt) || input.expiresAt < input.startsAt) throw bad('กรุณาระบุวันหมดอายุที่ไม่ก่อนวันที่เริ่ม', { expiresAt: 'กรุณาระบุวันหมดอายุ' });
    const receiptNo = (input.receiptNo ?? '').trim();
    const note = (input.note ?? '').trim();
    if (receiptNo.length > 60 || note.length > 500) throw bad('เลขที่ใบเสร็จหรือหมายเหตุยาวเกินไป');
    return { tierId: tier.id, startsAt: toDate(input.startsAt), expiresAt: tier.durationMonths === null ? null : toDate(input.expiresAt as string), amountPaid: money(input.amountPaid, 'จำนวนเงิน'), paidAt: toDate(input.paidAt), paymentMethod: input.paymentMethod, receiptNo, note };
  }
  /** Recomputes the denormalized tier/expiry from the latest effective non-voided payment. Caller holds a tx. */
  async recompute(tx: Tx, organizationId: string, memberId: string): Promise<void> {
    const latest = await tx.membership.findFirst({ where: { organizationId, memberId, voidedAt: null }, orderBy: [{ startsAt: 'desc' }, { paidAt: 'desc' }, { id: 'desc' }] });
    await tx.member.update({ where: { organizationId_id: { organizationId, id: memberId } }, data: { currentTierId: latest?.tierId ?? null, membershipExpiresAt: latest?.expiresAt ?? null } });
  }
  async record(actor: StaffActor, memberId: string, input: PaymentInput): Promise<MembershipRecord> {
    return this.db.$transaction(async (tx) => {
      if (!(await tx.member.findFirst({ where: { organizationId: actor.organizationId, id: memberId, deletedAt: null } }))) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
      const data = await this.clean(tx, actor.organizationId, input);
      const row = await tx.membership.create({ data: { ...data, organizationId: actor.organizationId, memberId, recordedById: actor.userId }, include: { tier: true } });
      await this.recompute(tx, actor.organizationId, memberId);
      await this.audit.record(tx, actor, { action: 'membership.record', entity: 'membership', entityId: row.id, fields: ['tier', 'amount', 'startsAt', 'expiresAt', 'paidAt', 'method', 'receiptNo'] });
      return this.view(row);
    });
  }
  async history(actor: StaffActor, memberId: string): Promise<{ items: MembershipRecord[]; summary: MembershipSummary }> {
    const member = await this.db.member.findFirst({ where: { organizationId: actor.organizationId, id: memberId, deletedAt: null } });
    if (!member) throw new AppError(404, 'NOT_FOUND', 'ไม่พบสมาชิก');
    const rows = await this.db.membership.findMany({ where: { organizationId: actor.organizationId, memberId }, include: { tier: true }, orderBy: [{ startsAt: 'desc' }, { paidAt: 'desc' }, { id: 'desc' }] });
    return { items: rows.map((r) => this.view(r)), summary: await this.summaryFor(this.db, actor.organizationId, member) };
  }
  async correct(actor: StaffActor, id: string, patch: PaymentCorrection): Promise<MembershipRecord> {
    this.admin(actor, 'เฉพาะผู้ดูแลระบบแก้ไขรายการชำระเงินได้');
    if (!patch || typeof patch !== 'object' || !Object.keys(patch).length || Object.keys(patch).some((k) => !['tierId', 'startsAt', 'expiresAt', 'amountPaid', 'paidAt', 'paymentMethod', 'receiptNo', 'note'].includes(k))) throw bad('ข้อมูลที่แก้ไขไม่ถูกต้อง');
    return this.db.$transaction(async (tx) => {
      const row = await tx.membership.findFirst({ where: { organizationId: actor.organizationId, id } });
      if (!row) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรายการชำระเงิน');
      if (row.voidedAt) throw new AppError(409, 'VOIDED', 'รายการนี้ถูกยกเลิกแล้ว แก้ไขไม่ได้');
      const merged: PaymentInput = { tierId: row.tierId, startsAt: day(row.startsAt)!, expiresAt: day(row.expiresAt), amountPaid: fmt(row.amountPaid), paidAt: day(row.paidAt)!, paymentMethod: row.paymentMethod as PaymentMethod, receiptNo: row.receiptNo, note: row.note, ...patch };
      const data = await this.clean(tx, actor.organizationId, merged, row.tierId);
      const updated = await tx.membership.update({ where: { organizationId_id: { organizationId: actor.organizationId, id } }, data, include: { tier: true } });
      await this.recompute(tx, actor.organizationId, row.memberId);
      await this.audit.record(tx, actor, { action: 'membership.correct', entity: 'membership', entityId: id, fields: ['tier', 'amount', 'startsAt', 'expiresAt', 'paidAt', 'method', 'receiptNo'].filter((f) => ({ tier: 'tierId', amount: 'amountPaid', startsAt: 'startsAt', expiresAt: 'expiresAt', paidAt: 'paidAt', method: 'paymentMethod', receiptNo: 'receiptNo' } as Record<string, string>)[f]! in patch) });
      return this.view(updated);
    });
  }
  async void(actor: StaffActor, id: string, reason: unknown): Promise<MembershipRecord> {
    this.admin(actor, 'เฉพาะผู้ดูแลระบบยกเลิกรายการชำระเงินได้');
    if (typeof reason !== 'string' || !reason.trim() || reason.length > 500) throw bad('กรุณาระบุเหตุผลที่ยกเลิกรายการ', { reason: 'กรุณาระบุเหตุผล' });
    return this.db.$transaction(async (tx) => {
      const row = await tx.membership.findFirst({ where: { organizationId: actor.organizationId, id } });
      if (!row) throw new AppError(404, 'NOT_FOUND', 'ไม่พบรายการชำระเงิน');
      if (row.voidedAt) throw new AppError(409, 'VOIDED', 'รายการนี้ถูกยกเลิกแล้ว');
      const updated = await tx.membership.update({ where: { organizationId_id: { organizationId: actor.organizationId, id } }, data: { voidedAt: this.clock.now(), voidedById: actor.userId, voidReasonEncrypted: this.crypto.encrypt(reason.trim()) as never }, include: { tier: true } });
      await this.recompute(tx, actor.organizationId, row.memberId);
      await this.audit.record(tx, actor, { action: 'membership.void', entity: 'membership', entityId: id, fields: ['status'] });
      return this.view(updated);
    });
  }

  // ---- views and reports ---------------------------------------------------------------------------------
  async summaryFor(db: Pick<PrismaService, 'membershipTier'>, organizationId: string, member: { currentTierId: string | null; membershipExpiresAt: Date | null }): Promise<MembershipSummary> {
    const tier = member.currentTierId ? await db.membershipTier.findFirst({ where: { organizationId, id: member.currentTierId } }) : null;
    return { status: membershipStatus(member.currentTierId, member.membershipExpiresAt, this.today()), tierId: member.currentTierId, tierName: tier?.name ?? GENERAL_TIER, expiresAt: day(member.membershipExpiresAt) };
  }
  /** Fees collected per Bangkok calendar month, excluding voided payments. Exact decimal sums. */
  async monthlyFees(actor: StaffActor, from?: string, to?: string): Promise<{ items: MonthlyFees[] }> {
    const rows = await this.db.$queryRaw<Array<{ month: string; total: Prisma.Decimal; count: bigint }>>`
      SELECT to_char(paid_at, 'YYYY-MM') AS month, SUM(amount_paid) AS total, COUNT(*) AS count
      FROM memberships WHERE organization_id = ${actor.organizationId} AND voided_at IS NULL
        AND (${from ?? null}::date IS NULL OR paid_at >= ${from ?? null}::date) AND (${to ?? null}::date IS NULL OR paid_at <= ${to ?? null}::date)
      GROUP BY 1 ORDER BY 1 DESC`;
    return { items: rows.map((r) => ({ month: r.month, total: fmt(new Prisma.Decimal(r.total)), count: Number(r.count) })) };
  }
}
