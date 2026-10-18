import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { EntryView, RegistrationView } from '../../../../../../packages/contracts/src/bookings';
import { ApiRequestError } from '../../core/api-client';
import { MemberApi, MemberSession } from '../../core/member-api';
import { STATUS_WORD, errorText, shortDate, thaiDateTime } from '../shared/thai';

@Component({
  selector: 'fl-member-registrations',
  imports: [RouterLink],
  template: `<main id="main-content" class="member-workspace line-page">
    <h1>การลงทะเบียนของฉัน</h1>
    @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    @if (loading()) { <p role="status">กำลังโหลด…</p> }
    @else if (!items().length && !error()) {
      <div class="empty-state"><h2>ยังไม่มีการลงทะเบียน</h2><p>เลือกคอร์สที่สนใจได้ที่เมนู “ลงทะเบียนคอร์ส”</p><a class="button-primary" routerLink="/member/courses">ดูคอร์สที่เปิดรับ</a></div>
    }
    @for (r of items(); track r.id) {
      <article class="review-item" [attr.aria-label]="r.courseName + ' ของ ' + r.memberName">
        <h2>{{ r.courseName }}</h2>
        <p class="record-state">{{ r.batchName }} · ลงทะเบียนให้ {{ r.memberName }}</p>
        <ul class="entry-list">
          @for (e of r.entries; track $index) {
            <li><span><strong>{{ e.sessionId ? 'วันที่ ' + e.dayNo + ' · ' + date(e.date!) : 'ทั้งคอร์ส' }}</strong><span class="dash"> — </span><span class="pill" [attr.data-status]="e.status">{{ word(e.status) }}{{ e.queuePosition ? ' (คิวที่ ' + e.queuePosition + ')' : '' }}</span>{{ e.sessionStatus === 'cancelled' ? ' · วันเรียนถูกยกเลิกโดยสมาคม' : '' }}</span>
              @if (active(e)) {
                @if (confirming() === key(r, e)) {
                  <span class="doc-actions"><button type="button" class="button-danger" [disabled]="busy()" (click)="cancel(r, e)">ยืนยันยกเลิก</button><button type="button" class="button-secondary" (click)="confirming.set('')">ไม่ยกเลิก</button></span>
                } @else if (r.canSelfCancel) { <button type="button" class="button-danger-outline" (click)="confirming.set(key(r, e))">ยกเลิก{{ e.sessionId ? 'วันนี้' : 'การลงทะเบียน' }}</button> }
              }
            </li>
          }
        </ul>
        @if (hasActive(r)) {
          <p class="field-hint">{{ r.canSelfCancel ? 'ยกเลิกเองได้ถึง ' + (r.cancelDeadline ? dateTime(r.cancelDeadline) : '') : 'เลยกำหนดยกเลิกเองแล้ว ติดต่อเจ้าหน้าที่เพื่อยกเลิก' }}</p>
        }
        @if (r.unsigned) { <p class="field-hint">เจ้าหน้าที่จะให้ลงนามแบบฟอร์มกระดาษเมื่อมาที่สมาคม ไม่กระทบสิทธิ์ลงทะเบียน</p> }
      </article>
    }
  </main>`,
})
export class MemberRegistrationsComponent implements OnInit {
  private readonly api = inject(MemberApi);
  readonly session = inject(MemberSession);
  readonly items = signal<RegistrationView[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly confirming = signal('');
  readonly date = shortDate;
  readonly dateTime = thaiDateTime;
  private ops = new Map<string, string>();
  word(s: string) { return STATUS_WORD[s] ?? s; }
  active(e: EntryView) { return ['submitted', 'confirmed', 'waitlisted'].includes(e.status); }
  hasActive(r: RegistrationView) { return r.entries.some((e) => this.active(e)); }
  key(r: RegistrationView, e: EntryView) { return `${r.id}:${e.sessionId ?? 'run'}`; }
  async ngOnInit() { await this.load(); }
  async load() {
    this.loading.set(true);
    if (!this.session.signedIn) { this.error.set(this.session.devMode ? 'ยังไม่ได้เลือกบัญชี LINE จำลอง' : 'กรุณาเปิดหน้านี้จากเมนูใน LINE'); this.loading.set(false); return; }
    try { this.items.set((await this.api.request<{ items: RegistrationView[] }>('/registrations')).items); }
    catch (e) { this.error.set(errorText(e)); } finally { this.loading.set(false); }
  }
  async cancel(r: RegistrationView, e: EntryView) {
    const k = this.key(r, e);
    const op = this.ops.get(k) ?? crypto.randomUUID();
    this.ops.set(k, op);
    this.busy.set(true); this.error.set(''); this.message.set('');
    try {
      await this.api.request(`/registrations/${r.id}/cancel`, 'POST', { sessionIds: e.sessionId ? [e.sessionId] : [], operationKey: op });
      this.ops.delete(k); this.confirming.set(''); this.message.set('ยกเลิกเรียบร้อยแล้ว'); await this.load();
    } catch (err) {
      this.error.set(errorText(err));
      if (err instanceof ApiRequestError && err.status !== 0) this.ops.delete(k);
      this.confirming.set(''); await this.load().catch(() => undefined);
    } finally { this.busy.set(false); }
  }
}
