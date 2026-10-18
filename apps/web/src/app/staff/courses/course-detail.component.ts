import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import type { CourseDetail } from '../../../../../../packages/contracts/src/courses';
import type { QuestionInput } from '../../../../../../packages/contracts/src/questions';
import type { ServiceType, SettingsList } from '../../../../../../packages/contracts/src/settings';
import { ApiClient } from '../../core/api-client';
import { SessionService } from '../../core/session.service';
import { QuestionEditorComponent } from '../../shared/question-editor.component';
import { errorText, shortDate } from '../../member/shared/thai';

@Component({
  selector: 'fl-course-detail',
  imports: [FormsModule, RouterLink, QuestionEditorComponent],
  template: `<main id="main-content" class="member-workspace">
    <a class="back-link" routerLink="/staff/courses">กลับไปรายการคอร์ส</a>
    @if (loading()) { <p role="status">กำลังโหลดข้อมูลคอร์ส…</p> }
    @else if (course(); as c) {
      <h1>{{ c.name }}</h1>
      @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
      @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
      <section class="intake-section" aria-labelledby="runs-heading">
        <div class="profile-heading"><h2 id="runs-heading">รอบที่เปิดสอน</h2><a class="button-primary" [routerLink]="['/staff/courses', c.id, 'runs', 'new']">สร้างรอบใหม่</a></div>
        @if (!c.runs.length) { <p class="empty-state">ยังไม่มีรอบ กด “สร้างรอบใหม่” เพื่อกำหนดวันเรียนและจำนวนที่นั่ง</p> }
        <ul class="member-results">
          @for (r of c.runs; track r.id) {
            <li><a [routerLink]="['/staff/runs', r.id]" [attr.aria-label]="'เปิดรอบ ' + r.batchName">
              <span class="result-person"><strong>{{ r.batchName }}</strong><span>{{ r.firstDate ? 'เริ่ม ' + date(r.firstDate) : 'ยังไม่มีวันเรียน' }} · {{ r.sessionCount }} วันเรียน</span></span>
              <span class="result-contact">{{ r.status === 'cancelled' ? 'ยกเลิกแล้ว' : r.perSessionRegistration ? 'ลงทะเบียนรายวัน' : 'ลงทะเบียนทั้งคอร์ส' }}<span class="record-state">{{ r.structureLocked ? 'มีผู้ลงทะเบียนแล้ว' : 'ยังไม่มีผู้ลงทะเบียน' }}</span></span>
              <span class="result-open">เปิดรอบ<span aria-hidden="true"> →</span></span></a></li>
          }
        </ul>
      </section>
      <section class="intake-section" aria-labelledby="info-heading">
        <h2 id="info-heading">ข้อมูลคอร์ส</h2>
        <form (ngSubmit)="saveInfo()" novalidate>
          <div class="intake-field"><label for="d-name">ชื่อคอร์ส</label><input id="d-name" name="name" [(ngModel)]="name" maxlength="200" /></div>
          <div class="intake-field"><label for="d-desc">คำอธิบาย</label><textarea id="d-desc" name="description" rows="3" [(ngModel)]="description"></textarea></div>
          @if (services().length) {
            <fieldset class="intake-field"><legend class="q-label">บริการที่เกี่ยวข้อง</legend>
              @for (s of services(); track s.id) { <label class="choice"><input type="checkbox" [checked]="tags().includes(s.id)" (change)="toggle(s.id)" /> {{ s.name }}</label> }
            </fieldset>
          }
          <div class="form-actions"><button class="button-primary" type="submit" [disabled]="busy()">บันทึกข้อมูลคอร์ส</button></div>
        </form>
      </section>
      <fl-question-editor heading="คำถามเริ่มต้นของคอร์ส" intro="รอบใหม่ที่สร้างจากคอร์สนี้จะคัดลอกคำถามชุดนี้ไป การแก้ไขภายหลังไม่กระทบรอบที่เปิดอยู่แล้ว" [questions]="c.questions" [saver]="saveQuestions" (saved)="reload()" />
      @if (session.user()?.role === 'admin') {
        <section class="intake-section"><h2>ลบคอร์ส</h2>
          <p class="section-intro">ผู้ดูแลระบบลบคอร์สได้ รอบที่ยังมีผู้ลงทะเบียนต้องยกเลิกรอบก่อน เพื่อแจ้งผู้ลงทะเบียนทุกคน</p>
          @if (!confirmDelete()) { <button class="button-secondary" type="button" (click)="confirmDelete.set(true)">ลบคอร์สนี้</button> }
          @else { <p class="notice notice-error" role="alert">ยืนยันลบคอร์ส “{{ c.name }}” และรอบทั้งหมด?</p>
            <div class="form-actions"><button class="button-danger" type="button" [disabled]="busy()" (click)="remove()">ยืนยันลบ</button><button class="button-secondary" type="button" (click)="confirmDelete.set(false)">ไม่ลบ</button></div> }
        </section>
      }
    }
  </main>`,
})
export class CourseDetailComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  readonly session = inject(SessionService);
  readonly course = signal<CourseDetail | null>(null);
  readonly services = signal<ServiceType[]>([]);
  readonly tags = signal<string[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly confirmDelete = signal(false);
  readonly date = shortDate;
  name = '';
  description = '';
  private id = '';
  readonly saveQuestions = async (questions: QuestionInput[]): Promise<void> => { await this.api.request(`/courses/${this.id}/questions`, 'PUT', { questions }); };
  async ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    await this.load();
    try { this.services.set((await this.api.request<SettingsList<ServiceType>>('/settings/service-types')).items.filter((s) => s.active)); } catch { /* optional */ }
  }
  async load() {
    this.loading.set(true);
    try {
      const course = await this.api.request<CourseDetail>(`/courses/${this.id}`);
      this.course.set(course); this.name = course.name; this.description = course.description; this.tags.set([...course.serviceTypeIds]);
    } catch (e) { this.error.set(errorText(e)); } finally { this.loading.set(false); }
  }
  async reload() { try { this.course.set(await this.api.request<CourseDetail>(`/courses/${this.id}`)); } catch (e) { this.error.set(errorText(e)); } }
  toggle(id: string) { this.tags.update((t) => (t.includes(id) ? t.filter((x) => x !== id) : [...t, id])); }
  async saveInfo() {
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await this.api.request(`/courses/${this.id}`, 'PATCH', { name: this.name, description: this.description, serviceTypeIds: this.tags() }); this.message.set('บันทึกข้อมูลคอร์สแล้ว'); await this.load(); }
    catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
  async remove() {
    this.busy.set(true);
    try { await this.api.request(`/courses/${this.id}`, 'DELETE'); await this.router.navigate(['/staff/courses']); } catch (e) { this.error.set(errorText(e)); this.confirmDelete.set(false); } finally { this.busy.set(false); }
  }
}
