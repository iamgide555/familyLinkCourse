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
        <a routerLink="/member/profile" routerLinkActive="nav-current" ariaCurrentWhenActive="page">โปรไฟล์</a>
        <a routerLink="/member/courses" routerLinkActive="nav-current" ariaCurrentWhenActive="page">ลงทะเบียนคอร์ส</a>
        <a routerLink="/member/registrations" routerLinkActive="nav-current" ariaCurrentWhenActive="page">การลงทะเบียนของฉัน</a>
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
