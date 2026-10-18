import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import QRCode from 'qrcode';
import type { MemberRecord } from '../../../../../../packages/contracts/src/members';
import { ApiClient } from '../../core/api-client';
import { errorText, thaiDateTime } from '../../member/shared/thai';

@Component({
  selector: 'fl-member-line-actions',
  imports: [FormsModule],
  template: `<section class="intake-section" aria-labelledby="line-heading">
    <h2 id="line-heading">การเชื่อมต่อ LINE</h2>
    @if (member.lineLinked) {
      <p>สมาชิกคนนี้เชื่อมต่อกับบัญชี LINE แล้ว ผู้ดูแลที่ใช้บัญชีนั้นเปิดโปรไฟล์และลงทะเบียนคอร์สได้</p>
      @if (!asking()) {
        <button class="button-secondary" type="button" (click)="asking.set(true)">ยกเลิกการเชื่อมต่อ LINE</button>
      } @else {
        <div class="intake-field">
          <label for="unlink-reason">เหตุผลที่ยกเลิกการเชื่อมต่อ (บันทึกไว้ในระบบ)</label>
          <textarea id="unlink-reason" name="reason" rows="2" [(ngModel)]="reason"></textarea>
        </div>
        <p class="field-hint">ผู้ดูแลเดิมจะเปิดโปรไฟล์นี้ไม่ได้ทันที ผู้ดูแลคนใหม่สมัครผ่าน LINE แล้วเจ้าหน้าที่ยืนยันที่หน้า “รอตรวจสอบ”</p>
        <div class="form-actions">
          <button class="button-danger" type="button" [disabled]="busy() || !reason.trim()" (click)="unlink()">ยืนยันยกเลิกการเชื่อมต่อ</button>
          <button class="button-secondary" type="button" (click)="asking.set(false)">ไม่ยกเลิก</button>
        </div>
      }
    } @else {
      <p>สมาชิกคนนี้ยังไม่ได้เชื่อมต่อกับ LINE สร้างรหัส QR ให้สมาชิกสแกนใน LINE เพื่อเชื่อมต่อทันที โดยไม่ต้องกรอกฟอร์มซ้ำ</p>
      <button class="button-secondary" type="button" [disabled]="busy()" (click)="issue()">{{ busy() ? 'กำลังสร้าง…' : 'สร้างรหัส QR เชื่อมต่อ LINE' }}</button>
      @if (link(); as made) {
        <div aria-live="polite">
          <p class="record-state">ใช้ได้ครั้งเดียว หมดอายุ {{ dateTime(made.expiresAt) }}</p>
          @if (qr()) { <img class="qr" [src]="qr()" width="280" height="280" alt="รหัส QR เชื่อมต่อ LINE ของ {{ member.firstName }}" /> }
          <label for="link-url">ลิงก์สำหรับส่งทางแชท LINE หรือ SMS</label>
          <input id="link-url" readonly [value]="made.url" />
        </div>
      }
    }
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
  </section>`,
})
export class MemberLineActionsComponent implements OnInit {
  @Input({ required: true }) member!: MemberRecord;
  /** Right after a paper member is saved, show the one-time link QR without another click. */
  @Input() autoIssue = false;
  @Output() changed = new EventEmitter<void>();
  private readonly api = inject(ApiClient);
  readonly busy = signal(false);
  readonly asking = signal(false);
  readonly error = signal('');
  readonly link = signal<{ url: string; expiresAt: string } | null>(null);
  readonly qr = signal('');
  readonly dateTime = thaiDateTime;
  reason = '';
  ngOnInit() { if (this.autoIssue && !this.member.lineLinked) void this.issue(); }
  async issue() {
    this.busy.set(true); this.error.set('');
    try {
      const made = await this.api.request<{ url: string; expiresAt: string }>('/member/invites', 'POST', { mode: 'link', memberId: this.member.id });
      this.link.set(made);
      this.qr.set(await QRCode.toDataURL(made.url, { margin: 2, width: 280 }));
    } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
  async unlink() {
    this.busy.set(true); this.error.set('');
    try {
      await this.api.request(`/members/${this.member.id}/unlink`, 'POST', { reason: this.reason.trim() });
      this.asking.set(false); this.reason = '';
      this.changed.emit();
    } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
}
