import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { ConsentPurposeKey, OrganizationSettings } from '../../../../../../packages/contracts/src/settings';
import { ApiClient } from '../../core/api-client';
import { errorText } from '../../member/shared/thai';

const CONSENT_LABEL: Record<ConsentPurposeKey, string> = { privacy: 'ข้อความรับทราบประกาศความเป็นส่วนตัว (จำเป็น)', sensitiveUpload: 'ข้อความยินยอมก่อนแนบเอกสาร', news: 'ข้อความยินยอมรับข่าวสาร (ไม่บังคับ)', photo: 'ข้อความยินยอมถ่ายภาพ (ไม่บังคับ)' };
const KIND_LABEL: Record<string, string> = {
  'signup.linked': 'ผลใบสมัคร: เชื่อมกับสมาชิกเดิมแล้ว', 'signup.created': 'ผลใบสมัคร: สร้างสมาชิกใหม่แล้ว', 'signup.rejected': 'ผลใบสมัคร: ไม่ผ่านการยืนยัน',
  'profile.approved': 'อนุมัติการแก้ไขข้อมูล', 'profile.rejected': 'ไม่อนุมัติการแก้ไขข้อมูล', 'registration.submitted': 'ลงทะเบียนแล้ว รออนุมัติ', 'registration.confirmed': 'ลงทะเบียนสำเร็จ',
  'registration.waitlisted': 'อยู่ในคิวรอ', 'registration.approved': 'อนุมัติการลงทะเบียน', 'registration.rejected': 'ไม่อนุมัติการลงทะเบียน', 'waitlist.promoted': 'เลื่อนขึ้นจากคิวรอ',
  'session.reminder': 'เตือนก่อนวันเรียน 1 วัน', 'session.cancelled': 'ยกเลิกวันเรียน', 'run.cancelled': 'ยกเลิกทั้งรอบ', 'session.rescheduled': 'เลื่อนวันเรียน',
};

@Component({
  selector: 'fl-org-settings',
  imports: [FormsModule, RouterLink],
  template: `<main id="main-content" class="member-workspace">
    <a class="back-link" routerLink="/staff/settings">กลับไปตั้งค่าระบบ</a>
    <h1>ข้อความและการตั้งค่าองค์กร</h1>
    @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    @if (!s()) { <p role="status">กำลังโหลด…</p> }
    @else {
      <section class="intake-section" aria-labelledby="c-h"><h2 id="c-h">ข้อความยินยอม</h2>
        <p class="section-intro">ข้อความที่สมาชิกเห็นตอนสมัคร เมื่อแก้ไข ระบบจะออกเวอร์ชันใหม่ และบันทึกยินยอมเดิมยังอ้างอิงเวอร์ชันที่สมาชิกเคยยอมรับ ข้อความฉบับจริงต้องผ่านการตรวจจากทนายความของสมาคมก่อนใช้งานจริง</p>
        @for (k of consentKeys; track k) {
          <div class="intake-field"><label [attr.for]="'cs-' + k">{{ consentLabel(k) }}</label><textarea [id]="'cs-' + k" [name]="'cs-' + k" rows="3" [(ngModel)]="consents[k]"></textarea>
            <p class="field-hint">เวอร์ชันปัจจุบัน: {{ s()!.consents[k].version }}</p></div>
        }
        <div class="form-actions"><button class="button-primary" type="button" [disabled]="busy()" (click)="saveConsents()">บันทึกข้อความยินยอม</button></div>
      </section>
      <section class="intake-section" aria-labelledby="p-h"><h2 id="p-h">แบบฟอร์ม PDF</h2>
        <div class="form-grid"><div class="intake-field"><label for="pdf-title">ชื่อหัวแบบฟอร์ม</label><input id="pdf-title" name="title" [(ngModel)]="pdf.title" maxlength="200" /></div>
          <div class="intake-field"><label for="pdf-foot">ข้อความท้ายแบบฟอร์ม (ไม่บังคับ)</label><input id="pdf-foot" name="footer" [(ngModel)]="pdf.footer" maxlength="200" /></div></div>
        <div class="form-actions"><button class="button-primary" type="button" [disabled]="busy()" (click)="savePdf()">บันทึกแบบฟอร์ม PDF</button></div>
      </section>
      <section class="intake-section" aria-labelledby="m-h"><h2 id="m-h">ข้อความแจ้งเตือน</h2>
        <p class="section-intro">ใช้ตัวแทนข้อความได้เฉพาะ: {{ '{{member}}' }} ชื่อสมาชิก · {{ '{{course}}' }} ชื่อคอร์ส · {{ '{{sessions}}' }} วันเรียน · {{ '{{date}}' }} วันที่ · {{ '{{outcome}}' }} ผล ห้ามใส่ลิงก์หรือเครื่องหมาย &lt; &gt; ข้อความไม่มีข้อมูลอ่อนไหว</p>
        @for (k of kinds(); track k) {
          <div class="intake-field"><label [attr.for]="'ms-' + k">{{ kindLabel(k) }}</label><textarea [id]="'ms-' + k" [name]="'ms-' + k" rows="2" [(ngModel)]="messages[k]" maxlength="400"></textarea></div>
        }
        <div class="form-actions"><button class="button-primary" type="button" [disabled]="busy()" (click)="saveMessages()">บันทึกข้อความแจ้งเตือน</button></div>
      </section>
      <section class="intake-section" aria-labelledby="r-h"><h2 id="r-h">ระยะเวลาเก็บข้อมูล</h2>
        <p class="section-intro">เว้นว่างไว้ = เก็บตลอดไป (ค่าตั้งต้น) ระบบจะไม่ลบสมาชิกหรือเอกสารจนกว่าจะกำหนดเป็นจำนวนวัน (30–36500)</p>
        <div class="form-grid">
          <div class="intake-field"><label for="ret-g">ข้อมูลสมาชิกทั่วไป (วัน)</label><input id="ret-g" name="g" type="number" min="30" [(ngModel)]="retention.generalDays" /></div>
          <div class="intake-field"><label for="ret-s">ข้อมูลอ่อนไหว (วัน)</label><input id="ret-s" name="s" type="number" min="30" [(ngModel)]="retention.sensitiveDays" /></div>
          <div class="intake-field"><label for="ret-i">สำเนาบัตรและเอกสาร (วัน)</label><input id="ret-i" name="i" type="number" min="30" [(ngModel)]="retention.idCopyDays" /></div>
        </div>
        <div class="form-actions"><button class="button-primary" type="button" [disabled]="busy()" (click)="saveRetention()">บันทึกระยะเวลาเก็บข้อมูล</button></div>
      </section>
    }
  </main>`,
})
export class OrganizationSettingsComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly s = signal<OrganizationSettings | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly consentKeys: ConsentPurposeKey[] = ['privacy', 'sensitiveUpload', 'news', 'photo'];
  consents: Record<ConsentPurposeKey, string> = { privacy: '', sensitiveUpload: '', news: '', photo: '' };
  pdf = { title: '', footer: '' };
  messages: Record<string, string> = {};
  retention: { generalDays: number | null; sensitiveDays: number | null; idCopyDays: number | null } = { generalDays: null, sensitiveDays: null, idCopyDays: null };
  consentLabel(k: ConsentPurposeKey) { return CONSENT_LABEL[k]; }
  kindLabel(k: string) { return KIND_LABEL[k] ?? k; }
  kinds() { return Object.keys(this.s()!.messages); }
  async ngOnInit() { await this.load(); }
  private fill(s: OrganizationSettings) {
    this.s.set(s);
    for (const k of this.consentKeys) this.consents[k] = s.consents[k].text;
    this.pdf = { ...s.pdf }; this.messages = { ...s.messages }; this.retention = { ...s.retention };
  }
  async load() { try { this.fill(await this.api.request<OrganizationSettings>('/settings/organization')); } catch (e) { this.error.set(errorText(e)); } }
  private async save(patch: object, done: string) {
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { this.fill(await this.api.request<OrganizationSettings>('/settings/organization', 'PATCH', patch)); this.message.set(done); } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
  saveConsents() { return this.save({ consents: Object.fromEntries(this.consentKeys.map((k) => [k, { text: this.consents[k] }])) }, 'บันทึกข้อความยินยอมแล้ว (เวอร์ชันใหม่เฉพาะข้อความที่เปลี่ยน)'); }
  savePdf() { return this.save({ pdf: this.pdf }, 'บันทึกแบบฟอร์ม PDF แล้ว'); }
  saveMessages() { return this.save({ messages: this.messages }, 'บันทึกข้อความแจ้งเตือนแล้ว'); }
  saveRetention() {
    const num = (v: number | null | '') => (v === null || v === '' ? null : Number(v));
    return this.save({ retention: { generalDays: num(this.retention.generalDays), sensitiveDays: num(this.retention.sensitiveDays), idCopyDays: num(this.retention.idCopyDays) } }, 'บันทึกระยะเวลาเก็บข้อมูลแล้ว');
  }
}
