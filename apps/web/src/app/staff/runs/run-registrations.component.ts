import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { EntryView, RegistrationView, SnapshotView } from '../../../../../../packages/contracts/src/bookings';
import type { RunRecord } from '../../../../../../packages/contracts/src/courses';
import { ApiClient } from '../../core/api-client';
import { STATUS_WORD, errorText, shortDate, thaiDateTime } from '../../member/shared/thai';

type Act = { kind: 'cancel' | 'promote'; reg: RegistrationView; entry: EntryView };
type Detail = { current: SnapshotView | null; history: SnapshotView[] };

@Component({
  selector: 'fl-run-registrations',
  imports: [FormsModule, RouterLink],
  template: `<section class="intake-section" aria-labelledby="regs-heading">
    <h2 id="regs-heading">ผู้ลงทะเบียน ({{ items().length }} คน)</h2>
    <p class="section-intro">
      @if (run.perSessionRegistration) { แต่ละวันเรียนมีที่นั่งและคิวของตัวเอง ผลของแต่ละวันแยกกัน }
      @else { จองแล้ว {{ run.reserved }} จาก {{ run.capacity }} ที่นั่ง · รอคิว {{ run.waiting }} คน @if (run.free !== null && run.free > 0 && run.waiting > 0) { · มีที่ว่าง {{ run.free }} ที่ แต่เลยเวลาเลื่อนคิวอัตโนมัติแล้ว กด “เลื่อนขึ้นเอง” หลังโทรยืนยัน } }
    </p>
    @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    @if (loading()) { <p role="status">กำลังโหลดรายชื่อ…</p> }
    @else if (!items().length) { <p class="empty-state">ยังไม่มีผู้ลงทะเบียน</p> }
    @for (reg of items(); track reg.id) {
      <article class="review-item" [attr.aria-label]="'การลงทะเบียนของ ' + reg.memberName">
        <h3><a [routerLink]="['/staff/members', reg.memberId]">{{ reg.memberName }}</a></h3>
        <p class="record-state">เลขสมาชิก {{ reg.memberNumber }} · {{ reg.source === 'walkin' ? 'ลงทะเบียนหน้างาน' : reg.registeredBy === 'staff' ? 'เจ้าหน้าที่ลงทะเบียนให้' : 'สมาชิกลงทะเบียนเอง' }} · {{ reg.unsigned ? 'ยังไม่ได้ลงนาม' : 'ลงนามแล้ว' }}</p>
        <ul class="entry-list">
          @for (e of reg.entries; track $index) {
            <li>
              <span><strong>{{ e.sessionId ? 'วันที่ ' + e.dayNo + ' · ' + date(e.date!) + ' ' + e.startTime + ' น.' : 'ทั้งคอร์ส' }}</strong><span class="dash"> — </span><span class="pill" [attr.data-status]="e.status">{{ word(e.status) }}{{ e.queuePosition ? ' (คิวที่ ' + e.queuePosition + ')' : '' }}</span>{{ e.sessionStatus === 'cancelled' ? ' · วันเรียนถูกยกเลิก' : '' }}
                @if (e.attendance) { <span class="record-state"> · {{ e.attendance === 'present' ? 'มาเรียน' : 'ไม่มา' }}</span> }</span>
              <span class="doc-actions">
                @if (e.status === 'submitted') {
                  <button type="button" class="button-primary" [disabled]="busy()" (click)="review(reg, e, true)">อนุมัติ</button>
                  <button type="button" class="button-secondary" [disabled]="busy()" (click)="review(reg, e, false)">ไม่อนุมัติ</button>
                }
                @if (e.status === 'waitlisted') { <button type="button" class="button-secondary" (click)="ask('promote', reg, e)">เลื่อนขึ้นเอง</button> }
                @if (e.status === 'submitted' || e.status === 'confirmed' || e.status === 'waitlisted') { <button type="button" class="button-danger-outline" (click)="ask('cancel', reg, e)">ยกเลิก</button> }
              </span>
            </li>
          }
        </ul>
        <button type="button" class="button-quiet" (click)="toggle(reg)">{{ open() === reg.id ? 'ซ่อนคำตอบ' : 'ดูคำตอบและประวัติการส่ง' }}</button>
        @if (open() === reg.id && detail(); as d) {
          <div class="answers" aria-live="polite">
            @for (h of reversed(d.history); track h.version) {
              <h4>ครั้งที่ {{ h.version }} · {{ dateTime(h.createdAt) }}{{ h.version === d.current?.version ? ' (ล่าสุด)' : '' }}</h4>
              @if (!h.questions.length) { <p class="field-hint">รอบนี้ไม่มีคำถามเพิ่มเติม</p> }
              <dl class="profile-fields">
                @for (q of h.questions; track q.id) { <div><dt>{{ q.label }}{{ q.sensitive ? ' (ข้อมูลอ่อนไหว)' : '' }}</dt><dd>{{ answer(h, q.id) }}</dd></div> }
              </dl>
            }
          </div>
        }
      </article>
    }
    @if (act(); as a) {
      <form class="q-draft" (ngSubmit)="confirm(a)" novalidate id="reg-act" tabindex="-1" [attr.aria-label]="a.kind === 'cancel' ? 'ยกเลิกการลงทะเบียน' : 'เลื่อนขึ้นจากคิวรอ'">
        <h3>{{ a.kind === 'cancel' ? 'ยกเลิกการลงทะเบียนของ ' : 'เลื่อนขึ้นจากคิวรอ: ' }}{{ a.reg.memberName }}</h3>
        <div class="intake-field"><label for="act-reason">{{ a.kind === 'cancel' ? 'เหตุผลที่ยกเลิก' : 'ผลการติดต่อสมาชิก (เช่น โทรแล้ว ยืนยันว่ามาเรียน)' }}</label>
          <textarea id="act-reason" name="reason" rows="2" [(ngModel)]="reason"></textarea></div>
        <div class="form-actions"><button class="button-primary" type="submit" [disabled]="busy() || !reason.trim()">ยืนยัน</button><button class="button-secondary" type="button" (click)="act.set(null)">ปิด</button></div>
      </form>
    }
  </section>`,
})
export class RunRegistrationsComponent {
  @Input({ required: true }) run!: RunRecord;
  @Input() set refreshKey(_: number) { void this.load(); }
  @Output() changed = new EventEmitter<void>();
  private readonly api = inject(ApiClient);
  readonly items = signal<RegistrationView[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly act = signal<Act | null>(null);
  readonly open = signal('');
  readonly detail = signal<Detail | null>(null);
  readonly date = shortDate;
  readonly dateTime = thaiDateTime;
  reason = '';
  word(status: string) { return STATUS_WORD[status] ?? status; }
  reversed<T>(list: T[]): T[] { return [...list].reverse(); }
  answer(h: SnapshotView, id: string): string {
    const q = h.questions.find((x) => x.id === id)!;
    const v = h.answers[id];
    if (v === undefined || v === '') return 'ไม่ได้ตอบ';
    const label = (opt: string) => q.options.find((o) => o.id === opt)?.label ?? opt;
    return Array.isArray(v) ? v.map(label).join(', ') : q.type === 'single_choice' || q.type === 'dropdown' ? label(v) : v;
  }
  async load() {
    this.loading.set(true);
    try { this.items.set((await this.api.request<{ items: RegistrationView[] }>(`/runs/${this.run.id}/registrations`)).items); }
    catch (e) { this.error.set(errorText(e)); } finally { this.loading.set(false); }
  }
  async toggle(reg: RegistrationView) {
    if (this.open() === reg.id) { this.open.set(''); return; }
    try { this.detail.set(await this.api.request<Detail>(`/registrations/${reg.id}`)); this.open.set(reg.id); } catch (e) { this.error.set(errorText(e)); }
  }
  ask(kind: Act['kind'], reg: RegistrationView, entry: EntryView) {
    this.reason = ''; this.act.set({ kind, reg, entry });
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('reg-act')?.focus()));
  }
  private async go(task: () => Promise<unknown>, done: string) {
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await task(); this.message.set(done); this.act.set(null); this.changed.emit(); await this.load(); } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
  review(reg: RegistrationView, e: EntryView, approve: boolean) {
    return this.go(() => this.api.request(`/registrations/${reg.id}/review`, 'POST', { sessionIds: e.sessionId ? [e.sessionId] : [], approve }), approve ? `อนุมัติ ${reg.memberName} แล้ว` : `ไม่อนุมัติ ${reg.memberName} แล้ว ที่นั่งถูกปล่อยให้คิวถัดไป`);
  }
  confirm(a: Act) {
    const sessionIds = a.entry.sessionId ? [a.entry.sessionId] : [];
    if (a.kind === 'promote') return this.go(() => this.api.request(`/registrations/${a.reg.id}/promote`, 'POST', { sessionId: a.entry.sessionId, reason: this.reason.trim() }), `เลื่อน ${a.reg.memberName} ขึ้นจากคิวแล้ว`);
    return this.go(() => this.api.request(`/registrations/${a.reg.id}/cancel`, 'POST', { sessionIds, reason: this.reason.trim(), operationKey: crypto.randomUUID() }), `ยกเลิกการลงทะเบียนของ ${a.reg.memberName} แล้ว`);
  }
}
