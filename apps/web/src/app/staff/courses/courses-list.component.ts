import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import type { CourseRecord } from '../../../../../../packages/contracts/src/courses';
import type { ServiceType, SettingsList } from '../../../../../../packages/contracts/src/settings';
import { ApiClient } from '../../core/api-client';
import { errorText } from '../../member/shared/thai';

@Component({
  selector: 'fl-courses-list',
  imports: [FormsModule, RouterLink],
  template: `<main id="main-content" class="member-workspace">
    <h1>คอร์ส</h1>
    <p class="page-intro">คอร์สคือหัวข้อที่เปิดสอนซ้ำได้ แต่ละครั้งที่เปิดสอนเรียกว่า “รอบ” มีวันเรียนและจำนวนที่นั่งของตัวเอง</p>
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    @if (loading()) { <p role="status">กำลังโหลดรายชื่อคอร์ส…</p> }
    @else if (!courses().length) { <div class="empty-state"><h2>ยังไม่มีคอร์ส</h2><p>สร้างคอร์สแรกด้านล่าง แล้วเพิ่มรอบเปิดสอนในหน้าของคอร์ส</p></div> }
    @else {
      <ul class="member-results" aria-label="รายการคอร์ส">
        @for (c of courses(); track c.id) {
          <li><a [routerLink]="['/staff/courses', c.id]" [attr.aria-label]="'เปิดคอร์ส ' + c.name">
            <span class="result-person"><strong>{{ c.name }}</strong><span>{{ c.description || 'ยังไม่มีคำอธิบาย' }}</span></span>
            <span class="result-contact">{{ c.runCount }} รอบ</span>
            <span class="result-open">เปิดคอร์ส<span aria-hidden="true"> →</span></span></a></li>
        }
      </ul>
    }
    <section class="intake-section" aria-labelledby="new-course">
      <h2 id="new-course">สร้างคอร์สใหม่</h2>
      <form (ngSubmit)="create()" novalidate>
        <div class="intake-field"><label for="c-name">ชื่อคอร์ส</label><input id="c-name" name="name" [(ngModel)]="name" maxlength="200" [attr.aria-invalid]="!!nameError()" />
          @if (nameError()) { <p class="field-error">{{ nameError() }}</p> }</div>
        <div class="intake-field"><label for="c-desc">คำอธิบายสั้น ๆ (ไม่บังคับ)</label><textarea id="c-desc" name="description" rows="3" [(ngModel)]="description"></textarea></div>
        @if (services().length) {
          <fieldset class="intake-field"><legend class="q-label">บริการที่เกี่ยวข้อง (ใช้จับคู่กับความสนใจของสมาชิก)</legend>
            @for (s of services(); track s.id) { <label class="choice"><input type="checkbox" [checked]="tags().includes(s.id)" (change)="toggle(s.id)" /> {{ s.name }}</label> }
          </fieldset>
        }
        <div class="form-actions"><button class="button-primary" type="submit" [disabled]="busy()">{{ busy() ? 'กำลังสร้าง…' : 'สร้างคอร์ส' }}</button></div>
      </form>
    </section>
  </main>`,
})
export class CoursesListComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  readonly courses = signal<CourseRecord[]>([]);
  readonly services = signal<ServiceType[]>([]);
  readonly tags = signal<string[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly nameError = signal('');
  name = '';
  description = '';
  async ngOnInit() {
    try {
      const [courses, services] = await Promise.all([this.api.request<{ items: CourseRecord[] }>('/courses'), this.api.request<SettingsList<ServiceType>>('/settings/service-types')]);
      this.courses.set(courses.items);
      this.services.set(services.items.filter((s) => s.active));
    } catch (e) { this.error.set(errorText(e)); } finally { this.loading.set(false); }
  }
  toggle(id: string) { this.tags.update((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id])); }
  async create() {
    this.nameError.set('');
    if (!this.name.trim()) { this.nameError.set('กรุณาระบุชื่อคอร์ส'); return; }
    this.busy.set(true);
    try {
      const made = await this.api.request<CourseRecord>('/courses', 'POST', { name: this.name.trim(), description: this.description.trim(), serviceTypeIds: this.tags() });
      await this.router.navigate(['/staff/courses', made.id]);
    } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
}
