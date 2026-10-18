import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { MemberRunView } from '../../../../../../packages/contracts/src/bookings';
import { ApiRequestError } from '../../core/api-client';
import { MemberApi, MemberSession } from '../../core/member-api';
import { AVAILABILITY_WORD, errorText, shortDate } from '../shared/thai';

@Component({
  selector: 'fl-member-courses',
  imports: [RouterLink],
  template: `<main id="main-content" class="member-workspace line-page">
    <h1>ลงทะเบียนคอร์ส</h1>
    @if (loading()) { <p role="status">กำลังโหลดรายการคอร์ส…</p> }
    @else if (error()) {
      <p class="notice notice-error" role="alert">{{ error() }}</p>
      @if (needsIdentity() && session.devMode) { <a class="button-primary" routerLink="/member/dev">เลือกบัญชี LINE จำลอง</a> }
    } @else if (!items().length) {
      <div class="empty-state"><h2>ยังไม่มีคอร์สที่เปิดรับ</h2><p>เมื่อสมาคมเปิดรอบใหม่ รายการจะแสดงที่หน้านี้</p></div>
    } @else {
      <p class="page-intro">เลือกคอร์สที่สนใจ แล้วเลือกว่าจะลงทะเบียนให้ใคร</p>
      <ul class="member-results" aria-label="คอร์สที่เปิดรับ">
        @for (r of items(); track r.runId) {
          <li><a [routerLink]="['/member/courses', r.runId]" [attr.aria-label]="'ดูคอร์ส ' + r.courseName + ' ' + r.batchName">
            <span class="result-person"><strong>{{ r.courseName }}</strong><span>{{ r.batchName }} · {{ span(r) }}</span></span>
            <span class="result-contact"><span class="pill" [attr.data-status]="r.availability">{{ word(r.availability) }}</span><span class="record-state">{{ r.perSession ? 'เลือกลงทะเบียนเป็นรายวัน' : 'ลงทะเบียนทั้งคอร์ส' }}</span></span>
            <span class="result-open">ดูและลงทะเบียน<span aria-hidden="true"> →</span></span></a></li>
        }
      </ul>
    }
  </main>`,
})
export class MemberCoursesComponent implements OnInit {
  private readonly api = inject(MemberApi);
  readonly session = inject(MemberSession);
  readonly items = signal<MemberRunView[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly needsIdentity = signal(false);
  word(a: string) { return AVAILABILITY_WORD[a] ?? a; }
  span(r: MemberRunView) {
    const live = r.sessions.filter((s) => s.status === 'scheduled');
    if (!live.length) return 'ยังไม่มีวันเรียน';
    const first = shortDate(live[0]!.date);
    const last = shortDate(live[live.length - 1]!.date);
    return live.length === 1 ? first : `${first} – ${last} (${live.length} วัน)`;
  }
  async ngOnInit() {
    if (!this.session.signedIn) { this.needsIdentity.set(true); this.error.set(this.session.devMode ? 'ยังไม่ได้เลือกบัญชี LINE จำลอง' : 'กรุณาเปิดหน้านี้จากเมนูใน LINE'); this.loading.set(false); return; }
    try { this.items.set((await this.api.request<{ items: MemberRunView[] }>('/courses')).items); }
    catch (e) { if (e instanceof ApiRequestError && e.status === 401) this.needsIdentity.set(true); this.error.set(errorText(e)); } finally { this.loading.set(false); }
  }
}
