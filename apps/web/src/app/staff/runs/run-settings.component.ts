import { Component, EventEmitter, Input, OnChanges, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { RunRecord } from '../../../../../../packages/contracts/src/courses';
import { ApiClient } from '../../core/api-client';
import { bangkokInput, bangkokIso, errorText } from '../../member/shared/thai';

@Component({
  selector: 'fl-run-settings',
  imports: [FormsModule],
  template: `<section class="intake-section" aria-labelledby="settings-heading">
    <h2 id="settings-heading">ตั้งค่ารอบ</h2>
    @if (run.structureLocked) { <p class="notice">มีผู้ลงทะเบียนแล้ว เปลี่ยนรูปแบบการลงทะเบียนและการอนุมัติไม่ได้อีก (ล็อกถาวร) แก้ชื่อ สถานที่ เวลา และจำนวนที่นั่งได้</p> }
    @if (run.status !== 'active') { <p class="notice">รอบนี้ถูกยกเลิกแล้ว แก้ไขไม่ได้</p> }
    <form (ngSubmit)="save()" novalidate>
      <div class="form-grid">
        <div class="intake-field"><label for="st-batch">ชื่อรุ่น / รอบ</label><input id="st-batch" name="batch" [(ngModel)]="f.batchName" [disabled]="run.status !== 'active'" /></div>
        <div class="intake-field"><label for="st-loc">สถานที่</label><input id="st-loc" name="loc" [(ngModel)]="f.location" [disabled]="run.status !== 'active'" /></div>
        @if (!run.perSessionRegistration) { <div class="intake-field"><label for="st-cap">จำนวนที่นั่งทั้งรอบ</label><input id="st-cap" name="cap" type="number" min="1" inputmode="numeric" [(ngModel)]="f.capacity" [disabled]="run.status !== 'active'" />
          <p class="field-hint">ลดต่ำกว่าจำนวนที่จองแล้ว ({{ run.reserved }}) ไม่ได้ เพิ่มแล้วคิวรอเลื่อนขึ้นอัตโนมัติ</p></div> }
        <div class="intake-field"><label for="st-open">เปิดรับลงทะเบียน (เวลาประเทศไทย)</label><input id="st-open" name="opens" type="datetime-local" [(ngModel)]="f.opens" [disabled]="run.status !== 'active'" /></div>
        <div class="intake-field"><label for="st-close">ปิดรับลงทะเบียน</label><input id="st-close" name="closes" type="datetime-local" [(ngModel)]="f.closes" [disabled]="run.status !== 'active'" /></div>
        <div class="intake-field"><label for="st-days">ยกเลิกเองได้ก่อนวันเรียนแรก (วัน)</label><input id="st-days" name="days" type="number" min="0" max="365" [(ngModel)]="f.cancelDeadlineDays" [disabled]="run.status !== 'active'" /></div>
      </div>
      <label class="choice"><input type="checkbox" name="waitlist" [(ngModel)]="f.waitlistEnabled" [disabled]="run.status !== 'active'" /> เปิดคิวรอเมื่อที่นั่งเต็ม</label>
      <label class="choice"><input type="checkbox" name="approval" [(ngModel)]="f.requireApproval" [disabled]="run.structureLocked || run.status !== 'active'" /> ต้องให้เจ้าหน้าที่อนุมัติ</label>
      <label class="choice"><input type="checkbox" name="mode" [(ngModel)]="f.perSessionRegistration" [disabled]="run.structureLocked || run.status !== 'active'" /> ลงทะเบียนรายวัน</label>
      @if (run.status === 'active') { <div class="form-actions"><button class="button-primary" type="submit" [disabled]="busy()">{{ busy() ? 'กำลังบันทึก…' : 'บันทึกการตั้งค่า' }}</button></div> }
      @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
      @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    </form>
  </section>`,
})
export class RunSettingsComponent implements OnChanges {
  @Input({ required: true }) run!: RunRecord;
  @Output() changed = new EventEmitter<void>();
  private readonly api = inject(ApiClient);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  f = { batchName: '', location: '', capacity: null as number | null, opens: '', closes: '', cancelDeadlineDays: 7, waitlistEnabled: true, requireApproval: false, perSessionRegistration: false };
  ngOnChanges() {
    const r = this.run;
    this.f = { batchName: r.batchName, location: r.location, capacity: r.capacity, opens: bangkokInput(r.registrationOpensAt), closes: bangkokInput(r.registrationClosesAt), cancelDeadlineDays: r.cancelDeadlineDays, waitlistEnabled: r.waitlistEnabled, requireApproval: r.requireApproval, perSessionRegistration: r.perSessionRegistration };
  }
  async save() {
    this.busy.set(true); this.error.set(''); this.message.set('');
    const f = this.f;
    const patch: Record<string, unknown> = { batchName: f.batchName, location: f.location, cancelDeadlineDays: Number(f.cancelDeadlineDays), waitlistEnabled: f.waitlistEnabled, registrationOpensAt: bangkokIso(f.opens), registrationClosesAt: bangkokIso(f.closes) };
    if (!this.run.structureLocked) { patch['requireApproval'] = f.requireApproval; patch['perSessionRegistration'] = f.perSessionRegistration; }
    if (!f.perSessionRegistration && f.capacity !== null) patch['capacity'] = Number(f.capacity);
    try { await this.api.request(`/runs/${this.run.id}`, 'PATCH', patch); this.message.set('บันทึกการตั้งค่าแล้ว'); this.changed.emit(); }
    catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
}
