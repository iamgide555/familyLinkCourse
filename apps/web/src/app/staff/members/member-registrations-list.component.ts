import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import type { RegistrationView } from '../../../../../../packages/contracts/src/bookings';
import { ApiClient } from '../../core/api-client';
import { STATUS_WORD, errorText, shortDate } from '../../member/shared/thai';

@Component({
  selector: 'fl-member-registrations-list',
  imports: [RouterLink],
  template: `<section class="intake-section" aria-labelledby="mr-h">
    <h2 id="mr-h">คอร์สที่ลงทะเบียน</h2>
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    @if (!items().length && !error()) { <p class="empty-state">ยังไม่เคยลงทะเบียนคอร์ส</p> }
    <ul class="doc-list">
      @for (r of items(); track r.id) {
        <li><span><a [routerLink]="['/staff/runs', r.runId]"><strong>{{ r.courseName }} · {{ r.batchName }}</strong></a><br />
          <span class="record-state">@for (e of r.entries; track $index) { {{ e.sessionId ? 'วันที่ ' + e.dayNo + ' (' + date(e.date!) + ')' : 'ทั้งคอร์ส' }}: {{ word(e.status) }}{{ e.attendance ? ' · ' + (e.attendance === 'present' ? 'มาเรียน' : 'ไม่มา') : '' }}{{ $last ? '' : ' | ' }} }</span></span></li>
      }
    </ul>
  </section>`,
})
export class MemberRegistrationsListComponent implements OnInit {
  @Input({ required: true }) memberId!: string;
  private readonly api = inject(ApiClient);
  readonly items = signal<RegistrationView[]>([]);
  readonly error = signal('');
  readonly date = shortDate;
  word(s: string) { return STATUS_WORD[s] ?? s; }
  async ngOnInit() { try { this.items.set((await this.api.request<{ items: RegistrationView[] }>(`/members/${this.memberId}/registrations`)).items); } catch (e) { this.error.set(errorText(e)); } }
}
