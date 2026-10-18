import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import QRCode from 'qrcode';
import { ApiClient } from '../../core/api-client';
import { errorText, thaiDateTime } from '../../member/shared/thai';

@Component({
  selector: 'fl-staff-invites',
  imports: [FormsModule],
  template: `<main id="main-content" class="member-workspace">
    <h1>สร้างลิงก์สมัครสมาชิก</h1>
    <p class="page-intro">ส่งลิงก์ให้ผู้สมัครทาง LINE, SMS หรืออีเมล ลิงก์ใช้ได้ครั้งเดียว หมดอายุใน 7 วัน และใช้สมัครสมาชิกเท่านั้น ยังไม่ให้ลงทะเบียนคอร์สหรือดูโปรไฟล์</p>
    <form (ngSubmit)="create()" novalidate>
      <p class="section-intro">กรอกชื่อและเบอร์ล่วงหน้าได้ (ไม่บังคับ) ผู้สมัครแก้ไขได้เอง</p>
      <div class="form-grid">
        <div class="intake-field"><label for="i-first">ชื่อ</label><input id="i-first" name="firstName" [(ngModel)]="firstName" maxlength="100" /></div>
        <div class="intake-field"><label for="i-last">นามสกุล</label><input id="i-last" name="lastName" [(ngModel)]="lastName" maxlength="100" /></div>
        <div class="intake-field"><label for="i-phone">เบอร์มือถือ</label><input id="i-phone" name="phone" type="tel" inputmode="numeric" [(ngModel)]="phone" maxlength="12" /></div>
      </div>
      <div class="form-actions"><button class="button-primary" type="submit" [disabled]="busy()">{{ busy() ? 'กำลังสร้าง…' : 'สร้างลิงก์' }}</button></div>
    </form>
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    @if (link(); as made) {
      <section class="intake-section" aria-live="polite">
        <h2>ลิงก์พร้อมใช้งาน</h2>
        <p class="record-state">หมดอายุ {{ dateTime(made.expiresAt) }}</p>
        <label for="invite-url">ลิงก์สมัครสมาชิก</label>
        <input id="invite-url" readonly [value]="made.url" (focus)="select($event)" />
        <div class="form-actions"><button class="button-secondary" type="button" (click)="copy(made.url)">{{ copied() ? 'คัดลอกแล้ว' : 'คัดลอกลิงก์' }}</button></div>
        @if (qr()) { <img class="qr" [src]="qr()" width="280" height="280" alt="รหัส QR ของลิงก์สมัครสมาชิก" /> }
      </section>
    }
  </main>`,
})
export class InvitesComponent {
  private readonly api = inject(ApiClient);
  readonly link = signal<{ url: string; expiresAt: string } | null>(null);
  readonly qr = signal('');
  readonly busy = signal(false);
  readonly copied = signal(false);
  readonly error = signal('');
  readonly dateTime = thaiDateTime;
  firstName = '';
  lastName = '';
  phone = '';
  select(event: Event) { (event.target as HTMLInputElement).select(); }
  async copy(url: string) {
    try { await navigator.clipboard.writeText(url); this.copied.set(true); } catch { this.error.set('คัดลอกอัตโนมัติไม่ได้ กรุณากดค้างที่ช่องลิงก์เพื่อคัดลอก'); }
  }
  async create() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.copied.set(false);
    const prefill: Record<string, string> = {};
    if (this.firstName.trim()) prefill['firstName'] = this.firstName.trim();
    if (this.lastName.trim()) prefill['lastName'] = this.lastName.trim();
    if (this.phone.trim()) prefill['phoneMobile'] = this.phone.trim();
    try {
      const made = await this.api.request<{ url: string; expiresAt: string }>('/member/invites', 'POST', { mode: 'signup', prefill });
      this.link.set(made);
      this.qr.set(await QRCode.toDataURL(made.url, { margin: 2, width: 280 }));
    } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
}
