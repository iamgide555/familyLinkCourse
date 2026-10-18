import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import type { MemberRecord } from '../../../../../../packages/contracts/src/members';
import { ApiClient } from '../../core/api-client';

@Component({
  selector: 'fl-signup-form-actions',
  template: `
    <section class="intake-section" aria-labelledby="paper-form-heading">
      <h2 id="paper-form-heading">แบบคำขอรับบริการ</h2>
      <p>พิมพ์แบบคำขอที่กรอกข้อมูลสมาชิกไว้ แล้วให้สมาชิกหรือผู้แทนลงชื่อบนกระดาษ</p>
      <div class="form-actions">
        <button class="button-primary" type="button" [disabled]="printing()" (click)="print()">
          {{ printing() ? 'กำลังสร้าง PDF…' : 'เปิด PDF สำหรับพิมพ์' }}
        </button>
        @if (!member.signedFormAt) {
          <button class="button-secondary" type="button" [attr.aria-expanded]="confirming()" (click)="confirming.set(!confirming())">
            ได้รับเอกสารลงนามแล้ว
          </button>
        } @else {
          <span role="status">รับเอกสารลงนามแล้ว</span>
        }
      </div>
      @if (confirming() && !member.signedFormAt) {
        <div class="confirm-box" role="group" aria-label="ยืนยันการรับเอกสารลงนาม">
          <p>ยืนยันว่าได้รับกระดาษที่สมาชิกหรือผู้แทนลงชื่อแล้ว ระบบจะบันทึกวันที่วันนี้ไว้ในข้อมูลสมาชิก</p>
          <div class="form-actions">
            <button class="button-primary" type="button" [disabled]="receiving()" (click)="receiveSignature()">
              {{ receiving() ? 'กำลังบันทึก…' : 'ยืนยันบันทึกว่าได้รับแล้ว' }}
            </button>
            <button class="button-secondary" type="button" [disabled]="receiving()" (click)="confirming.set(false)">ยังไม่ได้รับ</button>
          </div>
        </div>
      }
      @if (printError()) { <p class="notice notice-error" role="alert">{{ printError() }}</p> }
      @if (receiptError()) { <p class="notice notice-error" role="alert">{{ receiptError() }}</p> }
    </section>
  `,
  styles: [`
    .form-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem; }
    .notice { margin-top: 0.75rem; }
  `],
})
export class SignupFormActionsComponent {
  @Input({ required: true }) member!: MemberRecord;
  @Output() signed = new EventEmitter<void>();
  private readonly api = inject(ApiClient);
  readonly printing = signal(false);
  readonly receiving = signal(false);
  readonly confirming = signal(false);
  readonly printError = signal('');
  readonly receiptError = signal('');

  async print(): Promise<void> {
    if (this.printing()) return;
    this.printError.set('');
    const tab = window.open('', '_blank');
    if (!tab) {
      this.printError.set('เบราว์เซอร์ปิดกั้นหน้าต่าง PDF กรุณาอนุญาตแล้วลองอีกครั้ง');
      return;
    }
    tab.opener = null;
    tab.document.title = 'กำลังเตรียมแบบคำขอ';
    tab.document.body.textContent = 'กำลังเตรียม PDF…';
    this.printing.set(true);
    try {
      const response = await fetch('/api/forms/signup', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          ...(this.api.csrfToken ? { 'X-CSRF-Token': this.api.csrfToken } : {}),
        },
        body: JSON.stringify({ memberIds: [this.member.id] }),
        signal: AbortSignal.timeout(35000),
      });
      if (!response.ok) {
        const failure = await response.json().catch(() => null);
        throw new Error(failure?.message ?? 'ยังสร้าง PDF ไม่ได้ กรุณาลองอีกครั้ง');
      }
      if (!response.headers.get('content-type')?.startsWith('application/pdf'))
        throw new Error('ระบบส่งเอกสารผิดรูปแบบ กรุณาลองอีกครั้ง');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const frame = tab.document.createElement('iframe');
      frame.title = 'แบบคำขอรับบริการ PDF';
      frame.src = url;
      frame.style.width = '100%';
      frame.style.height = '100vh';
      frame.style.border = '0';
      tab.document.body.style.margin = '0';
      tab.document.body.replaceChildren(frame);
      window.setTimeout(() => URL.revokeObjectURL(url), 300000);
    } catch (error) {
      tab.close();
      this.printError.set(error instanceof Error ? error.message : 'ยังสร้าง PDF ไม่ได้ กรุณาลองอีกครั้ง');
    } finally {
      this.printing.set(false);
    }
  }

  async receiveSignature(): Promise<void> {
    if (this.receiving() || this.member.signedFormAt) return;
    this.receiptError.set('');
    this.receiving.set(true);
    try {
      await this.api.request(`/members/${this.member.id}/signature-receipt`, 'POST', {
        receivedAt: new Date().toISOString(),
      });
      this.confirming.set(false);
      this.signed.emit();
    } catch (error) {
      this.receiptError.set(error instanceof Error ? error.message : 'ยังบันทึกไม่ได้ กรุณาลองอีกครั้ง');
    } finally {
      this.receiving.set(false);
    }
  }
}
