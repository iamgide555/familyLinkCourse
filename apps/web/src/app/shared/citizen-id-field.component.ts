import { Component, Input } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HelpTipComponent } from './help-tip.component';
import type { CitizenIdModel } from './citizen-id';

/**
 * The ID number block used wherever a member is created: the number, or a tick box and a reason when the person has none.
 * It edits the model object it is given, so each form keeps its own state and sends the fields it already sends.
 */
@Component({
  selector: 'fl-citizen-id-field',
  imports: [FormsModule, HelpTipComponent],
  template: `<div class="intake-field id-field">
    <div class="label-row">
      <label [for]="prefix + 'citizenId'">เลขบัตรประชาชน</label>
      <span class="req-badge">จำเป็น</span>
      <fl-help-tip [tipId]="prefix + 'citizenId-hint'" text="เลข 13 หลักบนบัตรประชาชน ใช้ตรวจว่าเป็นคนเดียวกับสมาชิกเดิม และเก็บแบบเข้ารหัส หากไม่มีบัตร ให้ติ๊ก “ไม่มีเลขบัตรประชาชน” แล้วบอกเหตุผล" />
    </div>
    <input [id]="prefix + 'citizenId'" name="citizenId" inputmode="numeric" autocomplete="off" maxlength="17" required
      [(ngModel)]="model.citizenId" [disabled]="!!model.noCitizenId"
      [attr.aria-invalid]="errors['citizenId'] && !model.noCitizenId ? 'true' : null"
      [attr.aria-describedby]="errors['citizenId'] && !model.noCitizenId ? prefix + 'citizenId-error' : prefix + 'citizenId-hint'" />
    @if (errors['citizenId'] && !model.noCitizenId) { <p class="field-error" [id]="prefix + 'citizenId-error'">{{ errors['citizenId'] }}</p> }
    <label class="choice"><input type="checkbox" name="noCitizenId" [ngModel]="!!model.noCitizenId" (ngModelChange)="toggle($event)" /> ไม่มีเลขบัตรประชาชน</label>
    @if (model.noCitizenId) {
      <div class="intake-field">
        <label [for]="prefix + 'citizenIdMissingReason'">เหตุผลที่ไม่มีเลขบัตรประชาชน</label>
        <input [id]="prefix + 'citizenIdMissingReason'" name="citizenIdMissingReason" maxlength="500" autocomplete="off"
          [(ngModel)]="model.citizenIdMissingReason" [attr.aria-invalid]="errors['citizenIdMissingReason'] ? 'true' : null"
          [attr.aria-describedby]="errors['citizenIdMissingReason'] ? prefix + 'reason-error' : null" />
        @if (errors['citizenIdMissingReason']) { <p class="field-error" [id]="prefix + 'reason-error'">{{ errors['citizenIdMissingReason'] }}</p> }
      </div>
    }
  </div>`,
})
export class CitizenIdFieldComponent {
  @Input({ required: true }) model!: CitizenIdModel;
  @Input() errors: Record<string, string> = {};
  /** Keeps element ids unique when more than one form is on the page. */
  @Input() prefix = '';
  toggle(on: boolean) {
    this.model.noCitizenId = on;
    if (on) this.model.citizenId = '';
    else this.model.citizenIdMissingReason = '';
  }
}
