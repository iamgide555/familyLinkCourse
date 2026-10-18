import { Component, EventEmitter, Input, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import type { RunRecord, SessionRecord } from '../../../../../../packages/contracts/src/courses';
import { ApiClient } from '../../core/api-client';
import { errorText, shortDate, thaiDateTime } from '../../member/shared/thai';

type Panel = { kind: 'edit' | 'reschedule' | 'cancel'; session: SessionRecord };

@Component({
  selector: 'fl-run-sessions',
  imports: [FormsModule, RouterLink],
  template: `<section class="intake-section" aria-labelledby="sessions-heading">
    <h2 id="sessions-heading">วันเรียน</h2>
    @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    <ul class="doc-list" aria-label="รายการวันเรียน">
      @for (s of run.sessions; track s.id) {
        <li [class.is-cancelled]="s.status === 'cancelled'">
          <span><strong>วันที่ {{ s.dayNo }} · {{ date(s.date) }}</strong> · {{ s.startTime }}–{{ s.endTime }} น.
            @if (s.location) { · {{ s.location }} }
            <span class="record-state">
              @if (s.status === 'cancelled') { · ยกเลิกแล้ว }
              @else if (run.perSessionRegistration) { · จองแล้ว {{ s.reserved }}/{{ s.capacity }} ที่นั่ง · รอคิว {{ s.waiting }} คน }
              @if (s.status !== 'cancelled' && s.cancelDeadline) { · สมาชิกยกเลิกเองได้ถึง {{ dateTime(s.cancelDeadline) }} }
            </span></span>
          @if (run.status === 'active' && s.status === 'scheduled') {
            <span class="doc-actions">
              <a class="button-primary" [routerLink]="['/staff/attendance', s.id]">เช็คชื่อ</a>
              <details class="row-menu" #menu>
                <summary>จัดการ<svg class="chevron" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l5 5 5-5" /></svg></summary>
                <div class="row-menu-list">
                  <button type="button" class="button-secondary" (click)="menu.open = false; open('edit', s)">แก้ไข</button>
                  <button type="button" class="button-secondary" (click)="menu.open = false; open('reschedule', s)">เลื่อนวัน</button>
                  <button type="button" class="button-danger-outline" (click)="menu.open = false; open('cancel', s)">ยกเลิกวันเรียน</button>
                  @if (!run.structureLocked && run.sessions.length > 1) { <button type="button" class="button-danger-outline" (click)="menu.open = false; remove(s)">ลบ</button> }
                </div>
              </details>
            </span>
          }
        </li>
      }
    </ul>
    @if (panel(); as p) {
      <form class="q-draft" (ngSubmit)="submit(p)" novalidate [attr.aria-label]="title(p)" id="session-panel" tabindex="-1">
        <h3>{{ title(p) }}</h3>
        @switch (p.kind) {
          @case ('edit') {
            <div class="form-grid">
              <div class="intake-field"><label for="e-loc">สถานที่</label><input id="e-loc" name="loc" [(ngModel)]="f.location" maxlength="200" /></div>
              <div class="intake-field"><label for="e-url">ลิงก์เรียนออนไลน์</label><input id="e-url" name="url" [(ngModel)]="f.onlineUrl" /></div>
              @if (run.perSessionRegistration) { <div class="intake-field"><label for="e-cap">จำนวนที่นั่ง</label><input id="e-cap" name="cap" type="number" min="1" inputmode="numeric" [(ngModel)]="f.capacity" />
                <p class="field-hint">ลดต่ำกว่าจำนวนที่จองแล้ว ({{ p.session.reserved }}) ไม่ได้ เพิ่มที่นั่งแล้วคิวรอจะเลื่อนขึ้นอัตโนมัติ</p></div> }
            </div>
          }
          @case ('reschedule') {
            <p class="field-hint">สมาชิกที่ลงทะเบียนและอยู่ในคิวรอจะได้รับแจ้ง และยกเลิกเองได้อีก 7 วันนับจากวันที่เลื่อน (ไม่เกินเวลาเริ่มของวันเรียนใหม่)</p>
            <div class="form-grid">
              <div class="intake-field"><label for="r-date">วันที่ใหม่</label><input id="r-date" name="date" type="date" [(ngModel)]="f.date" /></div>
              <div class="intake-field"><label for="r-start">เวลาเริ่ม</label><input id="r-start" name="start" type="time" [(ngModel)]="f.startTime" /></div>
              <div class="intake-field"><label for="r-end">เวลาสิ้นสุด</label><input id="r-end" name="end" type="time" [(ngModel)]="f.endTime" /></div>
            </div>
          }
          @case ('cancel') {
            <p class="field-hint">ผู้ที่ลงทะเบียนหรืออยู่ในคิวรอวันเรียนนี้จะได้รับแจ้ง การยกเลิกเรียกคืนไม่ได้</p>
            <div class="intake-field"><label for="c-reason">เหตุผลที่ยกเลิก (บันทึกไว้ภายใน)</label><textarea id="c-reason" name="reason" rows="2" [(ngModel)]="f.reason"></textarea></div>
          }
        }
        <div class="form-actions">
          <button [class]="p.kind === 'cancel' ? 'button-danger' : 'button-primary'" type="submit" [disabled]="busy()">{{ busy() ? 'กำลังบันทึก…' : p.kind === 'cancel' ? 'ยืนยันยกเลิกวันเรียน' : 'บันทึก' }}</button>
          <button class="button-secondary" type="button" (click)="panel.set(null)">ปิด</button>
        </div>
      </form>
    }
    @if (run.status === 'active' && !run.structureLocked) {
      <details class="add-session"><summary>เพิ่มวันเรียน</summary>
      <form class="q-draft" (ngSubmit)="add()" novalidate aria-label="เพิ่มวันเรียน">
        <div class="form-grid">
          <div class="intake-field"><label for="n-date">วันที่</label><input id="n-date" name="ndate" type="date" [(ngModel)]="n.date" /></div>
          <div class="intake-field"><label for="n-start">เวลาเริ่ม</label><input id="n-start" name="nstart" type="time" [(ngModel)]="n.startTime" /></div>
          <div class="intake-field"><label for="n-end">เวลาสิ้นสุด</label><input id="n-end" name="nend" type="time" [(ngModel)]="n.endTime" /></div>
          @if (run.perSessionRegistration) { <div class="intake-field"><label for="n-cap">จำนวนที่นั่ง</label><input id="n-cap" name="ncap" type="number" min="1" [(ngModel)]="n.capacity" /></div> }
        </div>
        <div class="form-actions"><button class="button-secondary" type="submit" [disabled]="busy() || !n.date">เพิ่มวันเรียน</button></div>
      </form>
      </details>
    } @else if (run.structureLocked && run.status === 'active') {
      <p class="field-hint">มีผู้ลงทะเบียนแล้ว เพิ่มหรือลบวันเรียนไม่ได้ เลื่อนวันหรือยกเลิกวันเรียนแทนได้</p>
    }
  </section>`,
})
export class RunSessionsComponent {
  @Input({ required: true }) run!: RunRecord;
  @Output() changed = new EventEmitter<void>();
  private readonly api = inject(ApiClient);
  readonly panel = signal<Panel | null>(null);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly date = shortDate;
  readonly dateTime = thaiDateTime;
  f = { location: '', onlineUrl: '', capacity: null as number | null, date: '', startTime: '', endTime: '', reason: '' };
  n = { date: '', startTime: '09:00', endTime: '16:00', capacity: 20 as number | null };
  title(p: Panel) { return `${{ edit: 'แก้ไข', reschedule: 'เลื่อน', cancel: 'ยกเลิก' }[p.kind]}วันเรียนที่ ${p.session.dayNo}`; }
  open(kind: Panel['kind'], session: SessionRecord) {
    this.f = { location: session.location, onlineUrl: session.onlineUrl, capacity: session.capacity, date: session.date, startTime: session.startTime, endTime: session.endTime, reason: '' };
    this.panel.set({ kind, session });
    this.message.set(''); this.error.set('');
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('session-panel')?.focus()));
  }
  private async run_(task: () => Promise<unknown>, done: string) {
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await task(); this.message.set(done); this.panel.set(null); this.changed.emit(); } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
  submit(p: Panel) {
    const id = p.session.id;
    if (p.kind === 'edit') return this.run_(() => this.api.request(`/sessions/${id}`, 'PATCH', { location: this.f.location.trim(), onlineUrl: this.f.onlineUrl.trim(), ...(this.run.perSessionRegistration ? { capacity: Number(this.f.capacity) } : {}) }), 'บันทึกวันเรียนแล้ว');
    if (p.kind === 'reschedule') return this.run_(() => this.api.request(`/sessions/${id}/reschedule`, 'POST', { date: this.f.date, startTime: this.f.startTime, endTime: this.f.endTime }), 'เลื่อนวันเรียนแล้ว และแจ้งผู้ลงทะเบียนแล้ว');
    return this.run_(() => this.api.request(`/sessions/${id}/cancel`, 'POST', { reason: this.f.reason }), 'ยกเลิกวันเรียนแล้ว และแจ้งผู้ลงทะเบียนแล้ว');
  }
  remove(s: SessionRecord) { return this.run_(() => this.api.request(`/sessions/${s.id}`, 'DELETE'), 'ลบวันเรียนแล้ว'); }
  add() {
    return this.run_(() => this.api.request(`/runs/${this.run.id}/sessions`, 'POST', { date: this.n.date, startTime: this.n.startTime, endTime: this.n.endTime, ...(this.run.perSessionRegistration ? { capacity: Number(this.n.capacity) } : {}) }), 'เพิ่มวันเรียนแล้ว');
  }
}
