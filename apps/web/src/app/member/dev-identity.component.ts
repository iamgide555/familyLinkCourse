import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MemberSession } from '../core/member-api';
@Component({
  selector: 'fl-dev-identity',
  imports: [FormsModule],
  template: `<main id="main-content" class="member-workspace line-page">
    <h1>เลือกบัญชี LINE จำลอง</h1>
    @if (!session.devMode) {
      <p class="notice notice-error" role="alert">หน้านี้ใช้ได้เฉพาะตอนทดสอบเท่านั้น กรุณาเปิดผ่าน LINE</p>
    } @else {
      <p class="page-intro">ใช้แทนการล็อกอิน LINE ระหว่างทดสอบ หนึ่งบัญชีจำลองเท่ากับหนึ่งบัญชี LINE ซึ่งดูแลสมาชิกได้หลายคน</p>
      <div class="dev-choices">
        @for (item of samples; track item.id) {
          <button type="button" class="button-secondary" (click)="choose(item.id)">{{ item.label }}</button>
        }
      </div>
      <form (ngSubmit)="choose('synthetic-' + custom.trim().toLowerCase())">
        <label for="custom-id">หรือตั้งชื่อบัญชีจำลองเอง (ตัวอักษรอังกฤษ ตัวเลข อย่างน้อย 4 ตัว)</label>
        <input id="custom-id" name="custom" [(ngModel)]="custom" maxlength="60" autocomplete="off" />
        <div class="form-actions"><button class="button-primary" type="submit" [disabled]="!valid()">ใช้บัญชีนี้</button></div>
      </form>
    }
  </main>`,
})
export class DevIdentityComponent {
  readonly session = inject(MemberSession);
  private readonly router = inject(Router);
  custom = '';
  readonly samples = [
    { id: 'synthetic-demo-a', label: 'บัญชีจำลอง A (ผู้ดูแลคนที่ 1)' },
    { id: 'synthetic-demo-b', label: 'บัญชีจำลอง B (ผู้ดูแลคนที่ 2)' },
    { id: 'synthetic-demo-c', label: 'บัญชีจำลอง C (สมาชิกใหม่ ยังไม่เคยสมัคร)' },
  ];
  valid() { return /^[a-z0-9_-]{4,60}$/i.test(this.custom.trim()); }
  choose(id: string) {
    if (!/^synthetic-[a-z0-9_-]{4,80}$/i.test(id)) return;
    this.session.set(id);
    void this.router.navigate(['/member/profile']);
  }
}
