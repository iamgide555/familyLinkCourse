import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiRequestError } from '../../core/api-client';
import { MemberApi, MemberSession } from '../../core/member-api';
import { MEMBER_TYPES, errorText, memberTypeLabel, thaiDate, thaiDateTime } from '../shared/thai';
import type { ParticipantProfile } from '../../../../../../packages/contracts/src/members';
import type { EditableProfileField, ProfileChangeView } from '../../../../../../packages/contracts/src/profile';

type Me = { members: ParticipantProfile[]; pending: Array<{ requestId: string; status: string; createdAt: string }> };
type Options = { provinces: string[]; services: Array<{ id: string; name: string }> };
const FIELD_LABEL: Record<EditableProfileField, string> = {
  firstName: 'ชื่อ', lastName: 'นามสกุล', birthDate: 'วันเกิด', phoneMobile: 'เบอร์มือถือ', email: 'อีเมล',
  provinceId: 'จังหวัด', districtId: 'อำเภอ / เขต', memberType: 'ประเภทสมาชิก', requestedServiceIds: 'บริการที่ต้องการ',
};

@Component({
  selector: 'fl-member-profile-page',
  imports: [FormsModule, RouterLink],
  template: `<main id="main-content" class="member-workspace line-page">
    @if (loading()) {
      <p role="status">กำลังเปิดข้อมูล…</p>
    } @else if (error()) {
      <p class="notice notice-error" role="alert">{{ error() }}</p>
      @if (needsIdentity()) {
        @if (session.devMode) { <a class="button-primary" routerLink="/member/dev">เลือกบัญชี LINE จำลอง</a> }
      } @else { <button class="button-secondary" type="button" (click)="load()">ลองอีกครั้ง</button> }
    } @else if (me(); as data) {
      @if (!data.members.length) {
        @if (data.pending.length) {
          <h1>ส่งข้อมูลแล้ว รอเจ้าหน้าที่ยืนยัน</h1>
          <p>เจ้าหน้าที่กำลังตรวจสอบใบสมัครของคุณ เมื่อเสร็จแล้วระบบจะแจ้งผลทาง LINE หรืออีเมล และโปรไฟล์จะปรากฏที่หน้านี้</p>
          <p class="record-state">ส่งเมื่อ {{ dateTime(data.pending[0]!.createdAt) }}</p>
        } @else {
          <h1>ยินดีต้อนรับสู่ FamilyLink</h1>
          <p class="page-intro">บัญชี LINE นี้ยังไม่มีสมาชิก สมัครสมาชิกได้ใน 2 นาที</p>
          <a class="button-primary" routerLink="/member/signup">สมัครสมาชิก</a>
        }
      } @else {
        @if (data.pending.length) {
          <p class="notice" role="status">มีใบสมัครอีก {{ data.pending.length }} รายการที่รอเจ้าหน้าที่ยืนยัน สมาชิกที่เชื่อมแล้วใช้งานได้ตามปกติ</p>
        }
        @if (data.members.length > 1) {
          <div role="radiogroup" aria-label="เลือกสมาชิก" class="switcher">
            @for (m of data.members; track m.id) {
              <button type="button" role="radio" [attr.aria-checked]="m.id === selected()?.id" [class.switch-on]="m.id === selected()?.id" (click)="select(m.id)">{{ m.firstName }}</button>
            }
          </div>
        }
        @if (selected(); as m) {
          @if (flash()) { <p class="notice notice-success" role="status">{{ flash() }}</p> }
          <h1>{{ m.firstName }} {{ m.lastName }}</h1>
          <div class="profile-status">
            <span>{{ m.completeness === 'incomplete' ? 'ข้อมูลไม่ครบ' : 'ข้อมูลครบ' }}</span>
            <span>{{ m.signedFormAt ? 'ได้รับเอกสารลงนามแล้ว' : 'ยังไม่ได้ลงนาม' }}</span>
          </div>
          @if (!m.signedFormAt) { <p class="field-hint">เจ้าหน้าที่จะให้ลงนามในแบบฟอร์มกระดาษเมื่อท่านมาที่สมาคม ลงทะเบียนคอร์สก่อนได้</p> }
          @if (!editing()) {
            <dl class="profile-fields">
              <div><dt>วันเกิด</dt><dd>{{ date(m.birthDate) }}</dd></div>
              <div><dt>เบอร์มือถือ</dt><dd>{{ m.phoneMobile }}</dd></div>
              <div><dt>อีเมล</dt><dd>{{ m.email || 'ยังไม่ระบุ' }}</dd></div>
              <div><dt>สมาชิกภาพ</dt><dd>{{ membershipText(m) }}</dd></div>
              <div><dt>ประเภทสมาชิก</dt><dd>{{ typeLabel(m.memberType) }}</dd></div>
              <div><dt>จังหวัด / อำเภอ</dt><dd>{{ m.provinceId || 'ยังไม่ระบุ' }} / {{ m.districtId || 'ยังไม่ระบุ' }}</dd></div>
              <div class="full-width"><dt>บริการที่ต้องการ</dt><dd>{{ serviceNames(m) }}</dd></div>
            </dl>
            @for (req of requests(); track req.id) {
              @if (req.status === 'pending') {
                <p class="notice" role="status">ส่งคำขอแก้ไข ({{ fieldNames(req) }}) แล้ว รอเจ้าหน้าที่อนุมัติ</p>
              }
            }
            <div class="form-actions">
              @if (!hasPending()) { <button class="button-primary" type="button" (click)="startEdit(m)">ขอแก้ไขข้อมูล</button> }
              <a class="button-secondary" routerLink="/member/signup" [queryParams]="{ for: 'another' }">เพิ่มสมาชิก</a>
              <p>ข้อมูลอื่น เช่น เลขบัตรประชาชน หรือข้อมูลครัวเรือน ให้ติดต่อเจ้าหน้าที่เพื่อแก้ไข</p>
            </div>
            <section class="intake-section">
              <h2>เอาสมาชิกคนนี้ออกจากรายการของฉัน</h2>
              <p class="section-intro">การเอาออกจะตัดสิทธิ์ของบัญชี LINE นี้เท่านั้น ข้อมูลสมาชิกยังอยู่ที่สมาคม และเจ้าหน้าที่จะเป็นผู้เชื่อมต่อให้ผู้ดูแลคนใหม่</p>
              @if (!confirmRemove()) {
                <button class="button-secondary" type="button" (click)="confirmRemove.set(true)">เอาออกจากรายการของฉัน</button>
              } @else {
                <p class="notice notice-error" role="alert">ยืนยันเอา {{ m.firstName }} ออกจากรายการของคุณ?</p>
                <div class="form-actions">
                  <button class="button-danger" type="button" [disabled]="busy()" (click)="remove(m)">ยืนยันเอาออก</button>
                  <button class="button-secondary" type="button" (click)="confirmRemove.set(false)">ไม่เอาออก</button>
                </div>
              }
            </section>
          } @else {
            <form (ngSubmit)="saveEdit(m)" novalidate>
              @if (editErrors().length) {
                <div class="notice notice-error" role="alert"><ul>@for (message of editErrors(); track message) { <li>{{ message }}</li> }</ul></div>
              }
              <div class="form-grid">
                <div class="intake-field"><label for="e-first">ชื่อ</label><input id="e-first" name="firstName" [(ngModel)]="form.firstName" /></div>
                <div class="intake-field"><label for="e-last">นามสกุล</label><input id="e-last" name="lastName" [(ngModel)]="form.lastName" /></div>
                <div class="intake-field"><label for="e-birth">วันเกิด</label><input id="e-birth" name="birthDate" type="date" [(ngModel)]="form.birthDate" /></div>
                <div class="intake-field"><label for="e-phone">เบอร์มือถือ</label><input id="e-phone" name="phoneMobile" type="tel" inputmode="numeric" [(ngModel)]="form.phoneMobile" /></div>
                <div class="intake-field"><label for="e-mail">อีเมล</label><input id="e-mail" name="email" type="email" [(ngModel)]="form.email" /></div>
                <div class="intake-field"><label for="e-type">ประเภทสมาชิก</label>
                  <select id="e-type" name="memberType" [(ngModel)]="form.memberType">@for (t of types; track t.value) { <option [value]="t.value">{{ t.label }}</option> }</select></div>
                <div class="intake-field"><label for="e-prov">จังหวัด</label>
                  <select id="e-prov" name="provinceId" [ngModel]="form.provinceId" (ngModelChange)="pickProvince($event)">@for (p of options()?.provinces ?? []; track p) { <option [value]="p">{{ p }}</option> }</select></div>
                <div class="intake-field"><label for="e-dist">อำเภอ / เขต</label>
                  <select id="e-dist" name="districtId" [(ngModel)]="form.districtId">@for (d of districts(); track d) { <option [value]="d">{{ d }}</option> }</select></div>
              </div>
              <fieldset class="intake-section"><legend><h2>บริการที่ต้องการ</h2></legend>
                <div class="choice-list-plain">@for (s of options()?.services ?? []; track s.id) {
                  <label class="choice"><input type="checkbox" [checked]="form.requestedServiceIds.includes(s.id)" (change)="toggleService(s.id)" /> {{ s.name }}</label> }</div>
              </fieldset>
              <p class="field-hint">การแก้ไขจะมีผลหลังเจ้าหน้าที่อนุมัติ ข้อมูลเดิมยังใช้อยู่จนกว่าจะอนุมัติ</p>
              <div class="form-actions">
                <button class="button-primary" type="submit" [disabled]="busy()">{{ busy() ? 'กำลังส่ง…' : 'ส่งคำขอแก้ไข' }}</button>
                <button class="button-secondary" type="button" (click)="editing.set(false)">ยกเลิก</button>
              </div>
            </form>
          }
        }
      }
    }
  </main>`,
})
export class MemberProfilePageComponent implements OnInit {
  private readonly api = inject(MemberApi);
  private readonly route = inject(ActivatedRoute);
  readonly session = inject(MemberSession);
  readonly types = MEMBER_TYPES;
  readonly me = signal<Me | null>(null);
  readonly options = signal<Options | null>(null);
  readonly districts = signal<string[]>([]);
  readonly selectedId = signal('');
  readonly requests = signal<ProfileChangeView[]>([]);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly needsIdentity = signal(false);
  readonly editing = signal(false);
  readonly confirmRemove = signal(false);
  readonly busy = signal(false);
  readonly flash = signal('');
  readonly editErrors = signal<string[]>([]);
  form = { firstName: '', lastName: '', birthDate: '', phoneMobile: '', email: '', memberType: 'caregiver', provinceId: '', districtId: '', requestedServiceIds: [] as string[] };
  readonly date = thaiDate;
  readonly typeLabel = memberTypeLabel;
  readonly dateTime = thaiDateTime;
  selected() { return this.me()?.members.find((m) => m.id === this.selectedId()) ?? this.me()?.members[0] ?? null; }
  membershipText(m: ParticipantProfile): string {
    const x = m.membership;
    if (!x || x.status === 'general') return 'สมาชิกทั่วไป';
    if (x.status === 'lifetime') return `${x.tierName} (ตลอดชีพ)`;
    return `${x.tierName} · ${x.status === 'expired' ? 'หมดอายุเมื่อ' : 'ใช้ได้ถึง'} ${thaiDate(x.expiresAt)}`;
  }
  hasPending() { return this.requests().some((r) => r.status === 'pending'); }
  fieldNames(req: ProfileChangeView) { return req.fields.map((f) => FIELD_LABEL[f]).join(', '); }
  serviceNames(m: ParticipantProfile) {
    const names = m.requestedServiceIds.map((id) => this.options()?.services.find((s) => s.id === id)?.name).filter(Boolean);
    return names.length ? names.join(', ') : 'ยังไม่ระบุ';
  }
  ngOnInit() { void this.load(); }
  async load() {
    this.loading.set(true);
    this.error.set('');
    this.needsIdentity.set(false);
    if (!this.session.signedIn) {
      this.needsIdentity.set(true);
      this.error.set(this.session.devMode ? 'ยังไม่ได้เลือกบัญชี LINE จำลอง' : 'กรุณาเปิดหน้านี้จากเมนูใน LINE');
      this.loading.set(false);
      return;
    }
    try {
      const [me, options] = await Promise.all([this.api.request<Me>('/me'), this.api.request<Options>('/signup/options')]);
      this.me.set(me);
      this.options.set(options);
      const wanted = this.route.snapshot.queryParamMap.get('m') ?? this.selectedId();
      this.selectedId.set(me.members.find((m) => m.id === wanted)?.id ?? me.members[0]?.id ?? '');
      await this.loadRequests();
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) this.needsIdentity.set(true);
      this.error.set(errorText(error, 'เปิดข้อมูลไม่สำเร็จ'));
    } finally {
      this.loading.set(false);
    }
  }
  private async loadRequests() {
    const m = this.selected();
    this.requests.set(m ? (await this.api.request<{ items: ProfileChangeView[] }>(`/me/${m.id}/profile-changes`)).items : []);
  }
  async select(id: string) {
    this.selectedId.set(id);
    this.editing.set(false);
    this.confirmRemove.set(false);
    this.flash.set('');
    await this.loadRequests().catch(() => this.requests.set([]));
  }
  async startEdit(m: ParticipantProfile) {
    this.form = { firstName: m.firstName, lastName: m.lastName, birthDate: m.birthDate, phoneMobile: m.phoneMobile, email: m.email, memberType: m.memberType || 'caregiver', provinceId: m.provinceId, districtId: m.districtId, requestedServiceIds: [...m.requestedServiceIds] };
    this.editErrors.set([]);
    this.editing.set(true);
    if (m.provinceId) await this.loadDistricts(m.provinceId);
  }
  private async loadDistricts(province: string) {
    try { this.districts.set((await this.api.request<{ districts: string[] }>(`/signup/districts/${encodeURIComponent(province)}`)).districts); } catch { this.districts.set([]); }
  }
  async pickProvince(province: string) {
    this.form.provinceId = province;
    this.form.districtId = '';
    await this.loadDistricts(province);
  }
  toggleService(id: string) {
    this.form.requestedServiceIds = this.form.requestedServiceIds.includes(id) ? this.form.requestedServiceIds.filter((x) => x !== id) : [...this.form.requestedServiceIds, id];
  }
  async saveEdit(m: ParticipantProfile) {
    if (this.busy()) return;
    const patch: Record<string, unknown> = {};
    const f = this.form;
    const now: Record<string, unknown> = { firstName: m.firstName, lastName: m.lastName, birthDate: m.birthDate, phoneMobile: m.phoneMobile, email: m.email, memberType: m.memberType, provinceId: m.provinceId, districtId: m.districtId };
    for (const key of Object.keys(now)) if ((f as Record<string, unknown>)[key] !== now[key]) patch[key] = (f as Record<string, unknown>)[key];
    if ([...f.requestedServiceIds].sort().join() !== [...m.requestedServiceIds].sort().join()) patch['requestedServiceIds'] = f.requestedServiceIds;
    if (!Object.keys(patch).length) { this.editErrors.set(['ยังไม่มีข้อมูลที่เปลี่ยนแปลง']); return; }
    this.busy.set(true);
    try {
      await this.api.request(`/me/${m.id}/profile-changes`, 'POST', patch);
      this.editing.set(false);
      this.flash.set('ส่งคำขอแก้ไขแล้ว รอเจ้าหน้าที่อนุมัติ');
      await this.loadRequests();
    } catch (error) {
      const fields = error instanceof ApiRequestError && error.fields ? Object.values(error.fields) : [];
      this.editErrors.set(fields.length ? fields : [errorText(error)]);
    } finally {
      this.busy.set(false);
    }
  }
  async remove(m: ParticipantProfile) {
    this.busy.set(true);
    try {
      await this.api.request(`/me/${m.id}/remove`, 'POST', {});
      this.confirmRemove.set(false);
      this.selectedId.set('');
      await this.load();
      this.flash.set('เอาสมาชิกออกจากรายการของคุณแล้ว');
    } catch (error) {
      this.error.set(errorText(error));
    } finally {
      this.busy.set(false);
    }
  }
}
