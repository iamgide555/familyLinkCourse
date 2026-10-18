import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { MemberApi, MemberSession } from '../../core/member-api';
import { errorText } from '../shared/thai';
@Component({
  selector: 'fl-member-link',
  imports: [RouterLink],
  template: `<main id="main-content" class="member-workspace line-page">
    <h1>เชื่อมต่อสมาชิกกับ LINE</h1>
    @if (state() === 'working') { <p role="status">กำลังเชื่อมต่อ…</p> }
    @if (state() === 'done') {
      <p class="notice notice-success" role="status">เชื่อมต่อเรียบร้อยแล้ว ตอนนี้ดูโปรไฟล์และลงทะเบียนคอร์สของสมาชิกคนนี้ได้</p>
      <a class="button-primary" routerLink="/member/profile">ไปที่โปรไฟล์</a>
    }
    @if (state() === 'error') {
      <p class="notice notice-error" role="alert">{{ message() }}</p>
      @if (!session.signedIn && session.devMode) { <a class="button-primary" routerLink="/member/dev">เลือกบัญชี LINE จำลอง</a> }
      @else { <p class="field-hint">หากลิงก์หมดอายุหรือถูกใช้แล้ว ให้ขอลิงก์ใหม่จากเจ้าหน้าที่</p> }
    }
  </main>`,
})
export class MemberLinkComponent implements OnInit {
  private readonly api = inject(MemberApi);
  private readonly route = inject(ActivatedRoute);
  readonly session = inject(MemberSession);
  readonly state = signal<'working' | 'done' | 'error'>('working');
  readonly message = signal('');
  async ngOnInit() {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) { this.state.set('error'); this.message.set('ไม่พบรหัสเชื่อมต่อในลิงก์นี้'); return; }
    if (!this.session.signedIn) { this.state.set('error'); this.message.set(this.session.devMode ? 'ยังไม่ได้เลือกบัญชี LINE จำลอง' : 'กรุณาเปิดลิงก์นี้ใน LINE'); return; }
    try { await this.api.request('/link', 'POST', { token }); this.state.set('done'); }
    catch (error) { this.state.set('error'); this.message.set(errorText(error)); }
  }
}
