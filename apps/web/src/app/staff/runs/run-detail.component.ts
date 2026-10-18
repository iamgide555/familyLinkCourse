import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import type { CourseDetail, RunRecord } from '../../../../../../packages/contracts/src/courses';
import type { QuestionInput } from '../../../../../../packages/contracts/src/questions';
import { ApiClient } from '../../core/api-client';
import { SessionService } from '../../core/session.service';
import { QuestionEditorComponent } from '../../shared/question-editor.component';
import { errorText, thaiDateTime } from '../../member/shared/thai';
import { RunRegisterMemberComponent } from './run-register-member.component';
import { RunRegistrationsComponent } from './run-registrations.component';
import { RunSessionsComponent } from './run-sessions.component';
import { RunSettingsComponent } from './run-settings.component';
import { RunFormsComponent } from './run-forms.component';

@Component({
  selector: 'fl-run-detail',
  imports: [FormsModule, RouterLink, QuestionEditorComponent, RunRegisterMemberComponent, RunRegistrationsComponent, RunSessionsComponent, RunSettingsComponent, RunFormsComponent],
  template: `<main id="main-content" class="member-workspace">
    @if (course()) { <a class="back-link" [routerLink]="['/staff/courses', run()?.courseId]">กลับไปหน้าคอร์ส {{ course()!.name }}</a> }
    @if (error() && !run()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    @if (loading()) { <p role="status">กำลังโหลดข้อมูลรอบ…</p> }
    @else if (run(); as r) {
      <div class="profile-heading">
        <div><h1>{{ course()?.name }} · {{ r.batchName }}</h1>
          <p class="member-number">{{ r.status === 'cancelled' ? 'รอบนี้ถูกยกเลิกแล้ว' : r.perSessionRegistration ? 'ลงทะเบียนรายวัน' : 'ลงทะเบียนทั้งคอร์ส' }} · {{ r.requireApproval ? 'ต้องอนุมัติ' : 'ยืนยันอัตโนมัติ' }} · {{ r.waitlistEnabled ? 'มีคิวรอ' : 'ไม่มีคิวรอ' }}</p></div>
        @if (r.status === 'active') { <a class="button-primary" [routerLink]="['/staff/runs', r.id, 'walkin']">รับลงทะเบียนหน้างาน</a> }
      </div>
      <div class="profile-status">
        @if (!r.perSessionRegistration) { <span>จองแล้ว {{ r.reserved }} จาก {{ r.capacity }} ที่นั่ง</span><span>รอคิว {{ r.waiting }} คน</span> }
        @else { <span>จองแล้วรวม {{ r.reserved }} ที่นั่งในทุกวัน</span><span>รอคิวรวม {{ r.waiting }} รายการ</span> }
        @if (r.cancelDeadline && r.status === 'active') { <span>สมาชิกยกเลิกเองได้ถึง {{ dateTime(r.cancelDeadline) }}</span> }
        @if (r.promotionCutoff && r.status === 'active') { <span>คิวรอเลื่อนขึ้นอัตโนมัติถึง {{ dateTime(r.promotionCutoff) }}</span> }
      </div>
      @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
      @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
      <fl-run-sessions [run]="r" (changed)="refresh()" />
      <fl-run-registrations [run]="r" [refreshKey]="key()" (changed)="reloadRun()" />
      @if (r.status === 'active') { <fl-run-register-member [run]="r" (changed)="refresh()" /> }
      <fl-run-forms [run]="r" [refreshKey]="key()" />
      <fl-run-settings [run]="r" (changed)="refresh()" />
      <fl-question-editor heading="แบบฟอร์มคำถามของรอบนี้" [questions]="r.questions" [locked]="r.structureLocked" [saver]="saveQuestions" (saved)="reloadRun()" />
      @if (r.status === 'active') {
        <section class="intake-section" aria-labelledby="cancel-run-heading"><h2 id="cancel-run-heading">ยกเลิกทั้งรอบ</h2>
          <p class="section-intro">ผู้ลงทะเบียนและผู้อยู่ในคิวรอทุกคนจะถูกยกเลิกและได้รับแจ้ง เรียกคืนไม่ได้</p>
          @if (!askCancel()) { <button type="button" class="button-secondary" (click)="askCancel.set(true)">ยกเลิกรอบนี้</button> }
          @else {
            <div class="intake-field"><label for="cr-reason">เหตุผลที่ยกเลิกรอบ</label><textarea id="cr-reason" name="reason" rows="2" [(ngModel)]="reason"></textarea></div>
            <div class="form-actions"><button class="button-danger" type="button" [disabled]="busy() || !reason.trim()" (click)="cancelRun()">ยืนยันยกเลิกทั้งรอบ</button><button class="button-secondary" type="button" (click)="askCancel.set(false)">ไม่ยกเลิก</button></div>
          }
        </section>
      }
      @if (session.user()?.role === 'admin') {
        <section class="intake-section"><h2>ลบรอบ</h2>
          <p class="section-intro">ลบได้เมื่อไม่มีผู้ลงทะเบียนที่ยังใช้งานอยู่ (ยกเลิกรอบก่อน) ประวัติการลงทะเบียนยังเก็บไว้</p>
          @if (!askDelete()) { <button type="button" class="button-secondary" (click)="askDelete.set(true)">ลบรอบนี้</button> }
          @else { <div class="form-actions"><button class="button-danger" type="button" [disabled]="busy()" (click)="remove()">ยืนยันลบรอบ</button><button class="button-secondary" type="button" (click)="askDelete.set(false)">ไม่ลบ</button></div> }
        </section>
      }
    }
  </main>`,
})
export class RunDetailComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  readonly session = inject(SessionService);
  readonly run = signal<RunRecord | null>(null);
  readonly course = signal<CourseDetail | null>(null);
  readonly key = signal(0);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly askCancel = signal(false);
  readonly askDelete = signal(false);
  readonly dateTime = thaiDateTime;
  reason = '';
  private id = '';
  readonly saveQuestions = async (questions: QuestionInput[]): Promise<void> => { await this.api.request(`/runs/${this.id}/questions`, 'PUT', { questions }); };
  async ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') ?? '';
    try {
      this.run.set(await this.api.request<RunRecord>(`/runs/${this.id}`));
      this.course.set(await this.api.request<CourseDetail>(`/courses/${this.run()!.courseId}`));
    } catch (e) { this.error.set(errorText(e)); } finally { this.loading.set(false); }
  }
  async reloadRun() { try { this.run.set(await this.api.request<RunRecord>(`/runs/${this.id}`)); } catch (e) { this.error.set(errorText(e)); } }
  async refresh() { await this.reloadRun(); this.key.update((k) => k + 1); }
  async cancelRun() {
    this.busy.set(true); this.error.set('');
    try { await this.api.request(`/runs/${this.id}/cancel`, 'POST', { reason: this.reason.trim() }); this.message.set('ยกเลิกรอบแล้ว และแจ้งผู้ลงทะเบียนทุกคนแล้ว'); this.askCancel.set(false); await this.refresh(); }
    catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
  async remove() {
    this.busy.set(true); this.error.set('');
    try { await this.api.request(`/runs/${this.id}`, 'DELETE'); history.back(); } catch (e) { this.error.set(errorText(e)); this.askDelete.set(false); } finally { this.busy.set(false); }
  }
}
