import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { AnswerValue, Answers, QuestionDefinition } from '../../../../../packages/contracts/src/questions';

/** Renders a run's registration questions and writes answers into the object the parent passes in. */
@Component({
  selector: 'fl-question-form',
  imports: [FormsModule],
  template: `@for (q of questions; track q.id) {
    <div class="intake-field q-field">
      @if (q.type === 'single_choice' || q.type === 'checkboxes') {
        <fieldset>
          <legend class="q-label">{{ q.label }}{{ q.required ? '' : ' (ไม่บังคับ)' }}</legend>
          @if (q.sensitive) { <p class="field-hint">คำถามนี้เป็นข้อมูลอ่อนไหว เจ้าหน้าที่ของสมาคมเท่านั้นที่เห็นคำตอบ</p> }
          @for (o of q.options; track o.id) {
            <label class="choice">
              @if (q.type === 'single_choice') { <input type="radio" [name]="q.id" [checked]="answers[q.id] === o.id" (change)="set(q.id, o.id)" /> }
              @else { <input type="checkbox" [checked]="has(q.id, o.id)" (change)="toggle(q.id, o.id)" /> }
              {{ o.label }}
            </label>
          }
        </fieldset>
      } @else {
        <label [attr.for]="'q-' + q.id">{{ q.label }}{{ q.required ? '' : ' (ไม่บังคับ)' }}</label>
        @if (q.sensitive) { <p class="field-hint">คำถามนี้เป็นข้อมูลอ่อนไหว เจ้าหน้าที่ของสมาคมเท่านั้นที่เห็นคำตอบ</p> }
        @switch (q.type) {
          @case ('paragraph') { <textarea [id]="'q-' + q.id" rows="3" [name]="q.id" [ngModel]="text(q.id)" (ngModelChange)="set(q.id, $event)" [attr.aria-invalid]="!!errors[q.id]"></textarea> }
          @case ('date') { <input [id]="'q-' + q.id" type="date" [name]="q.id" [ngModel]="text(q.id)" (ngModelChange)="set(q.id, $event)" [attr.aria-invalid]="!!errors[q.id]" /> }
          @case ('dropdown') {
            <select [id]="'q-' + q.id" [name]="q.id" [ngModel]="text(q.id)" (ngModelChange)="set(q.id, $event)" [attr.aria-invalid]="!!errors[q.id]">
              <option value="">เลือกคำตอบ</option>@for (o of q.options; track o.id) { <option [value]="o.id">{{ o.label }}</option> }
            </select>
          }
          @default { <input [id]="'q-' + q.id" [name]="q.id" [ngModel]="text(q.id)" (ngModelChange)="set(q.id, $event)" maxlength="300" [attr.aria-invalid]="!!errors[q.id]" /> }
        }
      }
      @if (errors[q.id]) { <p class="field-error">{{ errors[q.id] }}</p> }
    </div>
  }`,
})
export class QuestionFormComponent {
  @Input({ required: true }) questions: QuestionDefinition[] = [];
  @Input({ required: true }) answers: Answers = {};
  @Input() errors: Record<string, string> = {};
  text(id: string): string { const v = this.answers[id]; return typeof v === 'string' ? v : ''; }
  has(id: string, option: string): boolean { const v = this.answers[id]; return Array.isArray(v) && v.includes(option); }
  set(id: string, value: AnswerValue): void { this.answers[id] = value; }
  toggle(id: string, option: string): void {
    const current = Array.isArray(this.answers[id]) ? (this.answers[id] as string[]) : [];
    this.answers[id] = current.includes(option) ? current.filter((x) => x !== option) : [...current, option];
  }
}
