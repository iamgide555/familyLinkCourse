import { Component, EventEmitter, Input, OnInit, Output, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { LibraryQuestion, QuestionDefinition, QuestionInput, QuestionType } from '../../../../../packages/contracts/src/questions';
import { ApiClient } from '../core/api-client';
import { errorText } from '../member/shared/thai';

type Draft = { id: string | null; libraryQuestionId: string | null; label: string; type: QuestionType; options: Array<{ id?: string; label: string }>; required: boolean; sensitive: boolean; fixedType: boolean };
const TYPES: Array<{ value: QuestionType; label: string }> = [
  { value: 'short_text', label: 'ข้อความสั้น' }, { value: 'paragraph', label: 'ข้อความยาว' }, { value: 'single_choice', label: 'เลือกหนึ่งข้อ' },
  { value: 'dropdown', label: 'รายการเลือก (ดรอปดาวน์)' }, { value: 'checkboxes', label: 'เลือกได้หลายข้อ' }, { value: 'date', label: 'วันที่' },
];

/** Ordered question list editor shared by course defaults and run forms. */
@Component({
  selector: 'fl-question-editor',
  imports: [FormsModule],
  template: `<section class="intake-section" aria-labelledby="qe-heading">
    <h2 id="qe-heading">{{ heading }}</h2>
    <p class="section-intro">{{ intro }}</p>
    @if (locked) { <p class="notice">มีผู้ลงทะเบียนแล้ว แก้ถ้อยคำ เรียงลำดับ เพิ่มคำถามไม่บังคับ และเพิ่มตัวเลือกได้ แต่เปลี่ยนประเภท ลบ หรือเพิ่มคำถามบังคับตอบไม่ได้</p> }
    @for (d of drafts(); track $index; let i = $index) {
      <article class="q-draft" [attr.aria-label]="'แก้ไขคำถามข้อ ' + (i + 1)">
        <div class="form-grid">
          <div class="intake-field"><label [attr.for]="'ql-' + i">คำถามข้อ {{ i + 1 }}</label><input [id]="'ql-' + i" [name]="'ql-' + i" [(ngModel)]="d.label" maxlength="300" /></div>
          <div class="intake-field"><label [attr.for]="'qt-' + i">ประเภทคำตอบ</label>
            <select [id]="'qt-' + i" [name]="'qt-' + i" [(ngModel)]="d.type" [disabled]="locked && !!d.id"> @for (t of types; track t.value) { <option [value]="t.value">{{ t.label }}</option> }</select></div>
        </div>
        @if (hasOptions(d)) {
          <fieldset><legend class="q-label">ตัวเลือก</legend>
            @for (o of d.options; track $index; let j = $index) {
              <div class="option-row"><input [name]="'qo-' + i + '-' + j" [(ngModel)]="o.label" [attr.aria-label]="'ตัวเลือกที่ ' + (j + 1)" maxlength="150" />
                <button type="button" class="button-secondary" [disabled]="locked && !!o.id" (click)="d.options.splice(j, 1)">ลบ</button></div>
            }
            <button type="button" class="button-secondary" (click)="d.options.push({ label: '' })">เพิ่มตัวเลือก</button>
          </fieldset>
        }
        <label class="choice"><input type="checkbox" [name]="'qr-' + i" [(ngModel)]="d.required" [disabled]="locked && !d.id" /> ต้องตอบ</label>
        <label class="choice"><input type="checkbox" [name]="'qs-' + i" [(ngModel)]="d.sensitive" [disabled]="locked && !!d.id" /> เป็นข้อมูลอ่อนไหว (ถามเรื่องสุขภาพ ความพิการ หรือรายได้ ให้ติ๊ก)</label>
        <div class="form-actions">
          <button type="button" class="button-secondary" [disabled]="i === 0" (click)="move(i, -1)">เลื่อนขึ้น</button>
          <button type="button" class="button-secondary" [disabled]="i === drafts().length - 1" (click)="move(i, 1)">เลื่อนลง</button>
          <button type="button" class="button-secondary" [disabled]="locked && !!d.id" (click)="remove(i)">ลบคำถามนี้</button>
          @if (!d.libraryQuestionId && d.label.trim()) { <button type="button" class="button-secondary" (click)="saveToLibrary(d)">เก็บไว้ในคลังคำถาม</button> }
        </div>
      </article>
    }
    <div class="form-actions">
      <button type="button" class="button-secondary" (click)="add()">เพิ่มคำถามใหม่</button>
      @if (library().length) {
        <label class="sr-only" for="lib-pick">เลือกจากคลังคำถาม</label>
        <select id="lib-pick" name="lib" [ngModel]="''" (ngModelChange)="addFromLibrary($event)">
          <option value="">เพิ่มจากคลังคำถาม</option>@for (l of library(); track l.id) { <option [value]="l.id">{{ l.label }}</option> }
        </select>
      }
      <button type="button" class="button-primary" [disabled]="busy()" (click)="save()">{{ busy() ? 'กำลังบันทึก…' : 'บันทึกแบบฟอร์ม' }}</button>
    </div>
    @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
  </section>`,
})
export class QuestionEditorComponent implements OnInit {
  @Input() heading = 'แบบฟอร์มคำถามลงทะเบียน';
  @Input() intro = 'ข้อมูลมาตรฐานของสมาชิก (ชื่อ เบอร์โทร ฯลฯ) ดึงจากโปรไฟล์ให้อัตโนมัติ เพิ่มเฉพาะคำถามที่ต้องการถามเพิ่ม';
  @Input() set questions(value: QuestionDefinition[]) { this.initial = value; this.reset(); }
  @Input() locked = false;
  @Input({ required: true }) saver!: (questions: QuestionInput[]) => Promise<void>;
  @Output() saved = new EventEmitter<void>();
  private readonly api = inject(ApiClient);
  private initial: QuestionDefinition[] = [];
  readonly types = TYPES;
  readonly drafts = signal<Draft[]>([]);
  readonly library = signal<LibraryQuestion[]>([]);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  async ngOnInit() {
    try { this.library.set((await this.api.request<{ items: LibraryQuestion[] }>('/question-library')).items.filter((q) => q.active)); } catch { /* library is optional */ }
  }
  hasOptions(d: Draft) { return d.type === 'single_choice' || d.type === 'dropdown' || d.type === 'checkboxes'; }
  private reset() {
    this.drafts.set(this.initial.map((q) => ({ id: q.id, libraryQuestionId: null, label: q.label, type: q.type, options: q.options.map((o) => ({ ...o })), required: q.required, sensitive: q.sensitive, fixedType: false })));
  }
  add() { this.drafts.update((list) => [...list, { id: null, libraryQuestionId: null, label: '', type: 'short_text', options: [], required: false, sensitive: false, fixedType: false }]); }
  addFromLibrary(id: string) {
    const q = this.library().find((l) => l.id === id);
    if (!q) return;
    this.drafts.update((list) => [...list, { id: null, libraryQuestionId: q.id, label: q.label, type: q.type, options: q.options.map((o) => ({ label: o.label })), required: false, sensitive: q.sensitive, fixedType: false }]);
  }
  remove(i: number) { this.drafts.update((list) => list.filter((_, x) => x !== i)); }
  move(i: number, by: number) {
    this.drafts.update((list) => { const next = [...list]; const [item] = next.splice(i, 1); next.splice(i + by, 0, item!); return next; });
  }
  async saveToLibrary(d: Draft) {
    try {
      const made = await this.api.request<LibraryQuestion>('/question-library', 'POST', { label: d.label, type: d.type, options: d.options, sensitive: d.sensitive });
      d.libraryQuestionId = made.id;
      this.library.update((list) => [...list, made]);
      this.message.set('เก็บคำถามไว้ในคลังแล้ว');
    } catch (e) { this.error.set(errorText(e)); }
  }
  async save() {
    this.error.set(''); this.message.set('');
    this.busy.set(true);
    try {
      await this.saver(this.drafts().map((d) => ({ id: d.id, libraryQuestionId: d.libraryQuestionId, label: d.label, type: d.type, options: this.hasOptions(d) ? d.options : [], required: d.required, sensitive: d.sensitive })));
      this.message.set('บันทึกแบบฟอร์มแล้ว');
      this.saved.emit();
    } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
}
