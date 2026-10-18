import { Component, Input, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import type { DocumentReceipt } from '../../../../../../packages/contracts/src/documents';
import type { DocumentType, SettingsList } from '../../../../../../packages/contracts/src/settings';
import { ApiClient } from '../../core/api-client';
import { SessionService } from '../../core/session.service';
import { errorText, thaiDateTime } from '../../member/shared/thai';

@Component({
  selector: 'fl-member-documents',
  imports: [FormsModule],
  template: `<section class="intake-section" aria-labelledby="docs-heading">
    <h2 id="docs-heading">เอกสารของสมาชิก</h2>
    <p class="section-intro">เจ้าหน้าที่ส่งไฟล์เข้าระบบและดูสถานะการรับไฟล์ได้ แต่เปิดดูไฟล์ไม่ได้ เฉพาะผู้ดูแลระบบที่เปิดดู ตรวจสอบ และลบไฟล์ได้</p>
    @if (loading()) { <p role="status">กำลังโหลดเอกสาร…</p> }
    @else if (!items().length) { <p class="empty-state">ยังไม่มีเอกสารที่ส่งเข้าระบบ</p> }
    @else {
      <ul class="doc-list">
        @for (doc of items(); track doc.id) {
          <li>
            <span><strong>{{ typeName(doc) }}</strong> · {{ doc.mime === 'application/pdf' ? 'PDF' : 'รูปภาพ' }} · {{ dateTime(doc.createdAt) }}
              <span class="record-state"> · {{ doc.status === 'verified' ? 'ผู้ดูแลระบบตรวจสอบแล้ว' : 'ได้รับไฟล์แล้ว' }}</span></span>
            @if (isAdmin()) {
              <span class="doc-actions">
                <button class="button-secondary" type="button" (click)="open(doc)">เปิดดูไฟล์</button>
                @if (doc.status !== 'verified') { <button class="button-secondary" type="button" (click)="verify(doc)">ตรวจสอบแล้ว</button> }
                @if (confirming() === doc.id) {
                  <button class="button-danger" type="button" (click)="remove(doc)">ยืนยันลบ</button>
                  <button class="button-secondary" type="button" (click)="confirming.set('')">ไม่ลบ</button>
                } @else { <button class="button-secondary" type="button" (click)="confirming.set(doc.id)">ลบไฟล์</button> }
              </span>
            }
          </li>
        }
      </ul>
    }
    <form (ngSubmit)="upload()" novalidate class="doc-upload">
      <h3>ส่งไฟล์เข้าระบบ</h3>
      <div class="form-grid">
        <div class="intake-field">
          <label for="doc-type">ประเภทเอกสาร</label>
          <select id="doc-type" name="docType" [(ngModel)]="docType"><option value="">ไม่ระบุประเภท</option>@for (t of types(); track t.id) { <option [value]="t.id">{{ t.name }}</option> }</select>
        </div>
        <div class="intake-field">
          <label for="doc-file">เลือกไฟล์ (JPG, PNG, HEIC, PDF ไม่เกิน 10 MB)</label>
          <input id="doc-file" name="file" type="file" accept="image/jpeg,image/png,image/heic,application/pdf,.heic" (change)="pick($event)" />
        </div>
      </div>
      @if (isAdmin()) { <label class="choice"><input type="checkbox" name="signed" [(ngModel)]="signedScan" /> เป็นสแกนแบบฟอร์มที่ลงนามแล้ว</label> }
      <label class="choice"><input type="checkbox" name="paper" [(ngModel)]="paperConsent" /> ยืนยันว่าสมาชิกให้ความยินยอมให้เก็บเอกสารนี้แล้ว (ตามแบบฟอร์มกระดาษ)</label>
      <div class="form-actions"><button class="button-primary" type="submit" [disabled]="busy() || !file || !paperConsent">{{ busy() ? 'กำลังอัปโหลด…' : 'ส่งไฟล์เข้าระบบ' }}</button></div>
    </form>
    @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
  </section>`,
})
export class MemberDocumentsComponent implements OnInit {
  @Input({ required: true }) memberId!: string;
  private readonly api = inject(ApiClient);
  private readonly session = inject(SessionService);
  readonly items = signal<DocumentReceipt[]>([]);
  readonly types = signal<DocumentType[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly confirming = signal('');
  readonly dateTime = thaiDateTime;
  file: File | null = null;
  docType = '';
  signedScan = false;
  paperConsent = false;
  isAdmin() { return this.session.user()?.role === 'admin'; }
  typeName(doc: DocumentReceipt) {
    if (doc.kind === 'signed_form') return 'แบบฟอร์มที่ลงนามแล้ว (สแกน)';
    return this.types().find((t) => t.id === doc.documentTypeId)?.name ?? 'เอกสารอื่น ๆ';
  }
  async ngOnInit() {
    try {
      this.types.set((await this.api.request<SettingsList<DocumentType>>('/settings/document-types')).items.filter((t) => t.active));
    } catch { this.types.set([]); }
    await this.load();
  }
  async load() {
    this.loading.set(true);
    try { this.items.set((await this.api.request<{ items: DocumentReceipt[] }>(`/members/${this.memberId}/documents`)).items); }
    catch (e) { this.error.set(errorText(e)); } finally { this.loading.set(false); }
  }
  pick(event: Event) { this.file = (event.target as HTMLInputElement).files?.[0] ?? null; }
  async upload() {
    if (!this.file || this.busy()) return;
    if (this.file.size > 10_000_000) { this.error.set('ไฟล์ใหญ่เกิน 10 MB'); return; }
    this.busy.set(true); this.error.set(''); this.message.set('');
    try {
      await this.api.upload(`/members/${this.memberId}/documents`, this.file, {
        'x-paper-consent': this.paperConsent ? 'confirmed' : '',
        ...(this.docType ? { 'x-document-type-id': this.docType } : {}),
        ...(this.signedScan ? { 'x-document-kind': 'signed_form' } : {}),
      });
      this.message.set('ส่งไฟล์เข้าระบบแล้ว');
      this.file = null; this.paperConsent = false; this.signedScan = false;
      const input = document.getElementById('doc-file') as HTMLInputElement | null;
      if (input) input.value = '';
      await this.load();
    } catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
  async open(doc: DocumentReceipt) {
    this.error.set('');
    const tab = window.open('', '_blank');
    if (!tab) { this.error.set('เบราว์เซอร์ปิดกั้นหน้าต่างใหม่ กรุณาอนุญาตแล้วลองอีกครั้ง'); return; }
    tab.opener = null;
    try {
      const blob = await this.api.blob(`/documents/${doc.id}/content`);
      tab.location.href = URL.createObjectURL(blob);
    } catch (e) { tab.close(); this.error.set(errorText(e)); }
  }
  async verify(doc: DocumentReceipt) {
    try { await this.api.request(`/documents/${doc.id}/verify`, 'POST', {}); await this.load(); } catch (e) { this.error.set(errorText(e)); }
  }
  async remove(doc: DocumentReceipt) {
    try { await this.api.request(`/documents/${doc.id}`, 'DELETE'); this.confirming.set(''); await this.load(); } catch (e) { this.error.set(errorText(e)); }
  }
}
