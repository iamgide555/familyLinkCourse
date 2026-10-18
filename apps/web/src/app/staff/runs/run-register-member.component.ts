import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { BookingResult } from '../../../../../../packages/contracts/src/bookings';
import type { RunRecord } from '../../../../../../packages/contracts/src/courses';
import type { MemberSearchResult, MemberSummary } from '../../../../../../packages/contracts/src/members';
import type { Answers } from '../../../../../../packages/contracts/src/questions';
import { ApiClient, ApiRequestError } from '../../core/api-client';
import { STATUS_WORD, errorText, shortDate } from '../../member/shared/thai';
import { QuestionFormComponent } from '../../shared/question-form.component';

@Component({
  selector: 'fl-run-register-member',
  imports: [FormsModule, QuestionFormComponent],
  template: `<section class="intake-section" aria-labelledby="reg-member-heading">
    <h2 id="reg-member-heading">ลงทะเบียนให้สมาชิก</h2>
    <p class="section-intro">ใช้เมื่อสมาชิกแจ้งทางโทรศัพท์หรือแจ้งเป็นกระดาษ ที่นั่ง คิว และการอนุมัติใช้กติกาเดียวกับที่สมาชิกลงทะเบียนเอง สมาชิกต้องมีข้อมูลในระบบก่อน</p>
    <form class="member-search" (ngSubmit)="search()" novalidate>
      <div><label for="rm-q">ค้นหาสมาชิก (ชื่อ เบอร์ หรือเลขสมาชิก)</label><input id="rm-q" name="q" type="search" [(ngModel)]="q" /></div>
      <button class="button-secondary" type="submit">ค้นหา</button>
    </form>
    @if (found().length && !picked()) {
      <ul class="choice-list">@for (m of found(); track m.id) { <li><span>{{ m.firstName }} {{ m.lastName }} · {{ m.memberNumber }}</span><button class="button-secondary" type="button" (click)="pick(m)">เลือกคนนี้</button></li> }</ul>
    }
    @if (picked(); as m) {
      <form (ngSubmit)="submit()" novalidate>
        <h3>ลงทะเบียน: {{ m.firstName }} {{ m.lastName }}</h3>
        @if (run.perSessionRegistration) {
          <fieldset class="intake-field"><legend class="q-label">เลือกวันเรียน</legend>
            @for (s of liveSessions(); track s.id) { <label class="choice"><input type="checkbox" [checked]="chosen().includes(s.id)" (change)="toggle(s.id)" /> วันที่ {{ s.dayNo }} · {{ date(s.date) }} {{ s.startTime }} น. @if (s.free !== null && s.free <= 0) { (เต็ม) } </label> }
          </fieldset>
        }
        <fl-question-form [questions]="run.questions" [answers]="answers" [errors]="fieldErrors()" />
        @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
        <div class="form-actions"><button class="button-primary" type="submit" [disabled]="busy()">{{ busy() ? 'กำลังบันทึก…' : 'บันทึกการลงทะเบียน' }}</button><button class="button-secondary" type="button" (click)="reset()">เลือกคนอื่น</button></div>
      </form>
    }
    @if (result(); as r) {
      <div class="notice notice-success" role="status"><p>บันทึกแล้ว ผลของแต่ละรายการ:</p>
        <ul>@for (o of r.outcomes; track $index) { <li>{{ o.sessionId ? sessionName(o.sessionId) : 'ทั้งคอร์ส' }}: {{ word(o.status) }}{{ o.queuePosition ? ' (คิวที่ ' + o.queuePosition + ')' : '' }}</li> }</ul></div>
    }
  </section>`,
})
export class RunRegisterMemberComponent {
  @Input({ required: true }) run!: RunRecord;
  @Output() changed = new EventEmitter<void>();
  private readonly api = inject(ApiClient);
  readonly found = signal<MemberSummary[]>([]);
  readonly picked = signal<MemberSummary | null>(null);
  readonly chosen = signal<string[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly result = signal<BookingResult | null>(null);
  readonly date = shortDate;
  q = '';
  answers: Answers = {};
  private op = crypto.randomUUID();
  word(s: string) { return STATUS_WORD[s] ?? s; }
  liveSessions() { return this.run.sessions.filter((s) => s.status === 'scheduled'); }
  sessionName(id: string) { const s = this.run.sessions.find((x) => x.id === id); return s ? `วันที่ ${s.dayNo} · ${shortDate(s.date)}` : 'วันเรียน'; }
  async search() {
    try { this.found.set((await this.api.request<MemberSearchResult>(`/members?q=${encodeURIComponent(this.q.trim())}&page=1`)).items); } catch (e) { this.error.set(errorText(e)); }
  }
  pick(m: MemberSummary) { this.picked.set(m); this.answers = {}; this.chosen.set([]); this.result.set(null); this.op = crypto.randomUUID(); }
  reset() { this.picked.set(null); this.result.set(null); this.error.set(''); this.fieldErrors.set({}); }
  toggle(id: string) { this.chosen.update((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])); }
  async submit() {
    const m = this.picked();
    if (!m || this.busy()) return;
    this.busy.set(true); this.error.set(''); this.fieldErrors.set({});
    try {
      const result = await this.api.request<BookingResult>(`/runs/${this.run.id}/registrations`, 'POST', { memberId: m.id, sessionIds: this.run.perSessionRegistration ? this.chosen() : [], answers: this.answers, operationKey: this.op });
      this.result.set(result); this.picked.set(null); this.changed.emit();
    } catch (e) {
      if (e instanceof ApiRequestError && e.fields) this.fieldErrors.set(e.fields);
      this.error.set(errorText(e));
    } finally { this.busy.set(false); }
  }
}
