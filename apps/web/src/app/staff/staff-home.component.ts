import { Component, inject, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiClient } from '../core/api-client';
import type { MemberSearchResult } from '../../../../../packages/contracts/src/members';
import type { TierRecord } from '../../../../../packages/contracts/src/memberships';
@Component({
  selector: 'fl-staff-home',
  imports: [FormsModule, RouterLink],
  template: `<main id="main-content" class="member-workspace">
    <h1>ค้นหาสมาชิก</h1>
    <p class="page-intro">
      ค้นหาข้อมูลเดิมก่อนเพิ่มสมาชิกใหม่ หากมีใบสมัครใหม่ เลือก “เพิ่มสมาชิกจากใบสมัคร” ด้านบน
    </p>
    <form class="member-search" (ngSubmit)="search(1)">
      <div>
        <label for="member-query">ชื่อ เบอร์โทร หรือเลขสมาชิก</label
        ><input
          id="member-query"
          name="query"
          type="search"
          [(ngModel)]="query"
          maxlength="150"
          autocomplete="off"
        />
      </div>
      <button class="button-primary" type="submit" [disabled]="loading()">
        {{ loading() ? 'กำลังค้นหา…' : 'ค้นหา' }}
      </button>
    </form>
    <details class="intake-section member-filters" [open]="!!tier || !!membership">
      <summary><h2>กรองตามสมาชิกภาพ</h2><span>ประเภทสมาชิกและสถานะการชำระเงิน</span></summary>
      <div class="form-grid">
        <div class="intake-field"><label for="f-tier">ประเภทสมาชิก</label>
          <select id="f-tier" name="tier" [(ngModel)]="tier" (ngModelChange)="search(1)"><option value="">ทุกประเภท</option><option value="general">สมาชิกทั่วไป</option>@for (t of tiers(); track t.id) { <option [value]="t.id">{{ t.name }}</option> }</select></div>
        <div class="intake-field"><label for="f-status">สถานะ</label>
          <select id="f-status" name="status" [(ngModel)]="membership" (ngModelChange)="search(1)"><option value="">ทุกสถานะ</option><option value="active">ใช้งานอยู่ (รวมตลอดชีพ)</option><option value="expired">หมดอายุแล้ว</option><option value="expiring30">จะหมดอายุใน 30 วัน</option><option value="lifetime">ตลอดชีพ</option></select></div>
      </div>
    </details>
    @if (error()) {
      <div role="alert" class="notice notice-error">
        <p>{{ error() }}</p>
        <button class="button-secondary" type="button" (click)="search(page())">ลองอีกครั้ง</button>
      </div>
    }
    @if (loading()) {
      <p role="status">กำลังค้นหาข้อมูลสมาชิก…</p>
    } @else if (result(); as result) {
      <div class="results-heading">
        <h2>{{ searched() ? 'ผลการค้นหา' : 'สมาชิกที่เพิ่มล่าสุด' }}</h2>
        <p role="status">{{ result.total }} คน{{ searched() ? ' ตรงกับคำค้นหา' : '' }}</p>
      </div>
      @if (!result.items.length) {
        <div class="empty-state">
          <h3>{{ searched() ? 'ไม่พบสมาชิกตามคำค้นหา' : 'ยังไม่มีข้อมูลสมาชิก' }}</h3>
          <p>
            {{
              searched()
                ? 'ตรวจสอบชื่อหรือเบอร์โทร แล้วลองค้นหาอีกครั้ง'
                : 'เริ่มบันทึกข้อมูลจากใบสมัครกระดาษได้ ไม่จำเป็นต้องกรอกครบทุกช่อง'
            }}
          </p>
          <a routerLink="/staff/members/new" class="button-secondary">เพิ่มสมาชิกใหม่</a>
        </div>
      }
      <ul class="member-results">
        @for (member of result.items; track member.id) {
          <li>
            <a
              [routerLink]="['/staff/members', member.id]"
              [attr.aria-label]="'เปิดข้อมูล ' + member.firstName + ' ' + member.lastName"
            >
              <span class="avatar" [class]="'avatar ' + tone(member.id)" aria-hidden="true">{{ member.firstName.charAt(0) }}</span>
              <span class="result-person"
                ><strong>{{ member.firstName }} {{ member.lastName }}</strong
                ><span>เลขสมาชิก {{ member.memberNumber }}</span></span
              >
              <span class="result-contact"
                >{{ member.phoneMobile || 'ยังไม่มีเบอร์มือถือ'
                }}<span class="record-state">{{
                  member.signedFormAt ? 'ได้รับเอกสารลงนามแล้ว' : 'ยังไม่ได้ลงนาม'
                }}</span><span class="record-state">{{ member.tierName }}{{ member.membershipStatus === 'expired' ? ' · หมดอายุ' : member.membershipStatus === 'lifetime' ? ' · ตลอดชีพ' : '' }}</span></span
              >
              <span class="result-open">เปิดข้อมูล<span aria-hidden="true"> →</span></span>
            </a>
          </li>
        }
      </ul>
      @if (result.total > result.pageSize) {
        <nav class="pagination" aria-label="หน้ารายชื่อสมาชิก">
          <button class="button-secondary" [disabled]="page() <= 1" (click)="search(page() - 1)">
            หน้าก่อน</button
          ><span>หน้า {{ page() }}</span
          ><button
            class="button-secondary"
            [disabled]="page() * result.pageSize >= result.total"
            (click)="search(page() + 1)"
          >
            หน้าถัดไป
          </button>
        </nav>
      }
    }
  </main>`,
})
export class StaffHomeComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  readonly tiers = signal<TierRecord[]>([]);
  tier = '';
  membership = '';
  query = '';
  readonly result = signal<MemberSearchResult | null>(null);
  readonly loading = signal(false);
  readonly error = signal('');
  readonly page = signal(1);
  readonly searched = signal(false);
  async ngOnInit() {
    this.tier = this.route.snapshot.queryParamMap.get('tier') ?? '';
    this.membership = this.route.snapshot.queryParamMap.get('membership') ?? '';
    try { this.tiers.set((await this.api.request<{ items: TierRecord[] }>('/membership-tiers')).items); } catch { /* filters still work for general */ }
    void this.search(1);
  }
  tone(id: string) { let n = 0; for (const c of id) n += c.charCodeAt(0); return 'tone-' + (n % 6); }
  private rerun = false;
  async search(page: number) {
    // A filter changed while a search was running: run once more with the newest values instead of dropping it.
    if (this.loading()) { this.rerun = true; return; }
    this.loading.set(true);
    this.error.set('');
    this.result.set(null);
    try {
      this.result.set(
        await this.api.request<MemberSearchResult>(
          `/members?q=${encodeURIComponent(this.query.trim())}&page=${page}${this.tier ? `&tier=${encodeURIComponent(this.tier)}` : ''}${this.membership ? `&membership=${this.membership}` : ''}`,
        ),
      );
      this.page.set(page);
      this.searched.set(!!this.query.trim() || !!this.tier || !!this.membership);
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'ยังค้นหาไม่ได้ กรุณาลองอีกครั้ง');
    } finally {
      this.loading.set(false);
      if (this.rerun) { this.rerun = false; void this.search(1); }
    }
  }
}
