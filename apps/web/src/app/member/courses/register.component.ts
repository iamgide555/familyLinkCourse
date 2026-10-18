import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { BookingResult, MemberRunView, RegistrationView } from '../../../../../../packages/contracts/src/bookings';
import type { ParticipantProfile } from '../../../../../../packages/contracts/src/members';
import type { Answers } from '../../../../../../packages/contracts/src/questions';
import { ApiRequestError } from '../../core/api-client';
import { MemberApi, MemberSession } from '../../core/member-api';
import { QuestionFormComponent } from '../../shared/question-form.component';
import { focusSoon } from '../../shared/focus';
import { AVAILABILITY_WORD, STATUS_WORD, errorText, shortDate, thaiDateTime } from '../shared/thai';

type Detail = { run: MemberRunView; prefill: Answers; registration: RegistrationView | null };

@Component({
  selector: 'fl-member-register',
  imports: [FormsModule, RouterLink, QuestionFormComponent],
  template: `<main id="main-content" class="member-workspace line-page">
    <a class="back-link" routerLink="/member/courses">กลับไปรายการคอร์ส</a>
    @if (loading()) { <p role="status">กำลังโหลดข้อมูลคอร์ส…</p> }
    @else if (error() && !detail()) {
      <p class="notice notice-error" role="alert">{{ error() }}</p>
      @if (!members().length) { <a class="button-primary" routerLink="/member/signup">สมัครสมาชิก</a> }
    } @else if (result(); as r) {
      <div class="outcome" role="status" tabindex="-1" id="reg-result">
        <h1>บันทึกการลงทะเบียนแล้ว</h1>
        <p>ผลของแต่ละรายการ (ที่นั่งอาจเปลี่ยนไปจากตอนที่เลือก นี่คือผลที่บันทึกจริง)</p>
        <ul class="plain-list">@for (o of r.outcomes; track $index) { <li><strong>{{ o.sessionId ? sessionName(o.sessionId) : 'ทั้งคอร์ส' }}</strong>: {{ word(o.status) }}{{ o.queuePosition ? ' (คิวที่ ' + o.queuePosition + ')' : '' }}</li> }</ul>
        @if (hasWaitlist(r)) { <p class="notice">ที่นั่งเต็ม คุณอยู่ในคิวรอ ยังไม่มีที่นั่งรับประกัน ระบบจะแจ้งเมื่อมีที่ว่างและเลื่อนขึ้นให้อัตโนมัติ</p> }
        @if (detail()!.run.requireApproval && hasPending(r)) { <p class="notice">รายการที่ “รอเจ้าหน้าที่อนุมัติ” มีที่นั่งจองไว้ให้แล้ว เจ้าหน้าที่จะแจ้งผลทาง LINE หรืออีเมล</p> }
        <div class="form-actions"><a class="button-primary" routerLink="/member/registrations">ดูการลงทะเบียนของฉัน</a></div>
      </div>
    } @else if (detail(); as d) {
      <h1>{{ d.run.courseName }}</h1>
      <p class="member-number">{{ d.run.batchName }}{{ d.run.location ? ' · ' + d.run.location : '' }}</p>
      @if (d.run.description) { <p class="page-intro">{{ d.run.description }}</p> }
      @if (members().length > 1) {
        <div role="radiogroup" aria-label="ลงทะเบียนให้ใคร" class="switcher">
          @for (m of members(); track m.id) { <button type="button" role="radio" [attr.aria-checked]="m.id === memberId()" [class.switch-on]="m.id === memberId()" (click)="pick(m.id)">{{ m.firstName }}</button> }
        </div>
      }
      @if (members().length) { <p>ลงทะเบียนให้: <strong>{{ memberName() }}</strong></p> }
      @if (d.registration; as reg) {
        <section class="notice" aria-live="polite"><h2>สถานะการลงทะเบียนปัจจุบัน</h2>
          <ul class="plain-list">@for (e of reg.entries; track $index) { <li>{{ e.sessionId ? 'วันที่ ' + e.dayNo + ' · ' + date(e.date!) : 'ทั้งคอร์ส' }}: {{ word(e.status) }}{{ e.queuePosition ? ' (คิวที่ ' + e.queuePosition + ')' : '' }}</li> }</ul>
          <a routerLink="/member/registrations">จัดการ / ยกเลิกการลงทะเบียน</a></section>
      }
      <h2>วันเรียน</h2>
      <p class="field-hint">สมาชิกยกเลิกเองได้ถึง {{ d.run.cancelDeadline ? dateTime(d.run.cancelDeadline) : 'วันที่เจ้าหน้าที่กำหนด' }} หลังจากนั้นกรุณาติดต่อเจ้าหน้าที่</p>
      <ul class="session-list" [attr.aria-label]="d.run.perSession ? 'เลือกวันเรียน' : 'วันเรียนทั้งหมดของคอร์ส'">
        @for (s of d.run.sessions; track s.id) {
          <li [class.is-cancelled]="s.status === 'cancelled'">
            @if (d.run.perSession) {
              <label class="choice"><input type="checkbox" [checked]="chosen().includes(s.id)" [disabled]="!pickable(s) || isActive(s.id)" (change)="toggle(s.id)" />
                <span><strong>วันที่ {{ s.dayNo }} · {{ date(s.date) }}</strong> {{ s.startTime }}–{{ s.endTime }} น.{{ s.location ? ' · ' + s.location : '' }}
                  <span class="record-state"> · {{ isActive(s.id) ? 'คุณลงทะเบียนวันนี้แล้ว' : availWord(s.availability) }}</span></span></label>
            } @else {
              <span><strong>วันที่ {{ s.dayNo }} · {{ date(s.date) }}</strong> {{ s.startTime }}–{{ s.endTime }} น.{{ s.location ? ' · ' + s.location : '' }}{{ s.status === 'cancelled' ? ' · ยกเลิกแล้ว' : '' }}</span>
            }
          </li>
        }
      </ul>
      @if (!d.run.perSession) { <p><strong>{{ availWord(d.run.availability) }}</strong></p> }
      @if (d.run.requireApproval) { <p class="field-hint">รอบนี้ต้องให้เจ้าหน้าที่อนุมัติ ที่นั่งจะถูกจองไว้ระหว่างรออนุมัติ</p> }
      @if (waitlistChosen()) { <p class="notice" role="status">มีวันเรียนที่ที่นั่งเต็ม คุณจะอยู่ในคิวรอและยังไม่มีที่นั่งรับประกัน</p> }
      @if (!d.run.perSession && d.run.availability === 'full_waitlist') { <p class="notice" role="status">ที่นั่งเต็ม คุณจะอยู่ในคิวรอและยังไม่มีที่นั่งรับประกัน</p> }
      @if (!members().length) {
        <p class="notice">ต้องเป็นสมาชิกก่อนลงทะเบียนคอร์ส</p><a class="button-primary" routerLink="/member/signup">สมัครสมาชิก</a>
      } @else if (canRegister()) {
        <form (ngSubmit)="submit()" novalidate>
          @if (errors().length) { <div class="notice notice-error" role="alert" tabindex="-1" id="reg-errors"><ul>@for (e of errors(); track e) { <li>{{ e }}</li> }</ul></div> }
          @if (d.run.questions.length) { <h2>คำถามเพิ่มเติม</h2><fl-question-form [questions]="d.run.questions" [answers]="answers" [errors]="fieldErrors()" /> }
          <div class="form-actions"><button class="button-primary" type="submit" [disabled]="busy()">{{ busy() ? 'กำลังลงทะเบียน…' : 'ลงทะเบียน' }}</button></div>
        </form>
      } @else { <p class="notice">{{ blockedText() }}</p> }
    }
  </main>`,
})
export class MemberRegisterComponent implements OnInit {
  private readonly api = inject(MemberApi);
  private readonly route = inject(ActivatedRoute);
  readonly session = inject(MemberSession);
  readonly detail = signal<Detail | null>(null);
  readonly members = signal<ParticipantProfile[]>([]);
  readonly memberId = signal('');
  readonly chosen = signal<string[]>([]);
  readonly result = signal<BookingResult | null>(null);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly errors = signal<string[]>([]);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly date = shortDate;
  readonly dateTime = thaiDateTime;
  answers: Answers = {};
  private runId = '';
  private op = crypto.randomUUID();
  word(s: string) { return STATUS_WORD[s] ?? s; }
  availWord(a: string) { return AVAILABILITY_WORD[a] ?? a; }
  memberName() { const m = this.members().find((x) => x.id === this.memberId()); return m ? `${m.firstName} ${m.lastName}` : ''; }
  pickable(s: { availability: string; status: string }) { return s.status === 'scheduled' && (s.availability === 'available' || s.availability === 'full_waitlist'); }
  isActive(sessionId: string) { return !!this.detail()?.registration?.entries.some((e) => e.sessionId === sessionId && ['submitted', 'confirmed', 'waitlisted'].includes(e.status)); }
  waitlistChosen() { return this.chosen().some((id) => this.detail()?.run.sessions.find((s) => s.id === id)?.availability === 'full_waitlist'); }
  hasWaitlist(r: BookingResult) { return r.outcomes.some((o) => o.status === 'waitlisted'); }
  hasPending(r: BookingResult) { return r.outcomes.some((o) => o.status === 'submitted'); }
  sessionName(id: string) { const s = this.detail()?.run.sessions.find((x) => x.id === id); return s ? `วันที่ ${s.dayNo} · ${shortDate(s.date)}` : 'วันเรียน'; }
  canRegister() {
    const d = this.detail()!;
    if (d.run.perSession) return d.run.sessions.some((s) => this.pickable(s) && !this.isActive(s.id));
    const reg = d.registration;
    if (reg?.entries.some((e) => ['submitted', 'confirmed', 'waitlisted'].includes(e.status))) return false;
    return d.run.availability === 'available' || d.run.availability === 'full_waitlist';
  }
  blockedText() {
    const d = this.detail()!;
    if (!d.run.perSession && d.registration?.entries.some((e) => ['submitted', 'confirmed', 'waitlisted'].includes(e.status))) return 'คุณลงทะเบียนรอบนี้แล้ว ดูสถานะได้ที่ “การลงทะเบียนของฉัน”';
    return this.availWord(d.run.availability);
  }
  async ngOnInit() {
    this.runId = this.route.snapshot.paramMap.get('runId') ?? '';
    if (!this.session.signedIn) { this.error.set(this.session.devMode ? 'ยังไม่ได้เลือกบัญชี LINE จำลอง' : 'กรุณาเปิดหน้านี้จากเมนูใน LINE'); this.loading.set(false); return; }
    try {
      const me = await this.api.request<{ members: ParticipantProfile[] }>('/me');
      this.members.set(me.members);
      const wanted = this.route.snapshot.queryParamMap.get('m');
      this.memberId.set(me.members.find((m) => m.id === wanted)?.id ?? me.members[0]?.id ?? '');
      await this.load();
    } catch (e) { this.error.set(errorText(e)); } finally { this.loading.set(false); }
  }
  private async load() {
    const q = this.memberId() ? `?memberId=${this.memberId()}` : '';
    const d = await this.api.request<Detail>(`/courses/${this.runId}${q}`);
    this.answers = { ...d.prefill };
    this.chosen.set([]);
    this.detail.set(d);
  }
  async pick(id: string) { this.memberId.set(id); this.op = crypto.randomUUID(); this.errors.set([]); try { await this.load(); } catch (e) { this.error.set(errorText(e)); } }
  toggle(id: string) { this.chosen.update((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id])); }
  async submit() {
    if (this.busy()) return;
    const d = this.detail()!;
    if (d.run.perSession && !this.chosen().length) { this.errors.set(['กรุณาเลือกวันเรียนอย่างน้อย 1 วัน']); focusSoon('reg-errors'); return; }
    this.busy.set(true); this.errors.set([]); this.fieldErrors.set({});
    try {
      const result = await this.api.request<BookingResult>(`/me/${this.memberId()}/registrations`, 'POST', { runId: this.runId, sessionIds: d.run.perSession ? this.chosen() : [], answers: this.answers, operationKey: this.op });
      this.result.set(result);
      focusSoon('reg-result');
    } catch (e) {
      if (e instanceof ApiRequestError && e.fields && e.code !== 'RUN_FULL') this.fieldErrors.set(e.fields);
      this.errors.set([errorText(e)]);
      if (e instanceof ApiRequestError && e.status === 409) { this.op = crypto.randomUUID(); try { await this.load(); } catch { /* keep showing the error */ } }
      focusSoon('reg-errors');
    } finally { this.busy.set(false); }
  }
}
