import { Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiClient } from '../../core/api-client';
import { SessionService } from '../../core/session.service';
import type { DocumentType, ServiceType, SettingsList } from '../../../../../../packages/contracts/src/settings';

@Component({
  selector: 'fl-intake-settings',
  imports: [FormsModule, RouterLink],
  template: `<main id="main-content" class="member-workspace">
    <a class="back-link" routerLink="/staff">กลับไปหน้ารายชื่อ</a>
    <h1>ตั้งค่าประเภทบริการและเอกสาร</h1>
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    @if (loading()) { <p role="status">กำลังเปิดการตั้งค่า…</p> }
    @else if (session.user()?.role !== 'admin') {
      <p class="notice notice-error" role="alert">เฉพาะผู้ดูแลระบบที่แก้ไขการตั้งค่านี้ได้</p>
    } @else {
      <section class="intake-section">
        <h2>ประเภทบริการ</h2>
        <p>รายการนี้ใช้ในส่วนบริการที่สมาชิกต้องการ หากยังไม่มีรายการ ให้เพิ่มตามใบสมัครที่ใช้งานจริง</p>
        @if (!services().length) { <p role="status">ยังไม่มีประเภทบริการ</p> }
        <ul class="choice-list">
          @for (item of services(); track item.id) {
            <li><span>{{ item.name }} · {{ item.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน' }}</span>
              <button type="button" class="button-secondary" [disabled]="busy()" (click)="toggle('service-types', item)">
                {{ item.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน' }} {{ item.name }}
              </button>
            </li>
          }
        </ul>
        <form (ngSubmit)="add('service-types')">
          <label for="newService">ชื่อบริการใหม่</label>
          <input id="newService" name="newService" [(ngModel)]="newService" maxlength="150" required />
          <button type="submit" class="button-primary" [disabled]="busy()">เพิ่มบริการ</button>
        </form>
      </section>
      <section class="intake-section">
        <h2>ประเภทเอกสาร</h2>
        <p>เอกสารที่อัปโหลดทุกชนิดถือเป็นข้อมูลอ่อนไหว และเปิดไฟล์ได้เฉพาะผู้ดูแลระบบ</p>
        <ul class="choice-list">
          @for (item of documents(); track item.id) {
            <li><span>{{ item.name }} · {{ item.active ? 'เปิดใช้งาน' : 'ปิดใช้งาน' }}</span>
              <button type="button" class="button-secondary" [disabled]="busy()" (click)="toggle('document-types', item)">
                {{ item.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน' }} {{ item.name }}
              </button>
            </li>
          }
        </ul>
        <form (ngSubmit)="add('document-types')">
          <label for="newDocument">ชื่อประเภทเอกสารใหม่</label>
          <input id="newDocument" name="newDocument" [(ngModel)]="newDocument" maxlength="150" required />
          <button type="submit" class="button-primary" [disabled]="busy()">เพิ่มประเภทเอกสาร</button>
        </form>
      </section>
    }
  </main>`,
})
export class IntakeSettingsComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly session = inject(SessionService);
  readonly services = signal<ServiceType[]>([]);
  readonly documents = signal<DocumentType[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  newService = '';
  newDocument = '';
  ngOnInit() { void this.load(); }
  async load() {
    this.loading.set(true);
    try {
      const [services, documents] = await Promise.all([
        this.api.request<SettingsList<ServiceType>>('/settings/service-types'),
        this.api.request<SettingsList<DocumentType>>('/settings/document-types'),
      ]);
      this.services.set(services.items);
      this.documents.set(documents.items);
      this.error.set('');
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'ยังเปิดการตั้งค่าไม่ได้'); }
    finally { this.loading.set(false); }
  }
  async add(kind: 'service-types' | 'document-types') {
    const name = (kind === 'service-types' ? this.newService : this.newDocument).trim();
    if (!name || this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.request(`/settings/${kind}`, 'POST', { name });
      if (kind === 'service-types') this.newService = ''; else this.newDocument = '';
      await this.load();
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'ยังบันทึกไม่ได้'); }
    finally { this.busy.set(false); }
  }
  async toggle(kind: 'service-types' | 'document-types', item: ServiceType | DocumentType) {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      await this.api.request(`/settings/${kind}/${item.id}`, 'PATCH', { active: !item.active });
      await this.load();
    } catch (e) { this.error.set(e instanceof Error ? e.message : 'ยังบันทึกไม่ได้'); }
    finally { this.busy.set(false); }
  }
}
