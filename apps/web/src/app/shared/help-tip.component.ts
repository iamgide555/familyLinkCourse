import { Component, Input, signal } from '@angular/core';

/**
 * A small "i" button next to a field label. The explanation shows on hover, on keyboard focus and on tap, and the text
 * stays in the page so the field can point at it with aria-describedby (the field uses the same tipId).
 */
@Component({
  selector: 'fl-help-tip',
  template: `<span class="help-tip">
    <button type="button" class="help-btn" aria-label="ดูคำอธิบาย" [attr.aria-expanded]="open()" (click)="open.set(!open())" (keydown.escape)="open.set(false); $any($event.target).blur()" (blur)="open.set(false)">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="11" cy="11" r="9" /><path d="M11 10v5.2" /><path d="M11 6.6v.1" />
      </svg>
    </button>
    <span class="help-bubble" role="tooltip" [id]="tipId" [class.help-open]="open()">{{ text }}</span>
  </span>`,
})
export class HelpTipComponent {
  @Input({ required: true }) text!: string;
  @Input({ required: true }) tipId!: string;
  readonly open = signal(false);
}
