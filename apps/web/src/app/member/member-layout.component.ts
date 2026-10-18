import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MemberSession } from '../core/member-api';
import { LiffService } from '../core/liff.service';
@Component({
  selector: 'fl-member-layout',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  template: `<div class="line-shell">
    @if (session.devMode) {
      <section class="dev-bar" aria-label="โหมดทดสอบ">
        <p>
          <strong>โหมดทดสอบ</strong> ·
          @if (session.lineUserId()) { ใช้บัญชี LINE จำลอง <code>{{ session.lineUserId() }}</code> } @else { ยังไม่ได้เลือกบัญชี LINE จำลอง }
        </p>
        <a routerLink="/member/dev">เปลี่ยนบัญชีจำลอง</a>
      </section>
    }
    @if (session.signedIn) {
      <nav class="line-nav" aria-label="เมนูสมาชิก">
        <a routerLink="/member/profile" routerLinkActive="nav-current" ariaCurrentWhenActive="page"><svg class="tab-icon" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx='12' cy='8' r='3.6'/><path d='M5 20c.8-3.8 3.6-6 7-6s6.2 2.2 7 6'/></svg><span class="tab-label">โปรไฟล์</span></a>
        <a routerLink="/member/courses" routerLinkActive="nav-current" ariaCurrentWhenActive="page"><svg class="tab-icon" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x='4' y='5' width='16' height='15' rx='3'/><path d='M8 3v4M16 3v4M4 10h16'/></svg><span class="tab-label">ลงทะเบียนคอร์ส</span></a>
        <a routerLink="/member/registrations" routerLinkActive="nav-current" ariaCurrentWhenActive="page"><svg class="tab-icon" width="26" height="26" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d='M8.5 6h11.5M8.5 12h11.5M8.5 18h11.5'/><path d='M3.8 6.2l1 1 1.8-2.1M3.8 12.2l1 1 1.8-2.1M3.8 18.2l1 1 1.8-2.1'/></svg><span class="tab-label">การลงทะเบียนของฉัน</span></a>
      </nav>
    }
    @if (ready()) { <router-outlet /> } @else { <p role="status" class="member-workspace line-page">กำลังเข้าสู่ระบบ LINE…</p> }
  </div>`,
})
export class MemberLayoutComponent implements OnInit {
  readonly session = inject(MemberSession);
  private readonly liff = inject(LiffService);
  readonly ready = signal(false);
  async ngOnInit() {
    try { await this.liff.ready(); } finally { this.ready.set(true); }
  }
}
