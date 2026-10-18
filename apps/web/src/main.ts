import { bootstrapApplication } from '@angular/platform-browser';
import { Component, inject, signal } from '@angular/core';
import { NavigationEnd, Router, provideRouter, RouterOutlet, RouterLink } from '@angular/router';
import { routes } from './app/app.routes';
import { SessionService } from './app/core/session.service';
type Theme = 'system' | 'light' | 'dark';
const THEME_NEXT: Record<Theme, Theme> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_WORD: Record<Theme, string> = { system: 'ตามเครื่อง', light: 'สว่าง', dark: 'มืด' };
function savedTheme(): Theme {
  try {
    const t = localStorage.getItem('fl-theme');
    return t === 'light' || t === 'dark' ? t : 'system';
  } catch {
    return 'system';
  }
}
@Component({
  selector: 'fl-app',
  imports: [RouterOutlet, RouterLink],
  template: ` <a class="skip-link" href="#main-content">ข้ามไปเนื้อหา</a>
    <header class="site-header">
      <div class="site-header-inner">
        <a class="wordmark" [routerLink]="member() ? '/member/profile' : '/staff'" aria-label="FamilyLink หน้าหลัก"
          ><svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" fill="none">
            <rect width="40" height="40" rx="12" fill="#06c755" />
            <g stroke="#04210f" stroke-width="3">
              <rect x="7" y="13" width="17" height="14" rx="7" />
              <rect x="16" y="13" width="17" height="14" rx="7" />
            </g></svg
          ><span>FamilyLink</span></a
        >
        @if (!member() && session.user(); as u) {
          <div class="account">
            <p class="account-who"><span class="account-name">{{ u.name }}</span><span class="account-role">{{ u.role === 'admin' ? 'ผู้ดูแลระบบ' : 'เจ้าหน้าที่' }}</span></p>
            <button type="button" class="button-secondary account-out" [disabled]="signingOut()" (click)="logout()">{{ signingOut() ? 'กำลังออกจากระบบ…' : 'ออกจากระบบ' }}</button>
          </div>
        }
        <button type="button" class="theme-toggle" (click)="cycleTheme()" [attr.aria-label]="'โหมดสี: ' + themeLabel() + ' กดเพื่อเปลี่ยน'">
          @switch (theme()) {
            @case ('light') { <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></svg> }
            @case ('dark') { <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.2A8.2 8.2 0 019.8 4 8.2 8.2 0 1020 14.2z" /></svg> }
            @default { <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="8.2" /><path d="M12 3.8v16.4" /><path d="M12 3.8a8.2 8.2 0 010 16.4z" fill="currentColor" stroke="none" /></svg> }
          }
          <span class="theme-label">{{ themeLabel() }}</span>
        </button>
      </div>
    </header>
    @if (logoutError()) { <p role="alert" class="notice notice-error top-notice">{{ logoutError() }}</p> }
    <router-outlet />`,
})
class AppComponent {
  readonly member = signal(location.pathname.startsWith('/member'));
  readonly session = inject(SessionService);
  readonly signingOut = signal(false);
  readonly logoutError = signal('');
  async logout() {
    this.signingOut.set(true);
    this.logoutError.set('');
    try {
      await this.session.logout();
    } catch {
      this.logoutError.set('ออกจากระบบยังไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง');
    } finally {
      this.signingOut.set(false);
    }
  }
  readonly theme = signal<Theme>(savedTheme());
  themeLabel() { return THEME_WORD[this.theme()]; }
  /** Cycles device setting, light, dark. The choice is remembered on this device only. */
  cycleTheme() {
    const next = THEME_NEXT[this.theme()];
    this.theme.set(next);
    const root = document.documentElement;
    if (next === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', next);
    try {
      if (next === 'system') localStorage.removeItem('fl-theme');
      else localStorage.setItem('fl-theme', next);
    } catch {
      /* storage can be blocked; the choice then lasts until reload */
    }
  }
  constructor() {
    inject(Router).events.subscribe((event) => {
      if (event instanceof NavigationEnd) this.member.set(event.urlAfterRedirects.startsWith('/member'));
    });
  }
}
bootstrapApplication(AppComponent, { providers: [provideRouter(routes)] }).catch(() =>
  console.error('Unable to start FamilyLink interface'),
);
