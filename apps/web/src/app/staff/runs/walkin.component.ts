import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import QRCode from 'qrcode';
import type { RegistrationView, WalkinResult } from '../../../../../../packages/contracts/src/bookings';
import type { CourseDetail, RunRecord, SessionRecord } from '../../../../../../packages/contracts/src/courses';
import type { MemberSearchResult, MemberSummary } from '../../../../../../packages/contracts/src/members';
import type { Answers } from '../../../../../../packages/contracts/src/questions';
import { ApiClient, ApiRequestError } from '../../core/api-client';
import { STATUS_WORD, errorText, shortDate, todayBangkok } from '../../member/shared/thai';
import { focusSoon } from '../../shared/focus';
import { QuestionFormComponent } from '../../shared/question-form.component';

@Component({
  selector: 'fl-walkin',
  imports: [FormsModule, RouterLink, QuestionFormComponent],
  template: `<main id="main-content" class="member-workspace">
    <a class="back-link" [routerLink]="['/staff/runs', runId]">กลับไปหน้ารอบ</a>
    <h1>รับลงทะเบียนหน้างาน{{ course() ? ' · ' + course()!.name : '' }}</h1>
    @if (loading()) { <p role="status">กำลังโหลด…</p> }
    @else if (!run()) { <p class="notice notice-error" role="alert">{{ error() || 'ไม่พบรอบนี้' }}</p> }
    @else if (result(); as r) {
      <div class="outcome" role="status" tabindex="-1" id="walkin-result">
        <h2>บันทึกแล้ว: ยืนยันที่นั่งและเช็คชื่อมาเรียนวันนี้เรียบร้อย</h2>
        <ul>@for (o of r.outcomes; track $index) { <li>{{ o.sessionId ? sessionName(o.sessionId) : 'ทั้งคอร์ส' }}: {{ word(o.status) }}{{ o.queuePosition ? ' (คิวที่ ' + o.queuePosition + ')' : '' }}</li> }</ul>
        @if (r.linkUrl) {
          <h3>ให้สมาชิกสแกนเพื่อเชื่อมต่อ LINE</h3>
          <p>สแกนใน LINE แล้วเชื่อมต่อทันที โดยไม่ต้องกรอกฟอร์มซ้ำ ใช้ได้ครั้งเดียวภายใน 7 วัน หรือส่งลิงก์ทางแชทหรือ SMS ภายหลัง</p>
          @if (qr()) { <img class="qr" [src]="qr()" width="280" height="280" alt="รหัส QR เชื่อมต่อ LINE ของสมาชิกที่เพิ่งลงทะเบียน" /> }
          <label for="wl-url">ลิงก์สำหรับส่งต่อ</label><input id="wl-url" readonly [value]="r.linkUrl" />
        }
        <div class="form-actions"><button class="button-primary" type="button" (click)="again()">รับลงทะเบียนคนต่อไป</button><a class="button-secondary" [routerLink]="['/staff/runs', runId]">กลับไปหน้ารอบ</a></div>
      </div>
    } @else if (run(); as r) {
      @if (!todays().length) {
        <p class="notice">รอบนี้ไม่มีวันเรียนในวันนี้ ({{ today }}) การรับลงทะเบียนหน้างานทำได้เฉพาะวันเรียนของวันนี้</p>
      } @else {
        <p class="page-intro">บันทึกสมาชิก ที่นั่ง และการมาเรียนวันนี้ในขั้นตอนเดียว ถ้าเกิดข้อผิดพลาด จะไม่มีข้อมูลค้างครึ่งทาง</p>
        @if (errors().length) { <div class="notice notice-error" role="alert" tabindex="-1" id="walkin-errors"><ul>@for (e of errors(); track e) { <li>{{ e }}</li> }</ul></div> }
        <form (ngSubmit)="submit()" novalidate>
          @if (todays().length > 1) {
            <div class="intake-field"><label for="w-session">วันเรียนที่สมาชิกมาวันนี้</label>
              <select id="w-session" name="current" [(ngModel)]="currentId" (ngModelChange)="onSession()">@for (s of todays(); track s.id) { <option [value]="s.id">วันที่ {{ s.dayNo }} · {{ s.startTime }}–{{ s.endTime }} น.</option> }</select></div>
          } @else { <p><strong>วันเรียนวันนี้:</strong> วันที่ {{ todays()[0]!.dayNo }} · {{ todays()[0]!.startTime }}–{{ todays()[0]!.endTime }} น.</p> }

          <fieldset class="intake-section"><legend><h2>สมาชิก</h2></legend>
            <label class="choice"><input type="radio" name="kind" value="existing" [(ngModel)]="kind" /> สมาชิกที่มีข้อมูลอยู่แล้ว</label>
            <label class="choice"><input type="radio" name="kind" value="new" [(ngModel)]="kind" /> สมาชิกใหม่ (กรอกที่หน้างาน)</label>
            @if (kind === 'existing') {
              <div class="member-search"><div><label for="w-q">ค้นหา (ชื่อ เบอร์ หรือเลขสมาชิก)</label><input id="w-q" name="q" type="search" [(ngModel)]="q" /></div><button class="button-secondary" type="button" (click)="search()">ค้นหา</button></div>
              @if (picked(); as m) { <p class="notice notice-success">เลือกแล้ว: {{ m.firstName }} {{ m.lastName }} ({{ m.memberNumber }}) <button type="button" class="button-secondary" (click)="picked.set(null)">เปลี่ยน</button></p> }
              @else if (found().length) { <ul class="choice-list">@for (m of found(); track m.id) { <li><span>{{ m.firstName }} {{ m.lastName }} · {{ m.memberNumber }} · {{ m.phoneMobile || 'ไม่มีเบอร์' }}</span><button class="button-secondary" type="button" (click)="picked.set(m)">เลือกคนนี้</button></li> }</ul> }
            } @else {
              <div class="form-grid">
                <div class="intake-field"><label for="w-first">ชื่อ</label><input id="w-first" name="first" [(ngModel)]="nm.firstName" /></div>
                <div class="intake-field"><label for="w-last">นามสกุล</label><input id="w-last" name="last" [(ngModel)]="nm.lastName" /></div>
                <div class="intake-field"><label for="w-birth">วันเกิด (ไม่บังคับ แต่ช่วยตรวจว่าซ้ำกับสมาชิกเดิม)</label><input id="w-birth" name="birth" type="date" [(ngModel)]="nm.birthDate" /></div>
                <div class="intake-field"><label for="w-phone">เบอร์มือถือ</label><input id="w-phone" name="phone" type="tel" inputmode="numeric" [(ngModel)]="nm.phoneMobile" /></div>
              </div>
              <p class="field-hint">ข้อมูลที่เหลือกรอกเพิ่มได้ภายหลังจากหน้าโปรไฟล์สมาชิก</p>
              @if (duplicate()) {
                <div class="duplicate-review" role="alert"><h3>พบสมาชิกเดิมที่ชื่อและวันเกิดตรงกัน</h3>
                  <p>เลือก “สมาชิกที่มีข้อมูลอยู่แล้ว” หากเป็นคนเดียวกัน หรือยืนยันสร้างใหม่หากเป็นคนละคน พร้อมเหตุผล</p>
                  <div class="intake-field"><label for="w-dup">เหตุผลที่สร้างเป็นสมาชิกใหม่</label><input id="w-dup" name="dup" [(ngModel)]="dupReason" /></div></div>
              }
            }
          </fieldset>

          @if (run()!.perSessionRegistration && otherSessions().length) {
            <fieldset class="intake-section"><legend><h2>วันเรียนอื่นที่ต้องการลงทะเบียนด้วย (ไม่บังคับ)</h2></legend>
              @for (s of otherSessions(); track s.id) { <label class="choice"><input type="checkbox" [checked]="others().includes(s.id)" (change)="toggleOther(s.id)" /> วันที่ {{ s.dayNo }} · {{ date(s.date) }}</label> }
            </fieldset>
          }
          @if (r.questions.length) { <fieldset class="intake-section"><legend><h2>คำถามลงทะเบียน</h2></legend><fl-question-form [questions]="r.questions" [answers]="answers" [errors]="fieldErrors()" /></fieldset> }

          <fieldset class="intake-section"><legend><h2>สถานะที่นั่ง</h2></legend>
            <p>ที่นั่ง: จองแล้ว {{ pool().reserved }} จาก {{ pool().capacity }} · รอคิว {{ waiters().length }} คน</p>
            @if (waiters().length) { <p class="notice" role="status"><strong>ผู้ที่รอคิวอยู่ (ไม่ถูกตัดคิว):</strong> {{ waiterNames() }}</p> }
            @if (pool().full || needIncrease()) {
              <div class="notice"><p>ที่นั่งเต็ม ต้องเพิ่มจำนวนที่นั่งพร้อมเหตุผลก่อนรับสมาชิกคนนี้ ระบบจะไม่จองเกินที่นั่งเด็ดขาด</p>
                <div class="form-grid"><div class="intake-field"><label for="w-cap">จำนวนที่นั่งใหม่ (ปัจจุบัน {{ pool().capacity }})</label><input id="w-cap" name="cap" type="number" inputmode="numeric" [(ngModel)]="newCapacity" /></div>
                <div class="intake-field"><label for="w-capr">เหตุผลที่เพิ่มที่นั่ง</label><input id="w-capr" name="capr" [(ngModel)]="capReason" /></div></div></div>
            }
            @if (waiters().length) { <div class="intake-field"><label for="w-bypass">เหตุผลที่รับสมาชิกคนนี้ก่อนผู้ที่รอคิว</label><input id="w-bypass" name="bypass" [(ngModel)]="bypassReason" /></div> }
            @if (needClosed()) { <div class="intake-field"><label for="w-closed">ปิดรับลงทะเบียนแล้ว ระบุเหตุผลที่รับหน้างาน</label><input id="w-closed" name="closed" [(ngModel)]="closedReason" /></div> }
          </fieldset>
          @if (needsAnotherStaff()) { <p class="notice notice-error" role="alert">รายการนี้เป็นของเจ้าหน้าที่หรือครอบครัวเดียวกับท่าน กรุณาให้เจ้าหน้าที่คนอื่นเป็นผู้ยืนยันการรับลงทะเบียน</p> }
          <div class="form-actions"><button class="button-primary" type="submit" [disabled]="busy()">{{ busy() ? 'กำลังบันทึก…' : 'ยืนยันรับลงทะเบียนและเช็คชื่อมาเรียน' }}</button></div>
        </form>
      }
    }
  </main>`,
})
export class WalkinComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  runId = '';
  readonly run = signal<RunRecord | null>(null);
  readonly course = signal<CourseDetail | null>(null);
  readonly regs = signal<RegistrationView[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly errors = signal<string[]>([]);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly result = signal<WalkinResult | null>(null);
  readonly qr = signal('');
  readonly found = signal<MemberSummary[]>([]);
  readonly picked = signal<MemberSummary | null>(null);
  readonly others = signal<string[]>([]);
  readonly duplicate = signal(false);
  readonly closedNeeded = signal(false);
  readonly increaseNeeded = signal(false);
  readonly selfFamily = signal(false);
  readonly date = shortDate;
  readonly today = todayBangkok();
  kind: 'existing' | 'new' = 'new';
  currentId = '';
  q = '';
  nm = { firstName: '', lastName: '', birthDate: '', phoneMobile: '' };
  answers: Answers = {};
  dupReason = ''; closedReason = ''; bypassReason = ''; capReason = ''; newCapacity: number | null = null;
  private op = crypto.randomUUID();
  word(s: string) { return STATUS_WORD[s] ?? s; }
  todays(): SessionRecord[] { return (this.run()?.sessions ?? []).filter((s) => s.date === this.today && s.status === 'scheduled'); }
  otherSessions(): SessionRecord[] { return (this.run()?.sessions ?? []).filter((s) => s.id !== this.currentId && s.status === 'scheduled'); }
  sessionName(id: string) { const s = this.run()?.sessions.find((x) => x.id === id); return s ? `วันที่ ${s.dayNo} · ${shortDate(s.date)}` : 'วันเรียน'; }
  pool() {
    const r = this.run()!;
    const s = r.perSessionRegistration ? r.sessions.find((x) => x.id === this.currentId) : null;
    const capacity = (s ? s.capacity : r.capacity) ?? 0;
    const reserved = s ? s.reserved : r.reserved;
    return { capacity, reserved, full: reserved >= capacity };
  }
  waiters(): RegistrationView[] {
    const r = this.run()!;
    return this.regs().filter((g) => g.entries.some((e) => e.status === 'waitlisted' && (!r.perSessionRegistration || e.sessionId === this.currentId)));
  }
  waiterNames() { return this.waiters().map((w) => w.memberName).join(', '); }
  needIncrease() { return this.increaseNeeded(); }
  needClosed() { return this.closedNeeded(); }
  needsAnotherStaff() { return this.selfFamily(); }
  async ngOnInit() {
    this.runId = this.route.snapshot.paramMap.get('id') ?? '';
    try {
      this.run.set(await this.api.request<RunRecord>(`/runs/${this.runId}`));
      this.course.set(await this.api.request<CourseDetail>(`/courses/${this.run()!.courseId}`));
      this.currentId = this.todays()[0]?.id ?? '';
      await this.loadRegs();
    } catch (e) { this.error.set(errorText(e)); } finally { this.loading.set(false); }
  }
  private async loadRegs() { this.regs.set((await this.api.request<{ items: RegistrationView[] }>(`/runs/${this.runId}/registrations`)).items); }
  onSession() { this.others.set([]); }
  toggleOther(id: string) { this.others.update((o) => (o.includes(id) ? o.filter((x) => x !== id) : [...o, id])); }
  async search() { try { this.found.set((await this.api.request<MemberSearchResult>(`/members?q=${encodeURIComponent(this.q.trim())}&page=1`)).items); } catch (e) { this.errors.set([errorText(e)]); } }
  again() { this.result.set(null); this.picked.set(null); this.found.set([]); this.nm = { firstName: '', lastName: '', birthDate: '', phoneMobile: '' }; this.answers = {}; this.dupReason = this.closedReason = this.bypassReason = this.capReason = ''; this.newCapacity = null; this.duplicate.set(false); this.op = crypto.randomUUID(); void this.refreshAll(); }
  private async refreshAll() { this.run.set(await this.api.request<RunRecord>(`/runs/${this.runId}`)); await this.loadRegs(); }
  async submit() {
    if (this.busy()) return;
    const problems: string[] = [];
    if (this.kind === 'existing' && !this.picked()) problems.push('กรุณาค้นหาและเลือกสมาชิก');
    if (this.kind === 'new' && (!this.nm.firstName.trim() || !this.nm.lastName.trim())) problems.push('กรุณากรอกชื่อและนามสกุล');
    this.errors.set(problems);
    if (problems.length) { focusSoon('walkin-errors'); return; }
    const r = this.run()!;
    const pool = r.perSessionRegistration ? this.currentId : null;
    const body: Record<string, unknown> = {
      operationKey: this.op, currentSessionId: this.currentId, sessionIds: r.perSessionRegistration ? this.others() : [], answers: this.answers,
      ...(this.kind === 'existing' ? { memberId: this.picked()!.id } : { member: { firstName: this.nm.firstName.trim(), lastName: this.nm.lastName.trim(), ...(this.nm.birthDate ? { birthDate: this.nm.birthDate } : {}), ...(this.nm.phoneMobile.trim() ? { phoneMobile: this.nm.phoneMobile.trim() } : {}), ...(this.duplicate() ? { duplicateDecision: 'create_new', duplicateReason: this.dupReason.trim() } : {}) } }),
      ...(this.closedReason.trim() ? { closedReason: this.closedReason.trim() } : {}),
      ...(this.bypassReason.trim() ? { queueBypassReason: this.bypassReason.trim() } : {}),
      ...(this.newCapacity && this.capReason.trim() ? { capacityIncrease: [{ sessionId: pool, newCapacity: Number(this.newCapacity), reason: this.capReason.trim() }] } : {}),
    };
    this.busy.set(true); this.fieldErrors.set({}); this.selfFamily.set(false);
    try {
      const result = await this.api.request<WalkinResult>(`/runs/${this.runId}/walkins`, 'POST', body);
      this.result.set(result);
      if (result.linkUrl) this.qr.set(await QRCode.toDataURL(result.linkUrl, { margin: 2, width: 280 }));
      focusSoon('walkin-result');
    } catch (e) {
      const code = e instanceof ApiRequestError ? e.code : '';
      if (code === 'MEMBER_REVIEW_REQUIRED') this.duplicate.set(true);
      if (code === 'CLOSED_REASON_REQUIRED') this.closedNeeded.set(true);
      if (code === 'CAPACITY_REQUIRED') this.increaseNeeded.set(true);
      if (code === 'SELF_REVIEW_FORBIDDEN') this.selfFamily.set(true);
      if (e instanceof ApiRequestError && e.fields) this.fieldErrors.set(e.fields);
      this.errors.set([errorText(e)]);
      focusSoon('walkin-errors');
      if (code === 'ALREADY_REGISTERED') await this.refreshAll();
    } finally { this.busy.set(false); }
  }
}
