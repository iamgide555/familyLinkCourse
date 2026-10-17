import { Component, inject, signal } from '@angular/core';
import { SessionService } from '../core/session.service';
@Component({
  selector: 'fl-staff-home',
  template: ` <main id="main-content" class="workspace">
    <h1>เข้าสู่ระบบแล้ว</h1>
    <p class="welcome-name">{{ session.user()?.name }}</p>
    <p>สิทธิ์การใช้งาน: {{ session.user()?.role === 'admin' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่' }}</p>
    @if (error()) {
      <p class="notice notice-error" role="alert">{{ error() }}</p>
    }
    <button class="button-secondary" type="button" [disabled]="busy()" (click)="logout()">
      {{ busy() ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ' }}
    </button>
  </main>`,
})
export class StaffHomeComponent {
  readonly session = inject(SessionService);
  readonly busy = signal(false);
  readonly error = signal('');
  async logout(): Promise<void> {
    this.busy.set(true);
    try {
      await this.session.logout();
    } catch {
      this.error.set('ออกจากระบบยังไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง');
    } finally {
      this.busy.set(false);
    }
  }
}
