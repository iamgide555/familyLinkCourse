import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { StaffUser } from '../../../../../../packages/contracts/src/core';
import type { MemberSearchResult } from '../../../../../../packages/contracts/src/members';
import { ApiClient } from '../../core/api-client';
import { SessionService } from '../../core/session.service';
import { errorText } from '../../member/shared/thai';

@Component({
  selector: 'fl-staff-accounts',
  imports: [FormsModule],
  template: `<main id="main-content" class="member-workspace">
    <h1>บัญชีเจ้าหน้าที่</h1>
    <p class="page-intro">เพิ่มเจ้าหน้าที่ ปิดการใช้งาน หรือเปลี่ยนสิทธิ์ การเปลี่ยนแปลงมีผลทันที และเจ้าหน้าที่ที่ถูกปิดการใช้งานจะถูกออกจากระบบทันที</p>
    @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    @if (loading()) { <p role="status">กำลังโหลดรายชื่อ…</p> }
    @else {
      <ul class="doc-list" aria-label="รายชื่อเจ้าหน้าที่">
        @for (user of users(); track user.id) {
          <li>
            <span><strong>{{ user.name }}</strong> · {{ user.email }}
              <span class="record-state"> · {{ user.role === 'admin' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่' }} · {{ user.active ? 'ใช้งานอยู่' : 'ปิดการใช้งาน' }}{{ user.memberId ? ' · เป็นสมาชิกด้วย' : '' }}</span></span>
            <span class="doc-actions">
              <button class="button-secondary" type="button" [disabled]="busy() || user.id === me()?.id" (click)="patch(user, { active: !user.active }, user.active ? 'ปิดการใช้งานแล้ว' : 'เปิดใช้งานแล้ว')">{{ user.active ? 'ปิดการใช้งาน' : 'เปิดใช้งาน' }}</button>
              <button class="button-secondary" type="button" [disabled]="busy() || user.id === me()?.id" (click)="patch(user, { role: user.role === 'admin' ? 'staff' : 'admin' }, 'เปลี่ยนสิทธิ์แล้ว')">{{ user.role === 'admin' ? 'เปลี่ยนเป็นเจ้าหน้าที่' : 'เปลี่ยนเป็นผู้ดูแลระบบ' }}</button>
              <button class="button-secondary" type="button" (click)="edit(user)">ตั้งค่าเพิ่มเติม</button>
            </span>
          </li>
        }
      </ul>
      @if (editing(); as user) {
        <section class="intake-section" [attr.aria-label]="'ตั้งค่าของ ' + user.name">
          <h2>ตั้งค่าของ {{ user.name }}</h2>
          <div class="intake-field"><label for="a-pass">ตั้งรหัสผ่านใหม่ (อย่างน้อย 12 ตัวอักษร เว้นว่างถ้าไม่เปลี่ยน)</label><input id="a-pass" name="password" type="password" autocomplete="new-password" [(ngModel)]="newPassword" /></div>
          <fieldset class="intake-section"><legend><h3>เชื่อมกับข้อมูลสมาชิกของตนเอง</h3></legend>
            <p class="field-hint">เจ้าหน้าที่ที่เป็นสมาชิกด้วยจะอนุมัติรายการของตนเองและครอบครัวไม่ได้ ให้เจ้าหน้าที่คนอื่นอนุมัติแทน</p>
            @if (user.memberId) { <button class="button-secondary" type="button" [disabled]="busy()" (click)="patch(user, { memberId: null }, 'ยกเลิกการเชื่อมสมาชิกแล้ว')">ยกเลิกการเชื่อมสมาชิก</button> }
            <div class="member-search">
              <div><label for="a-search">ค้นหาสมาชิก (ชื่อ เบอร์ หรือเลขสมาชิก)</label><input id="a-search" name="search" type="search" [(ngModel)]="query" /></div>
              <button class="button-secondary" type="button" (click)="search()">ค้นหา</button>
            </div>
            <ul class="choice-list">
              @for (m of found(); track m.id) {
                <li><span>{{ m.firstName }} {{ m.lastName }} · {{ m.memberNumber }}</span><button class="button-secondary" type="button" [disabled]="busy()" (click)="patch(user, { memberId: m.id }, 'เชื่อมสมาชิกแล้ว')">เชื่อมกับบัญชีนี้</button></li>
              }
            </ul>
          </fieldset>
          <div class="form-actions">
            <button class="button-primary" type="button" [disabled]="busy() || newPassword.length < 12" (click)="patch(user, { password: newPassword }, 'เปลี่ยนรหัสผ่านแล้ว')">บันทึกรหัสผ่านใหม่</button>
            <button class="button-secondary" type="button" (click)="editing.set(null)">ปิด</button>
          </div>
        </section>
      }
      <section class="intake-section" aria-labelledby="new-staff">
        <h2 id="new-staff">เพิ่มเจ้าหน้าที่ใหม่</h2>
        <form (ngSubmit)="create()" novalidate>
          <div class="form-grid">
            <div class="intake-field"><label for="n-name">ชื่อ-นามสกุล</label><input id="n-name" name="name" [(ngModel)]="form.name" /></div>
            <div class="intake-field"><label for="n-email">อีเมลสำหรับเข้าสู่ระบบ</label><input id="n-email" name="email" type="email" autocomplete="off" [(ngModel)]="form.email" /></div>
            <div class="intake-field"><label for="n-pass">รหัสผ่านเริ่มต้น (อย่างน้อย 12 ตัวอักษร)</label><input id="n-pass" name="password" type="password" autocomplete="new-password" [(ngModel)]="form.password" /></div>
            <div class="intake-field"><label for="n-role">สิทธิ์</label><select id="n-role" name="role" [(ngModel)]="form.role"><option value="staff">เจ้าหน้าที่</option><option value="admin">ผู้ดูแลระบบ</option></select></div>
          </div>
          <div class="form-actions"><button class="button-primary" type="submit" [disabled]="busy()">เพิ่มเจ้าหน้าที่</button></div>
        </form>
      </section>
    }
  </main>`,
})
export class AccountsComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly me = inject(SessionService).user;
  readonly users = signal<StaffUser[]>([]);
  readonly editing = signal<StaffUser | null>(null);
  readonly found = signal<MemberSearchResult['items']>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  form = { name: '', email: '', password: '', role: 'staff' };
  newPassword = '';
  query = '';
  ngOnInit() { void this.load(); }
  async load() {
    this.loading.set(true);
    try { this.users.set(await this.api.request<StaffUser[]>('/staff')); } catch (e) { this.error.set(errorText(e)); } finally { this.loading.set(false); }
  }
  edit(user: StaffUser) { this.newPassword = ''; this.query = ''; this.found.set([]); this.editing.set(user); }
  async search() {
    try { this.found.set((await this.api.request<MemberSearchResult>(`/members?q=${encodeURIComponent(this.query.trim())}&page=1`)).items); } catch (e) { this.error.set(errorText(e)); }
  }
  async create() {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try {
      await this.api.request('/staff', 'POST', { ...this.form, email: this.form.email.trim(), name: this.form.name.trim() });
      this.form = { name: '', email: '', password: '', role: 'staff' };
      this.message.set('เพิ่มเจ้าหน้าที่แล้ว');
      await this.load();
    } catch (e) {
      const fields = (e as { fields?: Record<string, string> }).fields;
      this.error.set(fields ? Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join(' · ') + ' — กรุณาตรวจสอบอีเมลและรหัสผ่านอย่างน้อย 12 ตัวอักษร' : errorText(e));
    } finally { this.busy.set(false); }
  }
  async patch(user: StaffUser, body: Record<string, unknown>, done: string) {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(''); this.message.set('');
    try {
      await this.api.request(`/staff/${user.id}`, 'PATCH', body);
      this.message.set(`${done} (${user.name})`);
      this.newPassword = '';
      await this.load();
      this.editing.set(this.users().find((u) => u.id === user.id) ?? null);
    } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
}
