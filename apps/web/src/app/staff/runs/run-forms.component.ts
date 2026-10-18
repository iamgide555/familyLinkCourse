import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { RegistrationView } from '../../../../../../packages/contracts/src/bookings';
import type { RunRecord } from '../../../../../../packages/contracts/src/courses';
import { ApiClient } from '../../core/api-client';
import { SessionService } from '../../core/session.service';
import { errorText } from '../../member/shared/thai';
import { saveBlob } from '../reports/reports.component';

/** Batch printing of sign-up forms for members who have not yet signed, plus the registration export. */
@Component({
  selector: 'fl-run-forms',
  imports: [FormsModule],
  template: `<section class="intake-section" aria-labelledby="forms-h">
    <h2 id="forms-h">แบบฟอร์มและรายงาน</h2>
    @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    <h3>พิมพ์แบบคำขอสำหรับสมาชิกที่ยังไม่ได้ลงนาม</h3>
    <p class="section-intro">พิมพ์ก่อนวันเรียนหรือเมื่อสมาชิกมาถึง ส่วนบันทึกของเจ้าหน้าที่เว้นว่างไว้ เมื่อได้รับเอกสารลงนามแล้ว ให้กดบันทึกที่หน้าโปรไฟล์สมาชิก การพิมพ์ไม่ถือว่าลงนามแล้ว</p>
    @if (!unsigned().length) { <p class="empty-state">ไม่มีสมาชิกที่ยังไม่ได้ลงนามในรอบนี้</p> }
    @else {
      <div class="form-actions"><button class="button-secondary" type="button" (click)="toggleAll()">{{ chosen().length === unsigned().length ? 'ไม่เลือกทั้งหมด' : 'เลือกทั้งหมด' }}</button>
        <span class="record-state">เลือก {{ chosen().length }} จาก {{ unsigned().length }} คน (พิมพ์ได้ครั้งละไม่เกิน 20 คน)</span></div>
      <ul class="choice-list-plain">@for (m of unsigned(); track m.memberId) { <li><label class="choice"><input type="checkbox" [checked]="chosen().includes(m.memberId)" (change)="toggle(m.memberId)" /> {{ m.memberName }} ({{ m.memberNumber }})</label></li> }</ul>
      <div class="form-actions"><button class="button-primary" type="button" [disabled]="printing() || !chosen().length || chosen().length > 20" (click)="print()">{{ printing() ? 'กำลังสร้าง PDF…' : 'เปิด PDF สำหรับพิมพ์' }}</button></div>
    }
    <h3>ส่งออก Excel ผู้ลงทะเบียน</h3>
    <p class="section-intro">หนึ่งแถวต่อหนึ่งการลงทะเบียน{{ run.perSessionRegistration ? ' (รายวัน: หนึ่งแถวต่อสมาชิกต่อวันเรียน)' : '' }} พร้อมคำตอบ สถานะ และการเข้าร่วม</p>
    @if (isAdmin()) { <label class="choice"><input type="checkbox" name="rs" [(ngModel)]="sensitive" /> รวมข้อมูลอ่อนไหว (เลขบัตรประชาชน ประเภทความพิการ รายได้ คำตอบที่ทำเครื่องหมายอ่อนไหว)</label> }
    <div class="form-actions"><button class="button-secondary" type="button" [disabled]="exporting()" (click)="exportRun()">{{ exporting() ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลด Excel' }}</button></div>
  </section>`,
})
export class RunFormsComponent implements OnChanges {
  @Input({ required: true }) run!: RunRecord;
  @Input() refreshKey = 0;
  private readonly api = inject(ApiClient);
  private readonly session = inject(SessionService);
  readonly unsigned = signal<RegistrationView[]>([]);
  readonly chosen = signal<string[]>([]);
  readonly printing = signal(false);
  readonly exporting = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  sensitive = false;
  isAdmin() { return this.session.user()?.role === 'admin'; }
  async ngOnChanges() {
    try {
      const items = (await this.api.request<{ items: RegistrationView[] }>(`/runs/${this.run.id}/registrations`)).items;
      const seen = new Set<string>();
      this.unsigned.set(items.filter((r) => r.unsigned && r.entries.some((e) => e.status === 'submitted' || e.status === 'confirmed') && !seen.has(r.memberId) && !!seen.add(r.memberId)));
      this.chosen.update((c) => c.filter((id) => this.unsigned().some((u) => u.memberId === id)));
    } catch { this.unsigned.set([]); }
  }
  toggle(id: string) { this.chosen.update((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])); }
  toggleAll() { this.chosen.set(this.chosen().length === this.unsigned().length ? [] : this.unsigned().slice(0, 20).map((u) => u.memberId)); }
  async print() {
    this.error.set(''); this.message.set('');
    const tab = window.open('', '_blank');
    if (!tab) { this.error.set('เบราว์เซอร์ปิดกั้นหน้าต่าง PDF กรุณาอนุญาตแล้วลองอีกครั้ง'); return; }
    tab.opener = null;
    tab.document.body.textContent = 'กำลังเตรียม PDF…';
    this.printing.set(true);
    try {
      const blob = await this.api.blob('/forms/signup', 'POST', { memberIds: this.chosen() });
      const url = URL.createObjectURL(blob);
      const frame = tab.document.createElement('iframe');
      frame.title = 'แบบคำขอรับบริการ PDF'; frame.src = url; frame.style.cssText = 'width:100%;height:100vh;border:0';
      tab.document.body.style.margin = '0';
      tab.document.body.replaceChildren(frame);
      setTimeout(() => URL.revokeObjectURL(url), 300000);
      this.message.set(`สร้างแบบคำขอ ${this.chosen().length} ฉบับแล้ว บันทึกการพิมพ์ไว้ในประวัติ`);
    } catch (e) { tab.close(); this.error.set(errorText(e)); } finally { this.printing.set(false); }
  }
  async exportRun() {
    this.exporting.set(true); this.error.set(''); this.message.set('');
    try { saveBlob(await this.api.blob(`/reports/runs/${this.run.id}.xlsx${this.isAdmin() && this.sensitive ? '?sensitive=1' : ''}`), `ผู้ลงทะเบียน-${this.run.batchName}.xlsx`); this.message.set('สร้างไฟล์เรียบร้อย กำลังดาวน์โหลด'); }
    catch (e) { this.error.set(errorText(e)); } finally { this.exporting.set(false); }
  }
}
