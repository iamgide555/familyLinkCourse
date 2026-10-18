import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { AttendanceRow, AttendanceStatus, Roster } from '../../../../../../packages/contracts/src/attendance';
import { ApiClient } from '../../core/api-client';
import { STATUS_WORD, errorText, shortDate } from '../../member/shared/thai';

@Component({
  selector: 'fl-roster',
  imports: [RouterLink],
  template: `<main id="main-content" class="member-workspace roster-page">
    <a class="back-link" routerLink="/staff/attendance">กลับไปเลือกวันเรียน</a>
    @if (loading()) { <p role="status">กำลังโหลดรายชื่อ…</p> }
    @else if (roster(); as r) {
      <h1>{{ r.courseName }} · {{ r.batchName }}</h1>
      <p class="member-number">{{ date(r.date) }} · {{ r.startTime }}–{{ r.endTime }} น.{{ r.location ? ' · ' + r.location : '' }}</p>
      @if (r.sessionStatus === 'cancelled') { <p class="notice notice-error" role="alert">วันเรียนนี้ถูกยกเลิกแล้ว เช็คชื่อไม่ได้</p> }
      <div class="roster-counts" role="status" aria-live="polite">
        <span>ลงทะเบียน <strong>{{ r.registered }}</strong></span><span>มา <strong>{{ r.present }}</strong></span><span>ไม่มา <strong>{{ r.absent }}</strong></span><span>ยังไม่เช็ค <strong>{{ r.unmarked }}</strong></span>
      </div>
      @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
      @if (!r.rows.length) { <p class="empty-state">ยังไม่มีผู้ลงทะเบียนที่ยืนยันแล้วในวันเรียนนี้</p> }
      <ul class="roster-list" aria-label="รายชื่อผู้เรียน">
        @for (row of r.rows; track row.memberId) {
          <li [class.is-cancelled]="row.bookingStatus !== 'confirmed'">
            <div class="roster-person">
              <strong>{{ row.memberName }}</strong>
              <span class="record-state">เลขสมาชิก {{ row.memberNumber }}{{ row.phoneMobile ? ' · ' + row.phoneMobile : '' }}{{ row.unsigned ? ' · ยังไม่ได้ลงนาม' : '' }}{{ row.bookingStatus !== 'confirmed' ? ' · ' + word(row.bookingStatus) : '' }}</span>
              <span class="roster-state pill" [attr.data-status]="row.attendance ?? 'unmarked'">{{ row.attendance === 'present' ? 'มาเรียน' : row.attendance === 'absent' ? 'ไม่มา' : 'ยังไม่เช็คชื่อ' }}</span>
            </div>
            @if (r.sessionStatus === 'scheduled' && row.bookingStatus === 'confirmed') {
              <div class="roster-buttons" role="group" [attr.aria-label]="'เช็คชื่อ ' + row.memberName">
                <button type="button" class="button-primary" [attr.aria-pressed]="row.attendance === 'present'" [disabled]="busy() === row.memberId" (click)="mark(row, 'present')">มา</button>
                <button type="button" class="button-secondary" [attr.aria-pressed]="row.attendance === 'absent'" [disabled]="busy() === row.memberId" (click)="mark(row, 'absent')">ไม่มา</button>
                @if (row.attendance) { <button type="button" class="button-secondary" [disabled]="busy() === row.memberId" (click)="clear(row)">ล้าง</button> }
              </div>
            }
          </li>
        }
      </ul>
    }
  </main>`,
})
export class RosterComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  readonly roster = signal<Roster | null>(null);
  readonly loading = signal(true);
  readonly busy = signal('');
  readonly error = signal('');
  readonly date = shortDate;
  private id = '';
  word(s: string) { return STATUS_WORD[s] ?? s; }
  async ngOnInit() { this.id = this.route.snapshot.paramMap.get('sessionId') ?? ''; await this.load(); this.loading.set(false); }
  async load() { try { this.roster.set(await this.api.request<Roster>(`/sessions/${this.id}/roster`)); } catch (e) { this.error.set(errorText(e)); } }
  async mark(row: AttendanceRow, status: AttendanceStatus) {
    this.busy.set(row.memberId); this.error.set('');
    try { await this.api.request(`/sessions/${this.id}/attendance`, 'POST', { memberId: row.memberId, status }); await this.load(); } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(''); }
  }
  async clear(row: AttendanceRow) {
    this.busy.set(row.memberId); this.error.set('');
    try { await this.api.request(`/sessions/${this.id}/attendance/${row.memberId}`, 'DELETE'); await this.load(); } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(''); }
  }
}
