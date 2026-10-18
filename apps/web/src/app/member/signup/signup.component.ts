import { Component, ElementRef, Injector, OnInit, afterNextRender, inject, signal, viewChild } from '@angular/core';
import { HelpTipComponent } from '../../shared/help-tip.component';
import { CitizenIdFieldComponent } from '../../shared/citizen-id-field.component';
import { citizenIdProblems, normalizeCitizenId } from '../../shared/citizen-id';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiRequestError } from '../../core/api-client';
import { MemberApi, MemberSession } from '../../core/member-api';
import { MEMBER_TYPES, errorText } from '../shared/thai';
import type { ParticipantProfile } from '../../../../../../packages/contracts/src/members';
import type { DocumentReceipt } from '../../../../../../packages/contracts/src/documents';
import type { SignupResult } from '../../../../../../packages/contracts/src/signup';

type Options = { provinces: string[]; services: Array<{ id: string; name: string }>; documentTypes: Array<{ id: string; name: string }>; consentVersions: Record<string, string>; consentTexts: Record<'privacy' | 'sensitiveUpload' | 'news' | 'photo', { version: string; text: string }> };
type Draft = { draftId: string; draftToken: string };
const MAX_BYTES = 10_000_000;

@Component({
  selector: 'fl-member-signup',
  imports: [FormsModule, RouterLink, HelpTipComponent, CitizenIdFieldComponent],
  template: `<main id="main-content" class="member-workspace line-page">
    @if (result(); as done) {
      <div class="outcome" role="status" tabindex="-1" #outcome>
        @if (done.kind === 'pending') {
          <h1>ส่งข้อมูลแล้ว รอเจ้าหน้าที่ยืนยัน</h1>
          <p>เจ้าหน้าที่จะตรวจสอบข้อมูลของคุณและแจ้งผลทาง LINE หรืออีเมล ระหว่างนี้ยังลงทะเบียนคอร์สหรือเปิดโปรไฟล์ของผู้สมัครรายนี้ไม่ได้</p>
        } @else {
          <h1>สมัครสมาชิกเรียบร้อย</h1>
          <p>บันทึกข้อมูลของ {{ f.firstName }} {{ f.lastName }} แล้ว เจ้าหน้าที่จะขอข้อมูลที่เหลือและให้ลงนามในแบบฟอร์มกระดาษเมื่อมาที่สมาคม ระหว่างนี้ลงทะเบียนคอร์สได้ตามปกติ</p>
        }
        @if (hasIdentity()) {
          <a class="button-primary" routerLink="/member/profile">ไปที่โปรไฟล์</a>
        } @else {
          <p class="notice">หากต้องการลงทะเบียนคอร์สหรือดูโปรไฟล์ ให้เพิ่มเพื่อน LINE ของสมาคม FamilyLink แล้วเปิดเมนูจาก LINE ลิงก์นี้ใช้สมัครสมาชิกเท่านั้น</p>
        }
      </div>
    } @else if (loadError()) {
      <p role="alert" class="notice notice-error">{{ loadError() }}</p>
      <button class="button-secondary" type="button" (click)="init()">ลองอีกครั้ง</button>
    } @else if (!options()) {
      <p role="status">กำลังเตรียมแบบฟอร์ม…</p>
    } @else {
      <h1>{{ addAnother() ? 'เพิ่มสมาชิกในครอบครัว' : 'สมัครสมาชิก FamilyLink' }}</h1>
      <p class="page-intro">ใช้เวลาประมาณ 3 นาที เตรียมบัตรประชาชนไว้ เพราะต้องกรอกเลขบัตร 13 หลัก ต้องกรอกทุกช่อง ยกเว้นช่องที่เขียนว่า “ไม่บังคับ” ข้อมูลส่วนตัวอื่นเจ้าหน้าที่จะสอบถามเมื่อมาที่สมาคม</p>
      @if (summary().length) {
        <div class="notice notice-error" role="alert" tabindex="-1" #errors>
          <p><strong>กรุณาตรวจสอบข้อมูลต่อไปนี้</strong></p>
          <ul>@for (message of summary(); track message) { <li>{{ message }}</li> }</ul>
        </div>
      }
      <form (ngSubmit)="submit()" novalidate>
        <fieldset class="intake-section">
          <legend><h2>สมัครให้ใคร</h2></legend>
          <div class="choice-row">
            <label class="choice"><input type="radio" name="for" value="self" [(ngModel)]="f.registeringFor" /> สมัครให้ตัวเอง</label>
            <label class="choice"><input type="radio" name="for" value="another" [(ngModel)]="f.registeringFor" /> สมัครให้บุคคลในครอบครัวที่ดูแลอยู่</label>
          </div>
          @if (f.registeringFor === 'another') {
            <div class="intake-field">
              <label for="relationship">ท่านเป็นอะไรกับผู้สมัคร (เช่น มารดา บุตร ภรรยา)</label>
              <input id="relationship" name="relationship" [(ngModel)]="f.relationship" maxlength="80" [attr.aria-invalid]="!!err('relationship')" />
              @if (err('relationship')) { <p class="field-error">{{ err('relationship') }}</p> }
            </div>
            <div class="intake-field">
              <label for="filler">ชื่อ-นามสกุลของท่าน (ผู้กรอกแบบฟอร์ม)</label>
              <input id="filler" name="filler" [(ngModel)]="f.fillerName" maxlength="150" [attr.aria-invalid]="!!err('fillerName')" />
              @if (err('fillerName')) { <p class="field-error">{{ err('fillerName') }}</p> }
            </div>
            @if (caregivers().length > 1) {
              <div class="intake-field">
                <label for="caregiver">ผู้ดูแลที่เป็นสมาชิกอยู่แล้ว</label>
                <select id="caregiver" name="caregiver" [(ngModel)]="f.caregiverMemberId">
                  <option value="">ไม่ระบุ</option>
                  @for (m of caregivers(); track m.id) { <option [value]="m.id">{{ m.firstName }} {{ m.lastName }}</option> }
                </select>
              </div>
            }
          }
        </fieldset>

        <fieldset class="intake-section">
          <legend><h2>ข้อมูลผู้สมัคร</h2></legend>
          <div class="form-grid">
            <div class="intake-field">
              <label for="memberType">ประเภทสมาชิก</label>
              <select id="memberType" name="memberType" [(ngModel)]="f.memberType" [attr.aria-invalid]="!!err('memberType')">
                <option value="">เลือกประเภท</option>
                @for (t of types; track t.value) { <option [value]="t.value">{{ t.label }}</option> }
              </select>
              @if (err('memberType')) { <p class="field-error">{{ err('memberType') }}</p> }
            </div>
            <div class="intake-field">
              <label for="birthDate">วันเกิด</label>
              <input id="birthDate" name="birthDate" type="date" [max]="today" [(ngModel)]="f.birthDate" [attr.aria-invalid]="!!err('birthDate')" />
              @if (err('birthDate')) { <p class="field-error">{{ err('birthDate') }}</p> }
            </div>
            <div class="intake-field">
              <label for="firstName">ชื่อ</label>
              <input id="firstName" name="firstName" autocomplete="given-name" [(ngModel)]="f.firstName" maxlength="100" [attr.aria-invalid]="!!err('firstName')" />
              @if (err('firstName')) { <p class="field-error">{{ err('firstName') }}</p> }
            </div>
            <div class="intake-field">
              <label for="lastName">นามสกุล</label>
              <input id="lastName" name="lastName" autocomplete="family-name" [(ngModel)]="f.lastName" maxlength="100" [attr.aria-invalid]="!!err('lastName')" />
              @if (err('lastName')) { <p class="field-error">{{ err('lastName') }}</p> }
            </div>
            <div class="intake-field">
              <div class="label-row"><label for="phone">เบอร์มือถือ</label><fl-help-tip tipId="phone-hint" text="เช่น 0812345678" /></div>
              <input id="phone" name="phoneMobile" type="tel" inputmode="numeric" autocomplete="tel" [(ngModel)]="f.phoneMobile" maxlength="12" [attr.aria-invalid]="!!err('phoneMobile')" aria-describedby="phone-hint" />
              @if (err('phoneMobile')) { <p class="field-error">{{ err('phoneMobile') }}</p> }
            </div>
            <div class="intake-field">
              <label for="email">อีเมล (ไม่บังคับ)</label>
              <input id="email" name="email" type="email" autocomplete="email" [(ngModel)]="f.email" maxlength="150" [attr.aria-invalid]="!!err('email')" />
              @if (err('email')) { <p class="field-error">{{ err('email') }}</p> }
            </div>
            <fl-citizen-id-field [model]="f" [errors]="errors()" />
            <div class="intake-field">
              <label for="province">จังหวัด</label>
              <select id="province" name="provinceId" [ngModel]="f.provinceId" (ngModelChange)="pickProvince($event)" [attr.aria-invalid]="!!err('provinceId')">
                <option value="">เลือกจังหวัด</option>
                @for (p of options()!.provinces; track p) { <option [value]="p">{{ p }}</option> }
              </select>
              @if (err('provinceId')) { <p class="field-error">{{ err('provinceId') }}</p> }
            </div>
            <div class="intake-field">
              <label for="district">อำเภอ / เขต</label>
              <select id="district" name="districtId" [(ngModel)]="f.districtId" [disabled]="!districts().length" [attr.aria-invalid]="!!err('districtId')">
                <option value="">{{ f.provinceId ? 'เลือกอำเภอ / เขต' : 'เลือกจังหวัดก่อน' }}</option>
                @for (d of districts(); track d) { <option [value]="d">{{ d }}</option> }
              </select>
              @if (err('districtId')) { <p class="field-error">{{ err('districtId') }}</p> }
            </div>
          </div>
        </fieldset>

        <fieldset class="intake-section" [attr.aria-describedby]="'services-hint'">
          <legend><h2>บริการที่ต้องการ</h2></legend>
          <p id="services-hint" class="section-intro">เลือกอย่างน้อย 1 อย่าง</p>
          @if (!options()!.services.length) { <p class="notice">สมาคมยังไม่ได้ตั้งค่ารายการบริการ กรุณาแจ้งเจ้าหน้าที่</p> }
          <div class="choice-list-plain">
            @for (s of options()!.services; track s.id) {
              <label class="choice"><input type="checkbox" [checked]="f.requestedServiceIds.includes(s.id)" (change)="toggleService(s.id)" /> {{ s.name }}</label>
            }
          </div>
          @if (err('requestedServiceIds')) { <p class="field-error">{{ err('requestedServiceIds') }}</p> }
        </fieldset>

        <fieldset class="intake-section">
          <legend><h2>แนบเอกสาร (ไม่บังคับ)</h2></legend>
          @if (!attach()) {
            <p class="section-intro">สามารถแนบสำเนาบัตรหรือเอกสารอื่นได้ ถ้าไม่สะดวก เจ้าหน้าที่จะขอดูที่สมาคม</p>
            <button type="button" class="button-secondary" (click)="attach.set(true)">ต้องการแนบเอกสาร</button>
          } @else {
            <p class="section-intro">เอกสารที่แนบอาจมีข้อมูลที่ละเอียดอ่อน เช่น เลขบัตรประชาชนหรือข้อมูลสุขภาพ เราจึงขอความยินยอมก่อนรับไฟล์ทุกครั้ง และเฉพาะผู้ดูแลระบบของสมาคมเท่านั้นที่เปิดดูไฟล์ได้</p>
            <label class="choice"><input type="checkbox" name="uploadConsent" [(ngModel)]="uploadConsent" [disabled]="uploaded().length > 0" /> {{ options()!.consentTexts.sensitiveUpload.text }}</label>
            @if (uploadConsent) {
              <div class="intake-field">
                <label for="docType">ประเภทเอกสาร</label>
                <select id="docType" name="docType" [(ngModel)]="docType">
                  <option value="">ไม่ระบุประเภท</option>
                  @for (t of options()!.documentTypes; track t.id) { <option [value]="t.id">{{ t.name }}</option> }
                </select>
              </div>
              <div class="intake-field">
                <label for="docFile">เลือกไฟล์ (JPG, PNG, HEIC หรือ PDF ไม่เกิน 10 MB)</label>
                <input id="docFile" type="file" accept="image/jpeg,image/png,image/heic,application/pdf,.heic" [disabled]="uploading() || uploaded().length >= 5" (change)="upload($event)" />
              </div>
              @if (uploading()) { <p role="status">กำลังอัปโหลดเอกสาร…</p> }
              @if (uploadError()) { <p class="field-error" role="alert">{{ uploadError() }}</p> }
            }
            @if (uploaded().length) {
              <ul class="plain-list" aria-label="เอกสารที่แนบแล้ว">
                @for (doc of uploaded(); track doc.id) { <li>แนบแล้ว: {{ doc.mime === 'application/pdf' ? 'ไฟล์ PDF' : 'รูปภาพ' }} ({{ kb(doc.size) }})</li> }
              </ul>
            }
          }
        </fieldset>

        <fieldset class="intake-section">
          <legend><h2>ความยินยอม</h2></legend>
          <label class="choice"><input type="checkbox" name="privacy" [(ngModel)]="f.privacy" [attr.aria-invalid]="!!err('privacyConsent')" /> {{ options()!.consentTexts.privacy.text }}</label>
          @if (err('privacyConsent')) { <p class="field-error">{{ err('privacyConsent') }}</p> }
          <label class="choice"><input type="checkbox" name="news" [(ngModel)]="f.news" /> {{ options()!.consentTexts.news.text }}</label>
          <label class="choice"><input type="checkbox" name="photo" [(ngModel)]="f.photo" /> {{ options()!.consentTexts.photo.text }}</label>
        </fieldset>

        <div class="form-actions">
          <button class="button-primary" type="submit" [disabled]="submitting() || uploading()">{{ submitting() ? 'กำลังส่งข้อมูล…' : 'ส่งใบสมัคร' }}</button>
          @if (hasIdentity()) { <a class="button-secondary" routerLink="/member/profile">ยกเลิก</a> }
        </div>
      </form>
    }
  </main>`,
})
export class SignupComponent implements OnInit {
  private readonly api = inject(MemberApi);
  private readonly route = inject(ActivatedRoute);
  readonly session = inject(MemberSession);
  private readonly injector = inject(Injector);
  readonly errorsBox = viewChild<ElementRef<HTMLElement>>('errors');
  readonly outcomeBox = viewChild<ElementRef<HTMLElement>>('outcome');
  readonly types = MEMBER_TYPES;
  readonly today = new Date().toISOString().slice(0, 10);
  readonly options = signal<Options | null>(null);
  readonly districts = signal<string[]>([]);
  readonly loadError = signal('');
  readonly result = signal<SignupResult | null>(null);
  readonly submitting = signal(false);
  readonly errors = signal<Record<string, string>>({});
  readonly summary = signal<string[]>([]);
  readonly caregivers = signal<ParticipantProfile[]>([]);
  readonly attach = signal(false);
  readonly uploading = signal(false);
  readonly uploadError = signal('');
  readonly uploaded = signal<DocumentReceipt[]>([]);
  readonly addAnother = signal(false);
  private token = '';
  private draft: Draft | null = null;
  private consentGranted = false;
  uploadConsent = false;
  docType = '';
  f = {
    registeringFor: 'self' as 'self' | 'another', relationship: '', fillerName: '', caregiverMemberId: '',
    memberType: '', firstName: '', lastName: '', birthDate: '', phoneMobile: '', email: '', citizenId: '', noCitizenId: false, citizenIdMissingReason: '',
    provinceId: '', districtId: '', requestedServiceIds: [] as string[], privacy: false, news: false, photo: false,
  };
  hasIdentity() { return this.session.signedIn; }
  err(key: string) { return this.errors()[key] ?? ''; }
  kb(size: number) { return size > 1_000_000 ? `${(size / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1000))} KB`; }
  ngOnInit() { void this.init(); }
  async init() {
    this.loadError.set('');
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    this.addAnother.set(this.route.snapshot.queryParamMap.get('for') === 'another');
    if (this.addAnother()) this.f.registeringFor = 'another';
    try {
      const options = await this.api.request<Options>('/signup/options');
      let prefill: { firstName?: string; lastName?: string; phoneMobile?: string } = {};
      if (this.token) {
        const context = await this.api.request<{ mode: string; prefill: typeof prefill }>(`/invites/${encodeURIComponent(this.token)}/context`);
        if (context.mode !== 'signup') throw new ApiRequestError(409, 'INVITE_UNAVAILABLE', 'ลิงก์นี้ไม่ใช่ลิงก์สมัครสมาชิก');
        prefill = context.prefill;
      } else if (!this.session.signedIn) {
        throw new ApiRequestError(401, 'INVITE_REQUIRED', this.session.devMode ? 'ยังไม่ได้เลือกบัญชี LINE จำลอง กรุณาเลือกที่หน้า “เปลี่ยนบัญชีจำลอง”' : 'กรุณาเปิดจากเมนูใน LINE หรือใช้ลิงก์ที่เจ้าหน้าที่ส่งให้');
      }
      let members: ParticipantProfile[] = [];
      if (this.session.signedIn && !this.token) members = (await this.api.request<{ members: ParticipantProfile[] }>('/me').catch(() => ({ members: [] as ParticipantProfile[] }))).members;
      // Plain form fields are filled before any signal changes so the first render already shows them.
      Object.assign(this.f, { firstName: prefill.firstName ?? '', lastName: prefill.lastName ?? '', phoneMobile: prefill.phoneMobile ?? '' });
      if (members.length === 1) this.f.caregiverMemberId = members[0]!.id;
      this.caregivers.set(members);
      this.options.set(options);
    } catch (error) {
      this.loadError.set(errorText(error, 'เปิดแบบฟอร์มไม่สำเร็จ'));
    }
  }
  async pickProvince(province: string) {
    this.f.provinceId = province;
    this.f.districtId = '';
    this.districts.set([]);
    if (!province) return;
    try { this.districts.set((await this.api.request<{ districts: string[] }>(`/signup/districts/${encodeURIComponent(province)}`)).districts); } catch { this.districts.set([]); }
  }
  toggleService(id: string) {
    this.f.requestedServiceIds = this.f.requestedServiceIds.includes(id) ? this.f.requestedServiceIds.filter((x) => x !== id) : [...this.f.requestedServiceIds, id];
  }
  private invite(): Record<string, string> { return this.token ? { 'x-invite-token': this.token } : {}; }
  async upload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.uploadError.set('');
    if (file.size > MAX_BYTES) { this.uploadError.set('ไฟล์ใหญ่เกิน 10 MB กรุณาเลือกไฟล์ที่เล็กลง'); return; }
    if (!this.uploadConsent) { this.uploadError.set('กรุณาติ๊กยินยอมก่อนแนบเอกสาร'); return; }
    this.uploading.set(true);
    try {
      if (!this.draft) this.draft = await this.api.request<Draft>('/documents/drafts', 'POST', this.token ? { inviteToken: this.token } : {});
      if (!this.consentGranted) {
        await this.api.request(`/documents/drafts/${this.draft.draftId}/consent`, 'POST', {
          draftToken: this.draft.draftToken, ...(this.token ? { inviteToken: this.token } : {}), consent: this.consent('sensitive'),
        });
        this.consentGranted = true;
      }
      const receipt = await this.api.request<DocumentReceipt>(`/documents/drafts/${this.draft.draftId}/files`, 'POST', undefined,
        { 'x-draft-token': this.draft.draftToken, ...(this.docType ? { 'x-document-type-id': this.docType } : {}), ...this.invite() }, file);
      this.uploaded.update((list) => [...list, receipt]);
    } catch (error) {
      this.uploadError.set(errorText(error, 'อัปโหลดไม่สำเร็จ กรุณาลองอีกครั้ง'));
    } finally {
      this.uploading.set(false);
    }
  }
  private consent(kind: 'privacy' | 'sensitive' | 'news' | 'photo') {
    const versions = this.options()!.consentVersions;
    const version = versions[kind === 'sensitive' ? 'sensitiveUpload' : kind] ?? 'poc';
    return this.f.registeringFor === 'self'
      ? { version, consentedBy: 'self' as const, granted: true }
      : { version, consentedBy: 'caregiver' as const, granted: true, guardianName: this.f.fillerName.trim(), guardianRelationship: this.f.relationship.trim() };
  }
  private check(): Record<string, string> {
    const e: Record<string, string> = {};
    const f = this.f;
    if (!f.memberType) e['memberType'] = 'กรุณาเลือกประเภทสมาชิก';
    if (!f.firstName.trim()) e['firstName'] = 'กรุณากรอกชื่อ';
    if (!f.lastName.trim()) e['lastName'] = 'กรุณากรอกนามสกุล';
    if (!f.birthDate) e['birthDate'] = 'กรุณาเลือกวันเกิด';
    if (!/^0[689]\d{8}$/.test(f.phoneMobile.replace(/[\s-]/g, ''))) e['phoneMobile'] = 'กรุณากรอกเบอร์มือถือ 10 หลัก เช่น 0812345678';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e['email'] = 'กรุณาตรวจสอบอีเมล';
    Object.assign(e, citizenIdProblems(f, true));
    if (!f.provinceId) e['provinceId'] = 'กรุณาเลือกจังหวัด';
    if (!f.districtId) e['districtId'] = 'กรุณาเลือกอำเภอ / เขต';
    if (!f.requestedServiceIds.length) e['requestedServiceIds'] = 'กรุณาเลือกบริการอย่างน้อย 1 อย่าง';
    if (f.registeringFor === 'another') {
      if (!f.relationship.trim()) e['relationship'] = 'กรุณาระบุความสัมพันธ์';
      if (!f.fillerName.trim()) e['fillerName'] = 'กรุณากรอกชื่อ-นามสกุลของท่าน';
    }
    if (!f.privacy) e['privacyConsent'] = 'กรุณารับทราบประกาศความเป็นส่วนตัวก่อนส่งใบสมัคร';
    return e;
  }
  private show(errors: Record<string, string>) {
    this.errors.set(errors);
    this.summary.set([...new Set(Object.values(errors))]);
    afterNextRender(() => this.errorsBox()?.nativeElement.focus(), { injector: this.injector });
  }
  async submit() {
    if (this.submitting()) return;
    const errors = this.check();
    if (Object.keys(errors).length) { this.show(errors); return; }
    this.show({});
    this.submitting.set(true);
    const f = this.f;
    const body: Record<string, unknown> = {
      ...(this.token ? { inviteToken: this.token } : {}),
      firstName: f.firstName.trim(), lastName: f.lastName.trim(), birthDate: f.birthDate, phoneMobile: f.phoneMobile.replace(/[\s-]/g, ''),
      ...(f.email.trim() ? { email: f.email.trim() } : {}),
      ...(f.noCitizenId ? { noCitizenId: true, citizenIdMissingReason: f.citizenIdMissingReason.trim() } : { citizenId: normalizeCitizenId(f.citizenId) }),
      memberType: f.memberType, provinceId: f.provinceId, districtId: f.districtId,
      requestedServiceIds: f.requestedServiceIds, registeringFor: f.registeringFor,
      ...(f.registeringFor === 'another' ? { relationship: f.relationship.trim() } : {}),
      ...(f.registeringFor === 'another' && f.caregiverMemberId && !this.token ? { caregiverMemberId: f.caregiverMemberId } : {}),
      privacyConsent: this.consent('privacy'),
      ...(f.news ? { newsConsent: this.consent('news') } : {}), ...(f.photo ? { photoConsent: this.consent('photo') } : {}),
      ...(this.draft && this.uploaded().length ? { draftId: this.draft.draftId, draftToken: this.draft.draftToken } : {}),
    };
    try {
      const result = await this.api.request<SignupResult>('/signup', 'POST', body);
      this.result.set(result);
      afterNextRender(() => this.outcomeBox()?.nativeElement.focus(), { injector: this.injector });
    } catch (error) {
      const fields = error instanceof ApiRequestError ? error.fields : undefined;
      this.show({ ...(fields ?? {}), ...(fields ? {} : { form: errorText(error) }) });
    } finally {
      this.submitting.set(false);
    }
  }
}
