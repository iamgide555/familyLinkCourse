import { Component, inject, input, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ApiClient } from '../../core/api-client';
import type { MemberRecord } from '../../../../../../packages/contracts/src/members';

type PdpaRequest = {
  id: string; kind: string; status: string; reason: string; note: string | null;
  createdAt: string; resolvedAt: string | null;
};
@Component({
  selector: 'fl-member-admin-actions',
  imports: [FormsModule],
  template: `<section class="intake-section" aria-labelledby="pdpa-title">
    <h2 id="pdpa-title">คำขอข้อมูลส่วนบุคคล</h2>
    <p>ผู้ดูแลระบบบันทึกคำขอเข้าถึงหรือลบข้อมูล และผลการดำเนินการแต่ละรายการ</p>
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    @if (loading()) { <p role="status">กำลังเปิดคำขอ…</p> }
    @else {
      @if (!requests().length) { <p>ยังไม่มีคำขอ</p> }
      <ul class="choice-list">
        @for (item of requests(); track item.id) {
          <li><div>
            <strong>{{ item.kind === 'access' ? 'ขอเข้าถึงข้อมูล' : 'ขอลบข้อมูล' }}</strong>
            <p>{{ item.reason }}</p>
            <p>{{ item.status === 'open' ? 'รอดำเนินการ' : item.status === 'completed' ? 'ดำเนินการแล้ว' : 'ปฏิเสธคำขอ' }}</p>
            @if (item.note) { <p>{{ item.note }}</p> }
            @if (item.status === 'open') {
              <label [for]="'resolution-' + item.id">บันทึกผลการดำเนินการ</label>
              <textarea [id]="'resolution-' + item.id" [name]="'resolution-' + item.id" [(ngModel)]="resolutionNotes[item.id]" rows="2" maxlength="2000"></textarea>
              <button type="button" class="button-secondary" [disabled]="busy()" (click)="resolve(item.id, 'completed')">ปิดคำขอเป็นดำเนินการแล้ว</button>
              <button type="button" class="button-secondary" [disabled]="busy()" (click)="resolve(item.id, 'refused')">ปฏิเสธคำขอ</button>
            }
          </div></li>
        }
      </ul>
      <form (ngSubmit)="openRequest()">
        <label for="pdpaKind">ประเภทคำขอ</label>
        <select id="pdpaKind" name="pdpaKind" [(ngModel)]="requestKind">
          <option value="access">ขอเข้าถึงข้อมูล</option>
          <option value="deletion">ขอลบข้อมูล</option>
        </select>
        <label for="pdpaReason">รายละเอียดคำขอ</label>
        <textarea id="pdpaReason" name="pdpaReason" [(ngModel)]="requestReason" rows="2" maxlength="2000" required></textarea>
        <button type="submit" class="button-primary" [disabled]="busy()">บันทึกคำขอ</button>
      </form>
    }
  </section>
  <section class="intake-section" aria-labelledby="delete-member-title">
    <h2 id="delete-member-title">ลบข้อมูลสมาชิกจากรายการใช้งาน</h2>
    <p>สมาชิกจะไม่ปรากฏในการค้นหา ประวัติและคำขอจะถูกเก็บตามนโยบายข้อมูล</p>
    <label for="deleteReason">เหตุผลที่ลบสมาชิก</label>
    <textarea id="deleteReason" name="deleteReason" [(ngModel)]="deleteReason" rows="2" maxlength="2000"></textarea>
    <button type="button" class="button-secondary" [disabled]="busy()" (click)="deleteMember()">ลบสมาชิก</button>
  </section>`,
})
export class MemberAdminActionsComponent implements OnInit {
  readonly member = input.required<MemberRecord>();
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  readonly requests = signal<PdpaRequest[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  requestKind: 'access' | 'deletion' = 'access';
  requestReason = '';
  deleteReason = '';
  resolutionNotes: Record<string, string> = {};
  ngOnInit() { void this.load(); }
  async load() {
    this.loading.set(true);
    try {
      const data = await this.api.request<{ items: PdpaRequest[] }>(`/members/${this.member().id}/pdpa-requests`);
      this.requests.set(data.items);
      this.error.set('');
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'ยังเปิดคำขอไม่ได้'); }
    finally { this.loading.set(false); }
  }
  async openRequest() {
    if (this.busy() || !this.requestReason.trim()) { this.error.set('กรุณาระบุรายละเอียดคำขอ'); return; }
    this.busy.set(true);
    try {
      await this.api.request(`/members/${this.member().id}/pdpa-requests`, 'POST', { kind: this.requestKind, reason: this.requestReason.trim() });
      this.requestReason = '';
      await this.load();
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'ยังบันทึกคำขอไม่ได้'); }
    finally { this.busy.set(false); }
  }
  async resolve(id: string, status: 'completed' | 'refused') {
    const note = this.resolutionNotes[id]?.trim();
    if (this.busy() || !note) { this.error.set('กรุณาบันทึกผลการดำเนินการ'); return; }
    this.busy.set(true);
    try {
      await this.api.request(`/members/${this.member().id}/pdpa-requests/${id}`, 'PATCH', { status, note });
      await this.load();
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'ยังปิดคำขอไม่ได้'); }
    finally { this.busy.set(false); }
  }
  async deleteMember() {
    if (this.busy() || !this.deleteReason.trim()) { this.error.set('กรุณาระบุเหตุผลที่ลบสมาชิก'); return; }
    this.busy.set(true);
    try {
      await this.api.request(`/members/${this.member().id}`, 'DELETE', { reason: this.deleteReason.trim() });
      await this.router.navigate(['/staff']);
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'ยังลบสมาชิกไม่ได้'); }
    finally { this.busy.set(false); }
  }
}
