import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiClient } from '../../core/api-client';
import { MEMBER_TYPES, errorText, memberTypeLabel, thaiDate, thaiDateTime } from '../../member/shared/thai';
import type { ProfileChangeReview, EditableProfileField } from '../../../../../../packages/contracts/src/profile';
import type { SignupInput } from '../../../../../../packages/contracts/src/signup';

type Candidate = { id: string; memberNumber: string; firstName: string; lastName: string; birthDate: string; phoneMobile: string; linked: boolean };
type SignupReview = { id: string; submitted: SignupInput; candidates: Candidate[]; documents: Array<{ id: string; mime: string; size: number }>; source: 'line' | 'invite'; createdAt: string };
const LABEL: Record<EditableProfileField, string> = {
  firstName: 'ชื่อ', lastName: 'นามสกุล', birthDate: 'วันเกิด', phoneMobile: 'เบอร์มือถือ', email: 'อีเมล',
  provinceId: 'จังหวัด', districtId: 'อำเภอ / เขต', memberType: 'ประเภทสมาชิก', requestedServiceIds: 'บริการที่ต้องการ',
};

@Component({
  selector: 'fl-staff-reviews',
  imports: [FormsModule, RouterLink],
  template: `<main id="main-content" class="member-workspace">
    <h1>รอตรวจสอบ</h1>
    <p class="page-intro">ใบสมัครที่ตรงกับสมาชิกเดิม และคำขอแก้ไขข้อมูลจากสมาชิก ตรวจสอบทีละรายการ ระบบจะไม่เชื่อมบัญชีให้เองจนกว่าเจ้าหน้าที่ยืนยัน</p>
    @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    @if (loading()) { <p role="status">กำลังโหลดรายการ…</p> }
    @else {
      <section class="intake-section" aria-labelledby="signup-heading">
        <h2 id="signup-heading">ใบสมัครที่ตรงกับสมาชิกเดิม ({{ signups().length }})</h2>
        @if (!signups().length) { <p class="empty-state">ไม่มีใบสมัครที่รอตรวจสอบ</p> }
        @for (item of signups(); track item.id) {
          <article class="review-item" [attr.aria-label]="'ใบสมัครของ ' + item.submitted.firstName + ' ' + item.submitted.lastName">
            <h3>{{ item.submitted.firstName }} {{ item.submitted.lastName }}</h3>
            <p class="record-state">ส่งเมื่อ {{ dateTime(item.createdAt) }} · {{ item.source === 'line' ? 'สมัครผ่าน LINE' : 'สมัครผ่านลิงก์เชิญ' }}</p>
            <dl class="profile-fields">
              <div><dt>วันเกิด</dt><dd>{{ date(item.submitted.birthDate) }}</dd></div>
              <div><dt>เบอร์มือถือ</dt><dd>{{ item.submitted.phoneMobile }}</dd></div>
              <div><dt>ประเภทสมาชิก</dt><dd>{{ typeLabel(item.submitted.memberType) }}</dd></div>
              <div><dt>จังหวัด / อำเภอ</dt><dd>{{ item.submitted.provinceId }} / {{ item.submitted.districtId }}</dd></div>
              @if (item.submitted.registeringFor === 'another') { <div><dt>ผู้สมัครเป็นอะไรกับผู้กรอก</dt><dd>{{ item.submitted.relationship }}</dd></div> }
              @if (item.documents.length) { <div><dt>เอกสารแนบ</dt><dd>{{ item.documents.length }} ไฟล์ (ผู้ดูแลระบบเปิดดูได้หลังเชื่อมกับสมาชิก)</dd></div> }
            </dl>
            <h4>สมาชิกเดิมที่ชื่อและวันเกิดตรงกัน</h4>
            <ul class="choice-list">
              @for (c of item.candidates; track c.id) {
                <li>
                  <span><a [routerLink]="['/staff/members', c.id]" target="_blank" rel="noopener">{{ c.firstName }} {{ c.lastName }}</a> · เลขสมาชิก {{ c.memberNumber }} · {{ c.phoneMobile || 'ไม่มีเบอร์' }}
                    <span class="record-state"> · {{ c.linked ? 'มีบัญชี LINE เชื่อมอยู่แล้ว' : 'ยังไม่เชื่อม LINE' }}</span></span>
                  <button class="button-primary" type="button" [disabled]="busy() || (c.linked && item.source === 'line')" (click)="decide(item, { decision: 'link_existing', memberId: c.id })">เชื่อมกับสมาชิกคนนี้</button>
                </li>
              }
            </ul>
            @if (open() === item.id) {
              <div class="intake-field">
                <label [attr.for]="'reason-' + item.id">เหตุผล ({{ openKind() === 'create_new' ? 'ที่สร้างเป็นสมาชิกใหม่ เช่น คนละคนแต่ชื่อวันเกิดตรงกัน' : 'ที่ปฏิเสธใบสมัคร' }})</label>
                <textarea [id]="'reason-' + item.id" [name]="'reason-' + item.id" rows="2" [(ngModel)]="reason"></textarea>
              </div>
              <div class="form-actions">
                <button class="button-primary" type="button" [disabled]="busy() || !reason.trim()" (click)="decide(item, { decision: openKind(), reason: reason.trim() })">ยืนยัน{{ openKind() === 'create_new' ? 'สร้างสมาชิกใหม่' : 'ปฏิเสธ' }}</button>
                <button class="button-secondary" type="button" (click)="open.set('')">ยกเลิก</button>
              </div>
            } @else {
              <div class="form-actions">
                <button class="button-secondary" type="button" [disabled]="busy()" (click)="ask(item.id, 'create_new')">เป็นคนละคน สร้างสมาชิกใหม่</button>
                <button class="button-secondary" type="button" [disabled]="busy()" (click)="ask(item.id, 'reject')">ปฏิเสธใบสมัคร</button>
              </div>
            }
          </article>
        }
      </section>

      <section class="intake-section" aria-labelledby="profile-heading">
        <h2 id="profile-heading">คำขอแก้ไขข้อมูล ({{ changes().length }})</h2>
        @if (!changes().length) { <p class="empty-state">ไม่มีคำขอแก้ไขที่รออนุมัติ</p> }
        @for (c of changes(); track c.id) {
          <article class="review-item" [attr.aria-label]="'คำขอแก้ไขของ ' + c.memberName">
            <h3><a [routerLink]="['/staff/members', c.memberId]">{{ c.memberName }}</a></h3>
            <p class="record-state">เลขสมาชิก {{ c.memberNumber }} · ส่งเมื่อ {{ dateTime(c.createdAt) }}</p>
            <table class="diff">
              <caption class="sr-only">ข้อมูลเดิมและข้อมูลที่ขอแก้ไข</caption>
              <thead><tr><th scope="col">ข้อมูล</th><th scope="col">เดิม</th><th scope="col">ขอแก้เป็น</th></tr></thead>
              <tbody>@for (f of c.fields; track f) { <tr><th scope="row">{{ label(f) }}</th><td data-label="เดิม">{{ show(f, c.oldValues) }}</td><td data-label="ขอแก้เป็น"><strong>{{ show(f, c.newValues) }}</strong></td></tr> }</tbody>
            </table>
            <div class="form-actions">
              <button class="button-primary" type="button" [disabled]="busy()" (click)="review(c, true)">อนุมัติ</button>
              <button class="button-secondary" type="button" [disabled]="busy()" (click)="review(c, false)">ไม่อนุมัติ</button>
            </div>
          </article>
        }
      </section>
    }
  </main>`,
})
export class ReviewsComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly signups = signal<SignupReview[]>([]);
  readonly changes = signal<ProfileChangeReview[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly open = signal('');
  readonly openKind = signal<'create_new' | 'reject'>('create_new');
  readonly types = MEMBER_TYPES;
  readonly date = thaiDate;
  readonly dateTime = thaiDateTime;
  readonly typeLabel = memberTypeLabel;
  private services = new Map<string, string>();
  reason = '';
  label(field: EditableProfileField) { return LABEL[field]; }
  show(field: EditableProfileField, values: Record<string, unknown>): string {
    const value = values[field];
    if (field === 'requestedServiceIds') return (Array.isArray(value) ? value : []).map((id) => this.services.get(String(id)) ?? '').filter(Boolean).join(', ') || '—';
    if (field === 'memberType') return memberTypeLabel(String(value ?? ''));
    if (field === 'birthDate') return thaiDate(String(value ?? ''));
    return String(value ?? '') || '—';
  }
  ngOnInit() { void this.load(); }
  async load() {
    this.loading.set(true);
    this.error.set('');
    try {
      const [signups, changes, services] = await Promise.all([
        this.api.request<SignupReview[]>('/member/reviews'),
        this.api.request<{ items: ProfileChangeReview[] }>('/member/profile-changes'),
        this.api.request<{ items: Array<{ id: string; name: string }> }>('/settings/service-types'),
      ]);
      this.services = new Map(services.items.map((s) => [s.id, s.name]));
      this.signups.set(signups);
      this.changes.set(changes.items);
    } catch (e) {
      this.error.set(errorText(e, 'โหลดรายการไม่สำเร็จ'));
    } finally {
      this.loading.set(false);
    }
  }
  ask(id: string, kind: 'create_new' | 'reject') { this.reason = ''; this.openKind.set(kind); this.open.set(id); }
  async decide(item: SignupReview, body: Record<string, unknown>) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try {
      await this.api.request(`/member/reviews/${item.id}/decision`, 'POST', body);
      this.message.set(`ตรวจสอบใบสมัครของ ${item.submitted.firstName} ${item.submitted.lastName} เรียบร้อย ระบบแจ้งผลให้ผู้สมัครแล้ว`);
      this.open.set('');
      await this.load();
    } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
  async review(item: ProfileChangeReview, approve: boolean) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try {
      await this.api.request(`/member/profile-changes/${item.id}/decision`, 'POST', { approve });
      this.message.set(approve ? `อนุมัติการแก้ไขของ ${item.memberName} แล้ว` : `ไม่อนุมัติคำขอของ ${item.memberName} แล้ว`);
      await this.load();
    } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
}
