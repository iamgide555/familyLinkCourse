import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { MonthlyFees, TierRecord } from '../../../../../../packages/contracts/src/memberships';
import { ApiClient } from '../../core/api-client';
import { SessionService } from '../../core/session.service';
import { errorText } from '../../member/shared/thai';

const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
export const monthLabel = (m: string) => `${THAI_MONTHS[Number(m.slice(5, 7)) - 1]} ${Number(m.slice(0, 4)) + 543}`;

/** Triggers a browser download from a blob the API streamed for this request only. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

@Component({
  selector: 'fl-reports',
  imports: [FormsModule, RouterLink],
  template: `<main id="main-content" class="member-workspace">
    <h1>รายงานและส่งออก Excel</h1>
    <p class="page-intro">ไฟล์สร้างตอนกดดาวน์โหลดและไม่เก็บไว้ในระบบ ทุกการส่งออกถูกบันทึกว่าใครส่งออกเมื่อไร</p>
    @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    <section class="intake-section" aria-labelledby="exp-h">
      <h2 id="exp-h">ส่งออกรายชื่อสมาชิก</h2>
      <p class="section-intro">คอลัมน์เรียงตามแบบฟอร์มสมัคร พร้อมประเภทสมาชิกภาพ วันหมดอายุ และสถานะ ตัวกรองตรงกับหน้าค้นหาสมาชิก</p>
      <div class="form-grid">
        <div class="intake-field"><label for="x-q">ชื่อ เบอร์ หรือเลขสมาชิก (ไม่บังคับ)</label><input id="x-q" name="q" [(ngModel)]="q" /></div>
        <div class="intake-field"><label for="x-tier">ประเภทสมาชิก</label><select id="x-tier" name="tier" [(ngModel)]="tier"><option value="">ทุกประเภท</option><option value="general">สมาชิกทั่วไป (ยังไม่เคยชำระ)</option>@for (t of tiers(); track t.id) { <option [value]="t.id">{{ t.name }}</option> }</select></div>
        <div class="intake-field"><label for="x-status">สถานะสมาชิกภาพ</label><select id="x-status" name="status" [(ngModel)]="membership"><option value="">ทุกสถานะ</option><option value="active">ใช้งานอยู่ (รวมตลอดชีพ)</option><option value="expired">หมดอายุแล้ว</option><option value="expiring30">จะหมดอายุใน 30 วัน</option><option value="lifetime">ตลอดชีพ</option><option value="general">สมาชิกทั่วไป</option></select></div>
      </div>
      @if (isAdmin()) {
        <label class="choice"><input type="checkbox" name="sens" [(ngModel)]="sensitive" /> รวมข้อมูลอ่อนไหว (เลขบัตรประชาชน ประเภทความพิการ รายได้ครัวเรือน)</label>
        @if (sensitive) { <p class="notice" role="status">ไฟล์นี้จะมีข้อมูลอ่อนไหว กรุณาเก็บรักษาและลบเมื่อใช้เสร็จ การส่งออกนี้ถูกบันทึกในประวัติ</p> }
      } @else { <p class="field-hint">ไฟล์ที่เจ้าหน้าที่ส่งออกไม่มีเลขบัตรประชาชน ประเภทความพิการ และรายได้ครัวเรือน เฉพาะผู้ดูแลระบบส่งออกข้อมูลเหล่านี้ได้</p> }
      <div class="form-actions"><button class="button-primary" type="button" [disabled]="busy()" (click)="exportMembers()">{{ busy() ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลด Excel รายชื่อสมาชิก' }}</button>
        <a class="button-secondary" routerLink="/staff" [queryParams]="{ membership: 'expiring30' }">ดูรายชื่อที่จะหมดอายุใน 30 วัน</a></div>
    </section>
    <section class="intake-section" aria-labelledby="fee-h">
      <h2 id="fee-h">ค่าสมาชิกที่รับต่อเดือน</h2>
      <p class="section-intro">รวมเฉพาะรายการที่ไม่ถูกยกเลิก ตัดยอดแบบแม่นยำถึงสตางค์</p>
      <div class="form-grid">
        <div class="intake-field"><label for="f-from">ตั้งแต่วันที่</label><input id="f-from" name="from" type="date" [(ngModel)]="from" (ngModelChange)="loadFees()" /></div>
        <div class="intake-field"><label for="f-to">ถึงวันที่</label><input id="f-to" name="to" type="date" [(ngModel)]="to" (ngModelChange)="loadFees()" /></div>
      </div>
      @if (!fees().length) { <p class="empty-state">ไม่มีรายการชำระเงินในช่วงนี้</p> }
      @else {
        <table class="diff"><caption class="sr-only">ค่าสมาชิกรายเดือน</caption>
          <thead><tr><th scope="col">เดือน</th><th scope="col">จำนวนรายการ</th><th scope="col">รวม (บาท)</th></tr></thead>
          <tbody>@for (f of fees(); track f.month) { <tr><th scope="row">{{ label(f.month) }}</th><td data-label="จำนวนรายการ">{{ f.count }}</td><td data-label="รวม (บาท)" class="num"><strong>{{ f.total }}</strong></td></tr> }</tbody></table>
      }
    </section>
  </main>`,
})
export class ReportsComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly session = inject(SessionService);
  readonly tiers = signal<TierRecord[]>([]);
  readonly fees = signal<MonthlyFees[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly label = monthLabel;
  q = ''; tier = ''; membership = ''; sensitive = false; from = ''; to = '';
  isAdmin() { return this.session.user()?.role === 'admin'; }
  async ngOnInit() {
    try { this.tiers.set((await this.api.request<{ items: TierRecord[] }>('/membership-tiers')).items); } catch { /* optional */ }
    await this.loadFees();
  }
  async loadFees() {
    this.error.set('');
    const qs = [this.from && `from=${this.from}`, this.to && `to=${this.to}`].filter(Boolean).join('&');
    try { this.fees.set((await this.api.request<{ items: MonthlyFees[] }>(`/reports/membership-fees${qs ? `?${qs}` : ''}`)).items); } catch (e) { this.error.set(errorText(e)); }
  }
  async exportMembers() {
    this.busy.set(true); this.error.set(''); this.message.set('');
    const qs = new URLSearchParams();
    if (this.q.trim()) qs.set('q', this.q.trim());
    if (this.tier) qs.set('tier', this.tier);
    if (this.membership) qs.set('membership', this.membership);
    if (this.isAdmin() && this.sensitive) qs.set('sensitive', '1');
    try { saveBlob(await this.api.blob(`/reports/members.xlsx?${qs}`), 'สมาชิก.xlsx'); this.message.set('สร้างไฟล์เรียบร้อย กำลังดาวน์โหลด'); }
    catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
}
