import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { TierRecord } from '../../../../../../packages/contracts/src/memberships';
import { ApiClient } from '../../core/api-client';
import { errorText } from '../../member/shared/thai';

@Component({
  selector: 'fl-tiers',
  imports: [FormsModule],
  template: `<main id="main-content" class="member-workspace">
    <h1>ประเภทสมาชิกและค่าสมาชิก</h1>
    <p class="page-intro">ชื่อประเภท ค่าสมาชิก และระยะเวลา ใช้เป็นป้ายกำกับสำหรับกรองและรายงานเท่านั้น ไม่กระทบสิทธิ์ลงทะเบียนคอร์ส ชื่อและค่าจริงต้องยืนยันกับสมาคมก่อนใช้งานจริง</p>
    @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    @if (!items().length) { <p class="empty-state">ยังไม่มีประเภทสมาชิก เพิ่มประเภทแรกด้านล่าง</p> }
    <ul class="doc-list">
      @for (t of items(); track t.id) {
        <li [class.is-cancelled]="!t.active">
          <span><strong>{{ t.name }}</strong> · {{ t.fee }} บาท · {{ t.durationMonths === null ? 'ตลอดชีพ' : t.durationMonths + ' เดือน' }}{{ t.active ? '' : ' · ปิดใช้งาน' }}</span>
          <span class="doc-actions"><button type="button" class="button-secondary" (click)="toggle(t)">{{ t.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน' }}</button><button type="button" class="button-secondary" (click)="edit(t)">แก้ไข</button></span>
        </li>
      }
    </ul>
    <form (ngSubmit)="save()" novalidate class="doc-upload">
      <h2>{{ editingId() ? 'แก้ไขประเภทสมาชิก' : 'เพิ่มประเภทสมาชิก' }}</h2>
      <div class="form-grid">
        <div class="intake-field"><label for="t-name">ชื่อประเภท</label><input id="t-name" name="name" [(ngModel)]="f.name" maxlength="100" /></div>
        <div class="intake-field"><label for="t-fee">ค่าสมาชิก (บาท)</label><input id="t-fee" name="fee" inputmode="decimal" [(ngModel)]="f.fee" /></div>
      </div>
      <label class="choice"><input type="checkbox" name="life" [(ngModel)]="f.lifetime" /> ตลอดชีพ (ไม่มีวันหมดอายุ)</label>
      @if (!f.lifetime) { <div class="intake-field"><label for="t-months">ระยะเวลา (เดือน) ใช้เสนอวันหมดอายุเมื่อบันทึกการชำระเงิน</label><input id="t-months" name="months" type="number" min="1" max="600" [(ngModel)]="f.months" /></div> }
      <div class="form-actions"><button class="button-primary" type="submit" [disabled]="busy()">{{ editingId() ? 'บันทึกการแก้ไข' : 'เพิ่มประเภท' }}</button>@if (editingId()) { <button class="button-secondary" type="button" (click)="reset()">ยกเลิกการแก้ไข</button> }</div>
    </form>
  </main>`,
})
export class TiersComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly items = signal<TierRecord[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly editingId = signal('');
  f = { name: '', fee: '', lifetime: false, months: 12 as number | null };
  ngOnInit() { void this.load(); }
  async load() { try { this.items.set((await this.api.request<{ items: TierRecord[] }>('/membership-tiers')).items); } catch (e) { this.error.set(errorText(e)); } }
  edit(t: TierRecord) { this.editingId.set(t.id); this.f = { name: t.name, fee: t.fee, lifetime: t.durationMonths === null, months: t.durationMonths ?? 12 }; }
  reset() { this.editingId.set(''); this.f = { name: '', fee: '', lifetime: false, months: 12 }; }
  async toggle(t: TierRecord) { try { await this.api.request(`/membership-tiers/${t.id}`, 'PATCH', { active: !t.active }); await this.load(); } catch (e) { this.error.set(errorText(e)); } }
  async save() {
    this.busy.set(true); this.error.set(''); this.message.set('');
    const body = { name: this.f.name.trim(), fee: this.f.fee.trim(), durationMonths: this.f.lifetime ? null : Number(this.f.months) };
    try {
      if (this.editingId()) await this.api.request(`/membership-tiers/${this.editingId()}`, 'PATCH', body); else await this.api.request('/membership-tiers', 'POST', body);
      this.message.set('บันทึกแล้ว'); this.reset(); await this.load();
    } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
}
