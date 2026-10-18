import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { MembershipRecord, MembershipSummary, PaymentMethod, TierRecord } from '../../../../../../packages/contracts/src/memberships';
import { ApiClient } from '../../core/api-client';
import { SessionService } from '../../core/session.service';
import { focusSoon } from '../../shared/focus';
import { errorText, shortDate, todayBangkok } from '../../member/shared/thai';

const METHOD: Record<PaymentMethod, string> = { cash: 'เงินสด', transfer: 'โอนเงิน', other: 'อื่น ๆ' };
const STATUS: Record<string, string> = { general: 'สมาชิกทั่วไป', active: 'ใช้งานอยู่', expired: 'หมดอายุ', lifetime: 'ตลอดชีพ' };
/** Suggested last valid day: start date plus the tier's months, minus one day. Staff can overwrite it. */
const suggestExpiry = (date: string, months: number): string => {
  const d = new Date(`${date}T00:00:00Z`);
  const day = d.getUTCDate();
  d.setUTCMonth(d.getUTCMonth() + months);
  if (d.getUTCDate() !== day) d.setUTCDate(0);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
};

@Component({
  selector: 'fl-member-membership',
  imports: [FormsModule],
  template: `<section class="intake-section" aria-labelledby="mem-h">
    <h2 id="mem-h">สมาชิกภาพและการชำระเงิน</h2>
    @if (summary(); as s) {
      <div class="profile-status"><span>สถานะ: <strong>{{ status(s.status) }}</strong></span><span>ประเภท: {{ s.tierName }}</span>
        @if (s.status === 'lifetime') { <span>ไม่มีวันหมดอายุ</span> } @else if (s.expiresAt) { <span>{{ s.status === 'expired' ? 'หมดอายุเมื่อ' : 'ใช้ได้ถึง' }} {{ date(s.expiresAt) }}</span> }</div>
      @if (s.status === 'expired') { <p class="field-hint">หมดอายุแล้วยังเก็บประเภทที่เคยชำระไว้ และลงทะเบียนคอร์สได้ตามปกติ บันทึกการต่ออายุด้านล่าง</p> }
    }
    <p class="field-hint">ระบบนี้บันทึกการชำระเงินที่รับไปแล้ว (เงินสดหรือโอน) ไม่ได้รับชำระเงินเอง</p>
    @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    @if (!history().length) { <p class="empty-state">ยังไม่มีการชำระเงิน ถือเป็นสมาชิกทั่วไป</p> }
    <ul class="doc-list" aria-label="ประวัติการชำระเงิน">
      @for (h of history(); track h.id) {
        <li [class.is-cancelled]="h.voided">
          <span><strong>{{ h.tierName }}</strong> · {{ h.amountPaid }} บาท · {{ method(h.paymentMethod) }} · ชำระ {{ date(h.paidAt) }}<br />
            <span class="record-state">{{ date(h.startsAt) }} – {{ h.expiresAt ? date(h.expiresAt) : 'ตลอดชีพ' }}{{ h.receiptNo ? ' · ใบเสร็จ ' + h.receiptNo : '' }}{{ h.note ? ' · ' + h.note : '' }}{{ h.voided ? ' · ยกเลิกรายการแล้ว' : '' }}</span></span>
          @if (isAdmin() && !h.voided) {
            <span class="doc-actions">
              <button type="button" class="button-secondary" (click)="startEdit(h)">แก้ไข</button>
              <button type="button" class="button-secondary" (click)="startVoid(h)">ยกเลิกรายการ</button>
            </span>
          }
        </li>
      }
    </ul>
    @if (editing(); as e) {
      <form class="q-draft" (ngSubmit)="saveEdit(e)" novalidate id="mem-edit" tabindex="-1" aria-label="แก้ไขรายการชำระเงิน">
        <h3>แก้ไขรายการชำระเงิน</h3>
        <div class="form-grid">
          <div class="intake-field"><label for="e-amount">จำนวนเงิน (บาท)</label><input id="e-amount" name="amount" inputmode="decimal" [(ngModel)]="edit.amountPaid" /></div>
          <div class="intake-field"><label for="e-paid">วันที่ชำระเงิน</label><input id="e-paid" name="paid" type="date" [(ngModel)]="edit.paidAt" /></div>
          <div class="intake-field"><label for="e-start">เริ่มตั้งแต่</label><input id="e-start" name="start" type="date" [(ngModel)]="edit.startsAt" /></div>
          @if (e.expiresAt !== null) { <div class="intake-field"><label for="e-exp">หมดอายุวันที่</label><input id="e-exp" name="exp" type="date" [(ngModel)]="edit.expiresAt" /></div> }
          <div class="intake-field"><label for="e-rec">เลขที่ใบเสร็จ</label><input id="e-rec" name="rec" [(ngModel)]="edit.receiptNo" /></div>
          <div class="intake-field"><label for="e-note">หมายเหตุ</label><input id="e-note" name="note" [(ngModel)]="edit.note" /></div>
        </div>
        <div class="form-actions"><button class="button-primary" type="submit" [disabled]="busy()">บันทึกการแก้ไข</button><button class="button-secondary" type="button" (click)="editing.set(null)">ปิด</button></div>
      </form>
    }
    @if (voiding(); as v) {
      <form class="q-draft" (ngSubmit)="saveVoid(v)" novalidate id="mem-void" tabindex="-1" aria-label="ยกเลิกรายการชำระเงิน">
        <h3>ยกเลิกรายการชำระเงิน</h3>
        <p class="field-hint">รายการยังอยู่ในประวัติแต่ไม่นับยอดและไม่นับเป็นสมาชิกภาพ ประเภทปัจจุบันจะคำนวณใหม่</p>
        <div class="intake-field"><label for="v-reason">เหตุผล</label><input id="v-reason" name="reason" [(ngModel)]="voidReason" /></div>
        <div class="form-actions"><button class="button-danger" type="submit" [disabled]="busy() || !voidReason.trim()">ยืนยันยกเลิกรายการ</button><button class="button-secondary" type="button" (click)="voiding.set(null)">ไม่ยกเลิก</button></div>
      </form>
    }
    <form (ngSubmit)="record()" novalidate class="doc-upload">
      <h3>บันทึกการชำระเงิน / ต่ออายุ</h3>
      @if (!tiers().length) { <p class="notice">ยังไม่มีประเภทสมาชิก {{ isAdmin() ? 'ตั้งค่าได้ที่ ตั้งค่าระบบ → ประเภทสมาชิกและค่าสมาชิก' : 'ให้ผู้ดูแลระบบตั้งค่าก่อน' }}</p> }
      @else {
        <div class="form-grid">
          <div class="intake-field"><label for="p-tier">ประเภทสมาชิก</label>
            <select id="p-tier" name="tier" [ngModel]="f.tierId" (ngModelChange)="pickTier($event)"><option value="">เลือกประเภท</option>@for (t of tiers(); track t.id) { <option [value]="t.id">{{ t.name }} ({{ t.fee }} บาท)</option> }</select></div>
          <div class="intake-field"><label for="p-amount">จำนวนเงินที่รับ (บาท)</label><input id="p-amount" name="amount" inputmode="decimal" [(ngModel)]="f.amountPaid" /></div>
          <div class="intake-field"><label for="p-paid">วันที่ชำระเงิน</label><input id="p-paid" name="paid" type="date" [max]="today" [(ngModel)]="f.paidAt" /></div>
          <div class="intake-field"><label for="p-method">วิธีชำระ</label><select id="p-method" name="method" [(ngModel)]="f.paymentMethod"><option value="cash">เงินสด</option><option value="transfer">โอนเงิน</option><option value="other">อื่น ๆ</option></select></div>
          <div class="intake-field"><label for="p-start">เริ่มเป็นสมาชิกตั้งแต่</label><input id="p-start" name="start" type="date" [ngModel]="f.startsAt" (ngModelChange)="onStart($event)" /></div>
          @if (!lifetime()) { <div class="intake-field"><label for="p-exp">หมดอายุวันที่</label><input id="p-exp" name="exp" type="date" [(ngModel)]="f.expiresAt" /><p class="field-hint">ระบบเสนอวันหมดอายุตามระยะเวลาของประเภทนี้ ตรวจสอบและแก้ได้เอง</p></div> }
          <div class="intake-field"><label for="p-rec">เลขที่ใบเสร็จ (ไม่บังคับ)</label><input id="p-rec" name="rec" [(ngModel)]="f.receiptNo" /></div>
          <div class="intake-field"><label for="p-note">หมายเหตุ (ไม่บังคับ)</label><input id="p-note" name="note" [(ngModel)]="f.note" /></div>
        </div>
        <div class="form-actions"><button class="button-primary" type="submit" [disabled]="busy() || !f.tierId">{{ busy() ? 'กำลังบันทึก…' : 'บันทึกการชำระเงิน' }}</button></div>
      }
    </form>
  </section>`,
})
export class MemberMembershipComponent implements OnInit {
  @Input({ required: true }) memberId!: string;
  private readonly api = inject(ApiClient);
  private readonly session = inject(SessionService);
  readonly history = signal<MembershipRecord[]>([]);
  readonly summary = signal<MembershipSummary | null>(null);
  readonly tiers = signal<TierRecord[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly editing = signal<MembershipRecord | null>(null);
  readonly voiding = signal<MembershipRecord | null>(null);
  readonly date = shortDate;
  readonly today = todayBangkok();
  voidReason = '';
  edit = { amountPaid: '', paidAt: '', startsAt: '', expiresAt: '' as string | null, receiptNo: '', note: '' };
  f = { tierId: '', amountPaid: '', paidAt: todayBangkok(), paymentMethod: 'cash' as PaymentMethod, startsAt: todayBangkok(), expiresAt: '' as string | null, receiptNo: '', note: '' };
  isAdmin() { return this.session.user()?.role === 'admin'; }
  status(s: string) { return STATUS[s] ?? s; }
  method(m: string) { return METHOD[m as PaymentMethod] ?? m; }
  lifetime() { return this.tiers().find((t) => t.id === this.f.tierId)?.durationMonths === null; }
  async ngOnInit() {
    try { this.tiers.set((await this.api.request<{ items: TierRecord[] }>('/membership-tiers')).items.filter((t) => t.active)); } catch { this.tiers.set([]); }
    await this.load();
  }
  async load() {
    try {
      const r = await this.api.request<{ items: MembershipRecord[]; summary: MembershipSummary }>(`/members/${this.memberId}/memberships`);
      this.history.set(r.items); this.summary.set(r.summary);
    } catch (e) { this.error.set(errorText(e)); }
  }
  pickTier(id: string) {
    this.f.tierId = id;
    const t = this.tiers().find((x) => x.id === id);
    if (!t) return;
    this.f.amountPaid = t.fee;
    this.f.expiresAt = t.durationMonths === null ? null : suggestExpiry(this.f.startsAt, t.durationMonths);
  }
  onStart(value: string) {
    this.f.startsAt = value;
    const t = this.tiers().find((x) => x.id === this.f.tierId);
    if (t && t.durationMonths !== null && value) this.f.expiresAt = suggestExpiry(value, t.durationMonths);
  }
  async record() {
    this.busy.set(true); this.error.set(''); this.message.set('');
    try {
      await this.api.request(`/members/${this.memberId}/memberships`, 'POST', { tierId: this.f.tierId, startsAt: this.f.startsAt, expiresAt: this.lifetime() ? null : this.f.expiresAt, amountPaid: this.f.amountPaid.trim(), paidAt: this.f.paidAt, paymentMethod: this.f.paymentMethod, receiptNo: this.f.receiptNo, note: this.f.note });
      this.message.set('บันทึกการชำระเงินแล้ว');
      this.f = { ...this.f, tierId: '', amountPaid: '', receiptNo: '', note: '' };
      await this.load();
    } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
  startEdit(h: MembershipRecord) { this.edit = { amountPaid: h.amountPaid, paidAt: h.paidAt, startsAt: h.startsAt, expiresAt: h.expiresAt, receiptNo: h.receiptNo, note: h.note }; this.voiding.set(null); this.editing.set(h); focusSoon('mem-edit'); }
  startVoid(h: MembershipRecord) { this.voidReason = ''; this.editing.set(null); this.voiding.set(h); focusSoon('mem-void'); }
  async saveEdit(h: MembershipRecord) {
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await this.api.request(`/memberships/${h.id}`, 'PATCH', { ...this.edit, ...(h.expiresAt === null ? { expiresAt: null } : {}) }); this.message.set('แก้ไขรายการแล้ว'); this.editing.set(null); await this.load(); }
    catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
  async saveVoid(h: MembershipRecord) {
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await this.api.request(`/memberships/${h.id}/void`, 'POST', { reason: this.voidReason.trim() }); this.message.set('ยกเลิกรายการแล้ว'); this.voiding.set(null); await this.load(); }
    catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
}
