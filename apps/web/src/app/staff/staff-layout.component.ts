import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import type { ReviewSummary } from '../../../../../packages/contracts/src/profile';
import { ApiClient } from '../core/api-client';
import { SessionService } from '../core/session.service';

type TabId = 'members' | 'today' | 'courses' | 'admin';
type Chip = { path: string; label: string; exact?: boolean; badge?: 'pending' | 'followUp'; admin?: boolean };
type Tab = { id: TabId; label: string; adminLabel?: string; path: string; prefixes: string[]; chips: Chip[] };

/** Four jobs, not twenty pages. Pages that people use together share a tab; its chips show the siblings. */
const TABS: Tab[] = [
  {
    id: 'members', label: 'สมาชิก', path: '/staff', prefixes: ['/staff/members', '/staff/reviews', '/staff/invites'],
    chips: [
      { path: '/staff', label: 'ค้นหาสมาชิก', exact: true },
      { path: '/staff/members/new', label: 'เพิ่มสมาชิกจากใบสมัคร' },
      { path: '/staff/reviews', label: 'รอตรวจสอบ', badge: 'pending' },
      { path: '/staff/invites', label: 'สร้างลิงก์สมัคร' },
    ],
  },
  {
    id: 'today', label: 'วันนี้', path: '/staff/dashboard', prefixes: ['/staff/dashboard', '/staff/attendance', '/staff/notifications'],
    chips: [
      { path: '/staff/dashboard', label: 'ภาพรวม' },
      { path: '/staff/attendance', label: 'เช็คชื่อ' },
      { path: '/staff/notifications', label: 'ข้อความแจ้งเตือน', badge: 'followUp' },
    ],
  },
  { id: 'courses', label: 'คอร์ส', path: '/staff/courses', prefixes: ['/staff/courses', '/staff/runs'], chips: [{ path: '/staff/courses', label: 'คอร์สและรอบ' }] },
  {
    id: 'admin', label: 'รายงาน', adminLabel: 'รายงานและตั้งค่า', path: '/staff/reports', prefixes: ['/staff/reports', '/staff/settings', '/staff/accounts'],
    chips: [
      { path: '/staff/reports', label: 'รายงาน' },
      { path: '/staff/settings/intake', label: 'ตั้งค่าประเภทบริการและเอกสาร', admin: true },
      { path: '/staff/settings', label: 'ตั้งค่าระบบ', exact: true, admin: true },
      { path: '/staff/accounts', label: 'บัญชีเจ้าหน้าที่', admin: true },
    ],
  },
];

@Component({
  selector: 'fl-staff-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `<div class="staff-shell">
    <div class="staff-bar">
      <nav aria-label="เมนูเจ้าหน้าที่" class="staff-primary">
        @for (t of tabs; track t.id) {
          <a [routerLink]="t.path" [class.nav-current]="activeTab() === t.id" [attr.aria-current]="activeTab() === t.id ? 'page' : null">
            <svg class="tab-icon" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              @switch (t.id) {
                @case ('members') { <circle cx="9" cy="8" r="3.2" /><path d="M3.5 19c.6-3.2 2.9-5 5.5-5s4.9 1.8 5.5 5" /><path d="M16 5.2a3 3 0 010 5.6M18.2 14.3c1.7.6 2.8 2.2 3.2 4.7" /> }
                @case ('today') { <rect x="4" y="5" width="16" height="15" rx="3" /><path d="M8 3v4M16 3v4M4 10h16" /><circle cx="12" cy="15" r="1.6" /> }
                @case ('courses') { <path d="M5 5a2 2 0 012-2h12v15H7a2 2 0 00-2 2V5z" /><path d="M5 20a2 2 0 012-2h12" /> }
                @default { <path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /> }
              }
            </svg>
            <span class="tab-label">{{ isAdmin() && t.adminLabel ? t.adminLabel : t.label }}</span>
            @if (tabCount(t.id); as n) { <span class="nav-badge" [attr.aria-label]="n + ' รายการ'">{{ n }}</span> }
          </a>
        }
      </nav>
    </div>
    @if (chips().length > 1) {
      <nav class="staff-subnav" aria-label="เมนูย่อย">
        @for (c of chips(); track c.path) {
          <a [routerLink]="c.path" routerLinkActive="nav-current" [routerLinkActiveOptions]="{ exact: !!c.exact }" ariaCurrentWhenActive="page">{{ c.label }}@if (chipCount(c); as n) { <span class="nav-badge" [attr.aria-label]="n + ' รายการ'">{{ n }}</span> }</a>
        }
      </nav>
    }
    <router-outlet />
  </div>`,
})
export class StaffLayoutComponent implements OnInit {
  readonly session = inject(SessionService);
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  readonly tabs = TABS;
  readonly pending = signal(0);
  readonly followUp = signal(0);
  readonly isAdmin = computed(() => this.session.user()?.role === 'admin');
  private readonly url = signal('');
  readonly activeTab = computed<TabId>(() => {
    const u = this.url();
    if (u === '/staff' || u === '/staff/') return 'members';
    return TABS.find((t) => t.prefixes.some((p) => u === p || u.startsWith(p + '/')))?.id ?? 'members';
  });
  readonly chips = computed(() => {
    const tab = TABS.find((t) => t.id === this.activeTab())!;
    return tab.chips.filter((c) => !c.admin || this.isAdmin());
  });
  chipCount(c: Chip) { return c.badge === 'pending' ? this.pending() : c.badge === 'followUp' ? this.followUp() : 0; }
  tabCount(id: TabId) { return id === 'members' ? this.pending() : id === 'today' ? this.followUp() : 0; }
  ngOnInit() {
    this.url.set(this.router.url.split('?')[0] ?? '');
    void this.refresh();
    this.router.events.subscribe((event) => {
      if (!(event instanceof NavigationEnd)) return;
      this.url.set(event.urlAfterRedirects.split('?')[0] ?? '');
      void this.refresh();
    });
  }
  private async refresh() {
    try { this.pending.set((await this.api.request<ReviewSummary>('/reviews/summary')).total); } catch { /* badge is optional */ }
    try { this.followUp.set((await this.api.request<{ followUp: number }>('/notifications/summary')).followUp); } catch { /* badge is optional */ }
  }
}
