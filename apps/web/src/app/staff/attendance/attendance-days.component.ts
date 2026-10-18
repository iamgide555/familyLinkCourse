import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiClient } from '../../core/api-client';
import { errorText, shortDate, todayBangkok } from '../../member/shared/thai';

type Day = { sessionId: string; courseName: string; batchName: string; date: string; startTime: string; endTime: string; location: string; status: string };

@Component({
  selector: 'fl-attendance-days',
  imports: [FormsModule, RouterLink],
  template: `<main id="main-content" class="member-workspace">
    <h1>เช็คชื่อ</h1>
    <p class="page-intro">เลือกวันเรียนที่ต้องการเช็คชื่อ ใช้บนมือถือได้</p>
    <div class="intake-field"><label for="att-date">วันที่</label><input id="att-date" name="date" type="date" [(ngModel)]="date" (ngModelChange)="load()" /></div>
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    @if (loading()) { <p role="status">กำลังโหลด…</p> }
    @else if (!items().length) { <div class="empty-state"><h2>ไม่มีวันเรียนในวันที่ {{ show(date) }}</h2><p>เลือกวันอื่น หรือดูรอบที่เปิดได้ที่ “คอร์สและรอบ”</p></div> }
    @else {
      <ul class="member-results" aria-label="วันเรียน">
        @for (x of items(); track x.sessionId) {
          <li><a [routerLink]="['/staff/attendance', x.sessionId]" [attr.aria-label]="'เช็คชื่อ ' + x.courseName + ' ' + x.batchName">
            <span class="result-person"><strong>{{ x.courseName }}</strong><span>{{ x.batchName }}</span></span>
            <span class="result-contact">{{ x.startTime }}–{{ x.endTime }} น.<span class="record-state">{{ x.location }}</span></span>
            <span class="result-open">เปิดรายชื่อ<span aria-hidden="true"> →</span></span></a></li>
        }
      </ul>
    }
  </main>`,
})
export class AttendanceDaysComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly items = signal<Day[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  date = todayBangkok();
  show = shortDate;
  ngOnInit() { void this.load(); }
  async load() {
    if (!this.date) return;
    this.loading.set(true); this.error.set('');
    try { this.items.set((await this.api.request<{ items: Day[] }>(`/attendance/sessions?date=${this.date}`)).items); } catch (e) { this.error.set(errorText(e)); } finally { this.loading.set(false); }
  }
}
