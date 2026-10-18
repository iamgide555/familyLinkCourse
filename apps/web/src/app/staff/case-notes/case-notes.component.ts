import { Component, Input, OnChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type {
  CaseNote,
  CaseNoteRevision,
} from '../../../../../../packages/contracts/src/case-notes';
import { ApiClient } from '../../core/api-client';
import { SessionService } from '../../core/session.service';

@Component({
  selector: 'app-case-notes',
  imports: [FormsModule],
  template: `
    <section class="case-notes" aria-labelledby="case-notes-heading">
      <div class="section-heading">
        <div>
          <h2 id="case-notes-heading">บันทึกเคส</h2>
          <p>เจ้าหน้าที่เท่านั้นที่อ่านบันทึกได้ ประวัติการแก้ไขจะถูกเก็บไว้ทุกฉบับ</p>
        </div>
      </div>

      @if (error()) {
        <p class="notice notice-error" role="alert">{{ error() }}</p>
      }
      @if (message()) {
        <p class="notice notice-success" role="status">{{ message() }}</p>
      }

      <form (ngSubmit)="create()" class="note-form">
        <label for="new-case-note">บันทึกเคสใหม่</label>
        <textarea
          id="new-case-note"
          name="newCaseNote"
          [(ngModel)]="draft"
          maxlength="10000"
          rows="4"
          [disabled]="pending()"
          required
        ></textarea>
        <div class="form-actions">
          <span>ข้อความนี้เป็นข้อมูลภายในสำหรับเจ้าหน้าที่</span>
          <button type="submit" class="button-primary" [disabled]="pending() || !draft.trim()">
            เพิ่มบันทึกเคส
          </button>
        </div>
      </form>

      @if (loading()) {
        <p role="status">กำลังโหลดบันทึกเคส…</p>
      } @else if (!notes().length) {
        <p class="empty-notes">ยังไม่มีบันทึกเคส</p>
      } @else {
        <ol class="note-list">
          @for (note of notes(); track note.id) {
            <li class="note-card">
              <div class="note-meta">
                <strong>{{ note.authorName }}</strong>
                <time [attr.datetime]="note.createdAt">{{ formatDate(note.createdAt) }}</time>
                @if (note.editedAt) {
                  <span>แก้ไขล่าสุด {{ formatDate(note.editedAt) }}</span>
                }
              </div>
              @if (editingId() === note.id) {
                <form (ngSubmit)="saveEdit(note)">
                  <label [for]="'edit-note-' + note.id">แก้ไขข้อความบันทึก</label>
                  <textarea
                    [id]="'edit-note-' + note.id"
                    [name]="'edit-note-' + note.id"
                    [(ngModel)]="editBody"
                    maxlength="10000"
                    rows="4"
                    [disabled]="pending()"
                    required
                  ></textarea>
                  <p class="edit-help">แก้ไขได้ภายใน 24 ชั่วโมงนับจากเวลาที่สร้างบันทึกครั้งแรก</p>
                  <div class="note-actions">
                    <button
                      type="submit"
                      class="button-primary"
                      [disabled]="pending() || !editBody.trim()"
                    >
                      บันทึกการแก้ไขบันทึก
                    </button>
                    <button type="button" class="button-secondary" (click)="editingId.set(null)">
                      ยกเลิก
                    </button>
                  </div>
                </form>
              } @else {
                <p class="note-body">{{ note.body }}</p>
                <div class="note-actions">
                  @if (canEdit(note)) {
                    <button type="button" class="button-secondary" (click)="startEdit(note)">
                      แก้ไขบันทึก
                    </button>
                  }
                  <button
                    type="button"
                    class="button-secondary"
                    (click)="toggleHistory(note)"
                    [attr.aria-expanded]="openHistoryId() === note.id"
                    [disabled]="pending()"
                  >
                    {{ openHistoryId() === note.id ? 'ซ่อนประวัติบันทึก' : 'ดูประวัติบันทึก' }}
                  </button>
                  @if (session.user()?.role === 'admin') {
                    <button
                      type="button"
                      class="button-danger"
                      (click)="remove(note)"
                      [disabled]="pending()"
                    >
                      ลบบันทึก
                    </button>
                  }
                </div>
              }
              @if (openHistoryId() === note.id) {
                <div class="revision-panel">
                  <h3>ประวัติบันทึก</h3>
                  @if (historyLoading()) {
                    <p role="status">กำลังโหลดประวัติ…</p>
                  } @else {
                    <ol class="revision-list">
                      @for (revision of revisions(); track revision.id) {
                        <li>
                          <div class="revision-meta">
                            <strong>ฉบับที่ {{ revision.version }}</strong>
                            <span
                              >{{ revision.createdByName }} ·
                              {{ formatDate(revision.createdAt) }}</span
                            >
                          </div>
                          <p class="note-body">{{ revision.body }}</p>
                        </li>
                      }
                    </ol>
                  }
                </div>
              }
            </li>
          }
        </ol>
      }
    </section>
  `,
  styles: [
    `
      .case-notes {
        margin: 2rem 0 0;
        padding: 1.5rem;
        border: 1px solid #d7e4df;
        border-radius: 1rem;
        background: #fff;
      }
      .section-heading h2 {
        margin: 0 0 0.35rem;
      }
      .section-heading p,
      .form-actions span,
      .edit-help,
      .note-meta,
      .revision-meta span {
        color: #52645d;
      }
      .section-heading p {
        margin: 0 0 1.25rem;
      }
      .note-form {
        padding: 1rem;
        border-radius: 0.75rem;
        background: #f3f8f5;
      }
      label {
        display: block;
        font-weight: 700;
        margin-bottom: 0.5rem;
      }
      textarea {
        display: block;
        width: 100%;
        min-height: 7rem;
        box-sizing: border-box;
        resize: vertical;
        padding: 0.75rem;
        border: 1px solid #a8bdb2;
        border-radius: 0.5rem;
        font: inherit;
        color: #173e2f;
        background: #fff;
      }
      textarea:focus-visible,
      button:focus-visible {
        outline: 3px solid #126c51;
        outline-offset: 2px;
      }
      .form-actions,
      .note-actions {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.75rem;
        margin-top: 0.75rem;
      }
      .form-actions {
        justify-content: space-between;
      }
      button {
        min-height: 44px;
        cursor: pointer;
      }
      button:disabled {
        cursor: not-allowed;
        opacity: 0.55;
      }
      .button-danger {
        border: 1px solid #9b312d;
        border-radius: 0.5rem;
        color: #8b2925;
        background: #fff;
        padding: 0.55rem 0.85rem;
        font: inherit;
        font-weight: 700;
      }
      .empty-notes {
        margin: 1.25rem 0 0;
      }
      .note-list,
      .revision-list {
        list-style: none;
        padding: 0;
        margin: 1.25rem 0 0;
      }
      .note-list {
        display: grid;
        gap: 1rem;
      }
      .note-card {
        border: 1px solid #dae6e0;
        border-radius: 0.75rem;
        padding: 1rem;
      }
      .note-meta,
      .revision-meta {
        display: flex;
        flex-wrap: wrap;
        gap: 0.35rem 0.75rem;
        align-items: baseline;
        font-size: 0.95rem;
      }
      .note-body {
        white-space: pre-wrap;
        overflow-wrap: anywhere;
        margin: 0.85rem 0;
      }
      .edit-help {
        margin: 0.5rem 0;
        font-size: 0.95rem;
      }
      .revision-panel {
        margin-top: 1rem;
        padding: 1rem;
        background: #f7faf8;
        border-radius: 0.6rem;
      }
      .revision-panel h3 {
        margin: 0;
        font-size: 1rem;
      }
      .revision-list {
        display: grid;
        gap: 0.75rem;
      }
      .revision-list li {
        border-top: 1px solid #d7e4df;
        padding-top: 0.75rem;
      }
      @media (max-width: 480px) {
        .case-notes {
          padding: 1rem;
        }
        .form-actions button,
        .note-actions button {
          width: 100%;
        }
      }
    `,
  ],
})
export class CaseNotesComponent implements OnChanges {
  @Input({ required: true }) memberId!: string;
  private readonly api = inject(ApiClient);
  readonly session = inject(SessionService);
  readonly notes = signal<CaseNote[]>([]);
  readonly revisions = signal<CaseNoteRevision[]>([]);
  readonly loading = signal(false);
  readonly historyLoading = signal(false);
  readonly pending = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly editingId = signal<string | null>(null);
  readonly openHistoryId = signal<string | null>(null);
  draft = '';
  editBody = '';
  private requestNumber = 0;

  ngOnChanges(): void {
    this.notes.set([]);
    this.revisions.set([]);
    this.openHistoryId.set(null);
    this.editingId.set(null);
    this.draft = '';
    this.error.set('');
    this.message.set('');
    if (this.memberId) void this.load();
  }

  async load(): Promise<void> {
    const requestNumber = ++this.requestNumber;
    const memberId = this.memberId;
    this.loading.set(true);
    try {
      const notes = await this.api.request<CaseNote[]>(`/members/${memberId}/case-notes`);
      if (requestNumber === this.requestNumber && memberId === this.memberId) this.notes.set(notes);
    } catch (error) {
      if (requestNumber === this.requestNumber) this.showError(error);
    } finally {
      if (requestNumber === this.requestNumber) this.loading.set(false);
    }
  }

  async create(): Promise<void> {
    if (!this.draft.trim() || this.pending()) return;
    this.pending.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await this.api.request(`/members/${this.memberId}/case-notes`, 'POST', { body: this.draft });
      this.draft = '';
      await this.load();
      this.message.set('เพิ่มบันทึกเคสแล้ว');
    } catch (error) {
      this.showError(error);
    } finally {
      this.pending.set(false);
    }
  }

  canEdit(note: CaseNote): boolean {
    return (
      note.authorId === this.session.user()?.id &&
      Date.now() - new Date(note.createdAt).getTime() < 24 * 60 * 60 * 1000
    );
  }

  startEdit(note: CaseNote): void {
    this.editingId.set(note.id);
    this.editBody = note.body;
    this.openHistoryId.set(null);
    this.error.set('');
  }

  async saveEdit(note: CaseNote): Promise<void> {
    if (!this.editBody.trim() || this.pending()) return;
    this.pending.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await this.api.request(`/case-notes/${note.id}`, 'PATCH', { body: this.editBody });
      this.editingId.set(null);
      await this.load();
      this.message.set('บันทึกการแก้ไขแล้ว');
    } catch (error) {
      this.showError(error);
    } finally {
      this.pending.set(false);
    }
  }

  async toggleHistory(note: CaseNote): Promise<void> {
    if (this.openHistoryId() === note.id) {
      this.openHistoryId.set(null);
      this.revisions.set([]);
      return;
    }
    this.openHistoryId.set(note.id);
    this.revisions.set([]);
    this.historyLoading.set(true);
    this.error.set('');
    try {
      const revisions = await this.api.request<CaseNoteRevision[]>(
        `/case-notes/${note.id}/history`,
      );
      if (this.openHistoryId() === note.id) this.revisions.set(revisions);
    } catch (error) {
      this.showError(error);
      this.openHistoryId.set(null);
    } finally {
      this.historyLoading.set(false);
    }
  }

  async remove(note: CaseNote): Promise<void> {
    if (this.pending() || !window.confirm('ลบบันทึกเคสนี้หรือไม่? ประวัติจะไม่แสดงในหน้าสมาชิกอีก'))
      return;
    this.pending.set(true);
    this.error.set('');
    this.message.set('');
    try {
      await this.api.request(`/case-notes/${note.id}`, 'DELETE');
      this.openHistoryId.set(null);
      this.revisions.set([]);
      await this.load();
      this.message.set('ลบบันทึกเคสแล้ว');
    } catch (error) {
      this.showError(error);
    } finally {
      this.pending.set(false);
    }
  }

  formatDate(value: string): string {
    return new Intl.DateTimeFormat('th-TH', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Bangkok',
    }).format(new Date(value));
  }

  private showError(error: unknown): void {
    this.error.set(error instanceof Error ? error.message : 'ยังทำรายการบันทึกเคสไม่ได้');
  }
}
