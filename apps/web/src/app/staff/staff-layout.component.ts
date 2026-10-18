import { Component, OnInit, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { ReviewSummary } from '../../../../../packages/contracts/src/profile';
import { ApiClient } from '../core/api-client';
import { SessionService } from '../core/session.service';

type MoreLink = { path: string; label: string; exact?: boolean; badge?: 'followUp' };

/** Daily work stays in the bar; everything else opens from "เพิ่มเติม" so the first screen is content, not menu. */
const WORK_LINKS: MoreLink[] = [
  { path: '/staff/dashboard', label: 'ภาพรวม' },
  { path: '/staff/members/new', label: 'เพิ่มสมาชิกจากใบสมัคร' },
  { path: '/staff/courses', label: 'คอร์สและรอบ' },
  { path: '/staff/notifications', label: 'ข้อความแจ้งเตือน', badge: 'followUp' },
  { path: '/staff/reports', label: 'รายงาน' },
  { path: '/staff/invites', label: 'สร้างลิงก์สมัคร' },
];
const ADMIN_LINKS: MoreLink[] = [
  { path: '/staff/settings/intake', label: 'ตั้งค่าประเภทบริการและเอกสาร' },
  { path: '/staff/settings', label: 'ตั้งค่าระบบ', exact: true },
  { path: '/staff/accounts', label: 'บัญชีเจ้าหน้าที่' },
];
// Pages that belong under "เพิ่มเติม" even when the URL is deeper, such as a run opened from a course.
const MORE_PREFIXES = ['/staff/dashboard', '/staff/members/new', '/staff/courses', '/staff/runs', '/staff/notifications', '/staff/reports', '/staff/invites', '/staff/settings', '/staff/accounts'];

@Component({
  selector: 'fl-staff-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `<div class="staff-shell">
    <div class="staff-bar">
      <nav aria-label="เมนูเจ้าหน้าที่" class="staff-primary">
        <a routerLink="/staff" routerLinkActive="nav-current" [routerLinkActiveOptions]="{ exact: true }" ariaCurrentWhenActive="page">ค้นหาสมาชิก</a>
        <a routerLink="/staff/attendance" routerLinkActive="nav-current" ariaCurrentWhenActive="page">เช็คชื่อ</a>
        <a routerLink="/staff/reviews" routerLinkActive="nav-current" ariaCurrentWhenActive="page"
          >รอตรวจสอบ@if (pending() > 0) { <span class="nav-badge" [attr.aria-label]="pending() + ' รายการ'">{{ pending() }}</span> }</a
        >
        <button id="staff-more-toggle" type="button" class="more-toggle" [class.nav-current]="moreCurrent()" [attr.aria-expanded]="moreOpen()" aria-controls="staff-more" (click)="moreOpen.set(!moreOpen())" (keydown.escape)="closeMore()">
          เพิ่มเติม@if (followUp() > 0 && !moreOpen()) { <span class="nav-badge" [attr.aria-label]="followUp() + ' ข้อความต้องติดตาม'">{{ followUp() }}</span> }
          <svg class="chevron" [class.chevron-open]="moreOpen()" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6l5 5 5-5" /></svg>
        </button>
      </nav>
      @if (moreOpen()) {
        <div id="staff-more" class="staff-more" (keydown.escape)="closeMore()">
          <section aria-labelledby="more-work">
            <h2 id="more-work" class="more-title">งานอื่น ๆ</h2>
            <ul class="more-list">
              @for (l of workLinks; track l.path) {
                <li><a [routerLink]="l.path" routerLinkActive="nav-current" ariaCurrentWhenActive="page">{{ l.label }}@if (l.badge && followUp() > 0) { <span class="nav-badge" [attr.aria-label]="followUp() + ' ข้อความต้องติดตาม'">{{ followUp() }}</span> }</a></li>
              }
            </ul>
          </section>
          @if (session.user()?.role === 'admin') {
            <section aria-labelledby="more-admin">
              <h2 id="more-admin" class="more-title">สำหรับผู้ดูแลระบบ</h2>
              <ul class="more-list">
                @for (l of adminLinks; track l.path) {
                  <li><a [routerLink]="l.path" routerLinkActive="nav-current" [routerLinkActiveOptions]="{ exact: !!l.exact }" ariaCurrentWhenActive="page">{{ l.label }}</a></li>
                }
              </ul>
            </section>
          }
          <section class="more-account" aria-label="บัญชีผู้ใช้งาน">
            <p>
              <strong>{{ session.user()?.name }}</strong
              ><span>{{ session.user()?.role === 'admin' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่' }}</span>
            </p>
            <button type="button" class="button-secondary" [disabled]="busy()" (click)="logout()">
              {{ busy() ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ' }}
            </button>
            @if (error()) {
              <p role="alert" class="notice notice-error">{{ error() }}</p>
            }
          </section>
        </div>
      }
    </div>
    <router-outlet />
  </div>`,
})
export class StaffLayoutComponent implements OnInit {
  readonly session = inject(SessionService);
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  readonly workLinks = WORK_LINKS;
  readonly adminLinks = ADMIN_LINKS;
  readonly pending = signal(0);
  readonly followUp = signal(0);
  readonly moreOpen = signal(false);
  readonly moreCurrent = signal(MORE_PREFIXES.some((p) => location.pathname.startsWith(p)));
  ngOnInit() {
    void this.refresh();
    this.router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;
      this.moreOpen.set(false);
      this.moreCurrent.set(MORE_PREFIXES.some((p) => event.urlAfterRedirects.startsWith(p)));
      void this.refresh();
    });
  }
  closeMore() {
    if (!this.moreOpen()) return;
    this.moreOpen.set(false);
    document.getElementById('staff-more-toggle')?.focus();
  }
  private async refresh() {
    try { this.pending.set((await this.api.request<ReviewSummary>('/reviews/summary')).total); } catch { /* badge is optional */ }
    try { this.followUp.set((await this.api.request<{ followUp: number }>('/notifications/summary')).followUp); } catch { /* badge is optional */ }
  }
  readonly busy = signal(false);
  readonly error = signal('');
  async logout() {
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
