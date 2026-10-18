import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { DashboardSummary } from '../../../../../../packages/contracts/src/reports';
import { ApiClient } from '../../core/api-client';
import { errorText, shortDate } from '../../member/shared/thai';

@Component({
  selector: 'fl-dashboard',
  imports: [RouterLink],
  template: `<main id="main-content" class="member-workspace">
    <h1>ภาพรวม</h1>
    @if (loading()) { <p role="status">กำลังโหลดภาพรวม…</p> }
    @else if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p><button class="button-secondary" type="button" (click)="load()">ลองอีกครั้ง</button> }
    @else if (d(); as s) {
      <p class="page-intro">ข้อมูลวันที่ {{ date(s.today) }} · ตัวเลข “ที่นั่งที่จองไว้” หมายถึงผู้ที่ลงทะเบียนแล้ว ส่วน “มาเรียน” นับเฉพาะผู้ที่เจ้าหน้าที่เช็คชื่อว่ามาจริง</p>
      <section class="intake-section" aria-labelledby="sess-h">
        <h2 id="sess-h">วันเรียน {{ date(s.from) }} – {{ date(s.to) }}</h2>
        <p class="section-intro">ที่นั่งที่จองไว้ {{ s.totals.registeredForRange }} · มาเรียนแล้ว {{ s.totals.attendedForRange }}</p>
        @if (!s.sessions.length) { <p class="empty-state">ไม่มีวันเรียนในช่วงนี้</p> }
        <ul class="doc-list">
          @for (x of s.sessions; track x.sessionId) {
            <li [class.is-cancelled]="x.status === 'cancelled'">
              <span><strong>{{ x.courseName }} · {{ x.batchName }}</strong><br />{{ date(x.date) }} · {{ x.startTime }}–{{ x.endTime }} น.
                <span class="record-state"> · {{ x.status === 'cancelled' ? 'ยกเลิกแล้ว' : 'จองไว้ ' + x.registered + ' · มา ' + x.present + ' · ไม่มา ' + x.absent + ' · ยังไม่เช็ค ' + x.unmarked }}</span></span>
              @if (x.status === 'scheduled') { <a class="button-secondary" [routerLink]="['/staff/attendance', x.sessionId]">เช็คชื่อ</a> }
            </li>
          }
        </ul>
      </section>
      <section class="intake-section" aria-labelledby="todo-h">
        <h2 id="todo-h">สิ่งที่ต้องทำ</h2>
        <ul class="todo-list">
          <li [class.is-zero]="!(s.reviews.signupRequests + s.reviews.profileChanges)"><strong>{{ s.reviews.signupRequests + s.reviews.profileChanges }}</strong><span class="todo-body"><a routerLink="/staff/reviews">รายการรอตรวจสอบ</a><span class="record-state">ใบสมัครที่ตรงกับสมาชิกเดิม {{ s.reviews.signupRequests }} · คำขอแก้ไขข้อมูล {{ s.reviews.profileChanges }}</span></span></li>
          <li [class.is-zero]="!s.totals.submitted"><strong>{{ s.totals.submitted }}</strong><span class="todo-body"><span>การลงทะเบียนรออนุมัติ</span><span class="record-state">ที่นั่งถูกจองไว้ให้แล้ว</span></span></li>
          <li [class.is-zero]="!s.unsignedForms"><strong>{{ s.unsignedForms }}</strong><span class="todo-body"><span>คนที่ลงทะเบียนแล้วแต่ยังไม่ได้ลงนามแบบฟอร์ม</span><span class="record-state">พิมพ์แบบฟอร์มได้จากหน้ารอบของคอร์ส</span></span></li>
          <li [class.is-zero]="!s.followUp.failedNotices"><strong>{{ s.followUp.failedNotices }}</strong><span class="todo-body"><span>ข้อความที่ส่งไม่สำเร็จ ต้องติดตามเอง</span><a routerLink="/staff/notifications">ดูรายการ</a></span></li>
        </ul>
      </section>
      <section class="intake-section" aria-labelledby="runs-h">
        <h2 id="runs-h">รอบที่กำลังเปิดอยู่</h2>
        @if (!s.runs.length) { <p class="empty-state">ยังไม่มีรอบที่เปิดอยู่ <a routerLink="/staff/courses">ไปที่คอร์สและรอบ</a></p> }
        <ul class="doc-list">
          @for (r of s.runs; track r.runId) {
            <li><span><a [routerLink]="['/staff/runs', r.runId]"><strong>{{ r.courseName }} · {{ r.batchName }}</strong></a><br />
              <span class="record-state">{{ r.firstDate ? date(r.firstDate) : '' }}{{ r.lastDate && r.lastDate !== r.firstDate ? ' – ' + date(r.lastDate) : '' }} · {{ r.perSession ? 'รายวัน (นับเป็นรายการ)' : 'ทั้งคอร์ส' }}</span></span>
              <span class="record-state">ยืนยัน {{ r.confirmed }} · รออนุมัติ {{ r.submitted }} · คิวรอ {{ r.waitlisted }}{{ r.capacity !== null ? ' · ที่นั่ง ' + r.capacity : '' }}</span></li>
          }
        </ul>
      </section>
    }
  </main>`,
})
export class DashboardComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly d = signal<DashboardSummary | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly date = shortDate;
  ngOnInit() { void this.load(); }
  async load() {
    this.loading.set(true); this.error.set('');
    try { this.d.set(await this.api.request<DashboardSummary>('/dashboard')); } catch (e) { this.error.set(errorText(e)); } finally { this.loading.set(false); }
  }
}
