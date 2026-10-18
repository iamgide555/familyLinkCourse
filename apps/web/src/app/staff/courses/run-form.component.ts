import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CourseDetail, RunRecord } from '../../../../../../packages/contracts/src/courses';
import { ApiClient, ApiRequestError } from '../../core/api-client';
import { bangkokIso, errorText } from '../../member/shared/thai';
import { focusSoon } from '../../shared/focus';

type SessionRow = { date: string; startTime: string; endTime: string; location: string; onlineUrl: string; capacity: number | null };
const blank = (): SessionRow => ({ date: '', startTime: '09:00', endTime: '16:00', location: '', onlineUrl: '', capacity: null });

@Component({
  selector: 'fl-run-form',
  imports: [FormsModule, RouterLink],
  template: `<main id="main-content" class="member-workspace">
    <a class="back-link" [routerLink]="['/staff/courses', courseId]">กลับไปหน้าคอร์ส</a>
    <h1>สร้างรอบใหม่{{ course() ? ' · ' + course()!.name : '' }}</h1>
    <p class="page-intro">รอบคือการเปิดสอนหนึ่งครั้ง คำถามลงทะเบียนจะคัดลอกจากคอร์ส และแก้เฉพาะรอบนี้ได้ภายหลัง</p>
    @if (errors().length) { <div class="notice notice-error" role="alert" tabindex="-1" id="run-errors"><ul>@for (e of errors(); track e) { <li>{{ e }}</li> }</ul></div> }
    <form (ngSubmit)="submit()" novalidate>
      <section class="intake-section"><h2>ข้อมูลรอบ</h2>
        <div class="form-grid">
          <div class="intake-field"><label for="r-batch">ชื่อรุ่น / รอบ (เช่น รุ่นที่ 1)</label><input id="r-batch" name="batch" [(ngModel)]="f.batchName" maxlength="150" /></div>
          <div class="intake-field"><label for="r-loc">สถานที่เรียน</label><input id="r-loc" name="location" [(ngModel)]="f.location" maxlength="200" /></div>
        </div>
      </section>
      <fieldset class="intake-section"><legend><h2>รูปแบบการลงทะเบียน</h2></legend>
        <label class="choice"><input type="radio" name="mode" [value]="false" [(ngModel)]="f.perSession" /> ลงทะเบียนทั้งคอร์ส (ที่นั่งเดียวครอบคลุมทุกวันเรียน)</label>
        <label class="choice"><input type="radio" name="mode" [value]="true" [(ngModel)]="f.perSession" /> ลงทะเบียนรายวัน (เลือกวันเรียนที่มาได้ แต่ละวันมีที่นั่งและคิวของตัวเอง)</label>
        <p class="field-hint">เลือกแล้วเปลี่ยนไม่ได้เมื่อมีผู้ลงทะเบียนคนแรก</p>
        @if (!f.perSession) {
          <div class="intake-field"><label for="r-cap">จำนวนที่นั่งทั้งรอบ</label><input id="r-cap" name="capacity" type="number" min="1" max="5000" inputmode="numeric" [(ngModel)]="f.capacity" /></div>
        }
        <label class="choice"><input type="checkbox" name="approval" [(ngModel)]="f.requireApproval" /> ต้องให้เจ้าหน้าที่อนุมัติก่อน (ที่นั่งถูกจองไว้ระหว่างรออนุมัติ)</label>
        <label class="choice"><input type="checkbox" name="waitlist" [(ngModel)]="f.waitlistEnabled" /> เปิดคิวรอเมื่อที่นั่งเต็ม (เลื่อนขึ้นอัตโนมัติเมื่อมีที่ว่าง)</label>
      </fieldset>
      <section class="intake-section"><h2>วันเรียน</h2>
        @for (row of rows(); track $index; let i = $index) {
          <article class="q-draft" [attr.aria-label]="'วันเรียนที่ ' + (i + 1)">
            <div class="form-grid">
              <div class="intake-field"><label [attr.for]="'s-date-' + i">วันที่เรียน (วันที่ {{ i + 1 }})</label><input [id]="'s-date-' + i" [name]="'date' + i" type="date" [(ngModel)]="row.date" /></div>
              <div class="intake-field"><label [attr.for]="'s-loc-' + i">สถานที่ (ถ้าต่างจากด้านบน)</label><input [id]="'s-loc-' + i" [name]="'sloc' + i" [(ngModel)]="row.location" maxlength="200" /></div>
              <div class="intake-field"><label [attr.for]="'s-start-' + i">เวลาเริ่ม</label><input [id]="'s-start-' + i" [name]="'start' + i" type="time" [(ngModel)]="row.startTime" /></div>
              <div class="intake-field"><label [attr.for]="'s-end-' + i">เวลาสิ้นสุด</label><input [id]="'s-end-' + i" [name]="'end' + i" type="time" [(ngModel)]="row.endTime" /></div>
              <div class="intake-field"><label [attr.for]="'s-url-' + i">ลิงก์เรียนออนไลน์ (ถ้ามี)</label><input [id]="'s-url-' + i" [name]="'url' + i" [(ngModel)]="row.onlineUrl" placeholder="https://" /></div>
              @if (f.perSession) { <div class="intake-field"><label [attr.for]="'s-cap-' + i">จำนวนที่นั่งของวันนี้</label><input [id]="'s-cap-' + i" [name]="'cap' + i" type="number" min="1" max="5000" inputmode="numeric" [(ngModel)]="row.capacity" /></div> }
            </div>
            @if (rows().length > 1) { <button type="button" class="button-secondary" (click)="removeRow(i)">ลบวันเรียนนี้</button> }
          </article>
        }
        <button type="button" class="button-secondary" (click)="addRow()">เพิ่มวันเรียน</button>
      </section>
      <section class="intake-section"><h2>เวลาเปิดรับและการยกเลิก</h2>
        <div class="form-grid">
          <div class="intake-field"><label for="r-open">เปิดรับลงทะเบียน (เวลาประเทศไทย ไม่บังคับ)</label><input id="r-open" name="opens" type="datetime-local" [(ngModel)]="f.opens" /></div>
          <div class="intake-field"><label for="r-close">ปิดรับลงทะเบียน (ไม่บังคับ)</label><input id="r-close" name="closes" type="datetime-local" [(ngModel)]="f.closes" />
            <p class="field-hint">ถ้าไม่กำหนด จะปิดรับ 1 วันก่อนวันเรียนวันแรก</p></div>
          <div class="intake-field"><label for="r-days">สมาชิกยกเลิกเองได้ถึงกี่วันก่อนวันเรียนวันแรก</label><input id="r-days" name="days" type="number" min="0" max="365" inputmode="numeric" [(ngModel)]="f.cancelDeadlineDays" /></div>
        </div>
      </section>
      <div class="form-actions"><button class="button-primary" type="submit" [disabled]="busy()">{{ busy() ? 'กำลังสร้าง…' : 'สร้างรอบ' }}</button><a class="button-secondary" [routerLink]="['/staff/courses', courseId]">ยกเลิก</a></div>
    </form>
  </main>`,
})
export class RunFormComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  courseId = '';
  readonly course = signal<CourseDetail | null>(null);
  readonly rows = signal<SessionRow[]>([blank()]);
  readonly errors = signal<string[]>([]);
  readonly busy = signal(false);
  f = { batchName: '', location: '', perSession: false, capacity: 20 as number | null, requireApproval: false, waitlistEnabled: true, opens: '', closes: '', cancelDeadlineDays: 7 };
  async ngOnInit() {
    this.courseId = this.route.snapshot.paramMap.get('id') ?? '';
    try { this.course.set(await this.api.request<CourseDetail>(`/courses/${this.courseId}`)); } catch (e) { this.errors.set([errorText(e)]); }
  }
  addRow() {
    const last = this.rows()[this.rows().length - 1];
    this.rows.update((r) => [...r, { ...blank(), startTime: last?.startTime ?? '09:00', endTime: last?.endTime ?? '16:00', capacity: last?.capacity ?? null }]);
  }
  removeRow(i: number) { this.rows.update((r) => r.filter((_, x) => x !== i)); }
  async submit() {
    if (this.busy()) return;
    const problems: string[] = [];
    if (!this.f.batchName.trim()) problems.push('กรุณาระบุชื่อรุ่น / รอบ');
    if (!this.f.perSession && !(Number(this.f.capacity) >= 1)) problems.push('กรุณาระบุจำนวนที่นั่ง');
    this.rows().forEach((r, i) => {
      if (!r.date) problems.push(`กรุณาเลือกวันที่ของวันเรียนที่ ${i + 1}`);
      else if (r.endTime <= r.startTime) problems.push(`เวลาสิ้นสุดของวันเรียนที่ ${i + 1} ต้องอยู่หลังเวลาเริ่ม`);
      if (this.f.perSession && !(Number(r.capacity) >= 1)) problems.push(`กรุณาระบุที่นั่งของวันเรียนที่ ${i + 1}`);
    });
    this.errors.set(problems);
    if (problems.length) { focusSoon('run-errors'); return; }
    this.busy.set(true);
    try {
      const f = this.f;
      const run = await this.api.request<RunRecord>(`/courses/${this.courseId}/runs`, 'POST', {
        batchName: f.batchName.trim(), location: f.location.trim(), capacity: f.perSession ? null : Number(f.capacity), requireApproval: f.requireApproval, waitlistEnabled: f.waitlistEnabled,
        perSessionRegistration: f.perSession, registrationOpensAt: bangkokIso(f.opens), registrationClosesAt: bangkokIso(f.closes), cancelDeadlineDays: Number(f.cancelDeadlineDays),
        sessions: this.rows().map((r) => ({ date: r.date, startTime: r.startTime, endTime: r.endTime, location: r.location.trim(), onlineUrl: r.onlineUrl.trim(), capacity: f.perSession ? Number(r.capacity) : null })),
      });
      await this.router.navigate(['/staff/runs', run.id]);
    } catch (e) {
      const fields = e instanceof ApiRequestError && e.fields ? Object.values(e.fields) : [];
      this.errors.set(fields.length ? fields : [errorText(e)]);
      focusSoon('run-errors');
    } finally { this.busy.set(false); }
  }
}
