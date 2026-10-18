import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Component, DestroyRef, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiClient } from '../../core/api-client';
import { SessionService } from '../../core/session.service';
import { CaseNotesComponent } from '../case-notes/case-notes.component';
import { SignupFormActionsComponent } from '../forms/signup-form-actions.component';
import { MemberAdminActionsComponent } from './member-admin-actions.component';
import { MemberLineActionsComponent } from './member-line-actions.component';
import { MemberDocumentsComponent } from './member-documents.component';
import { MemberMembershipComponent } from '../memberships/member-membership.component';
import { MemberRegistrationsListComponent } from './member-registrations-list.component';
import type { MemberRecord } from '../../../../../../packages/contracts/src/members';
import type { ServiceType, SettingsList } from '../../../../../../packages/contracts/src/settings';
type Row = { label: string; value: string; full?: boolean };
@Component({
  selector: 'fl-member-profile',
  imports: [RouterLink, CaseNotesComponent, SignupFormActionsComponent, MemberAdminActionsComponent, MemberLineActionsComponent, MemberDocumentsComponent, MemberMembershipComponent, MemberRegistrationsListComponent],
  template: ` <main id="main-content" class="member-workspace">
    <a class="back-link" routerLink="/staff">กลับไปหน้ารายชื่อ</a>
    @if (error()) {
      <p class="notice notice-error" role="alert">{{ error() }}</p>
      <button class="button-secondary" (click)="load()">ลองอีกครั้ง</button>
    }
    @if (loading()) {
      <p role="status">กำลังเปิดข้อมูลสมาชิก…</p>
    } @else if (member(); as member) {
      @if (saved) {
        <p class="notice notice-success" role="status">
          {{ saved === 'updated' ? 'บันทึกการแก้ไขแล้ว' : 'บันทึกสมาชิกแล้ว' }}
        </p>
      }
      <div class="profile-heading">
        <div>
          <h1>{{ member.firstName }} {{ member.lastName }}</h1>
          <p class="member-number">เลขสมาชิก {{ member.memberNumber }}</p>
        </div>
        <a class="button-primary" [routerLink]="['/staff/members', member.id, 'edit']"
          >แก้ไขข้อมูล</a
        >
      </div>
      <ul class="status-chips" aria-label="สรุปสถานะสมาชิก">
        <li [class.chip-warn]="!member.signedFormAt" [class.chip-ok]="!!member.signedFormAt"><span class="chip-label">แบบฟอร์มลงนาม</span><span class="chip-value">{{ member.signedFormAt ? 'ได้รับเอกสารลงนามแล้ว' : 'ยังไม่ได้ลงนาม' }}</span></li>
        <li [class.chip-ok]="member.lineLinked"><span class="chip-label">LINE</span><span class="chip-value">{{ member.lineLinked ? 'เชื่อมต่อ LINE แล้ว' : 'ยังไม่เชื่อมต่อ LINE' }}</span></li>
        <li><span class="chip-label">ที่มาของข้อมูล</span><span class="chip-value">{{ member.source === 'paper' ? 'บันทึกจากใบสมัครกระดาษ' : member.source === 'line' ? 'สมัครผ่าน LINE' : member.source === 'invite' ? 'สมัครผ่านลิงก์เชิญ' : 'ลงทะเบียนหน้างาน' }}</span></li>
      </ul>
      <nav class="jump-links" aria-label="ไปยังหัวข้อในหน้านี้">
        <span>ไปที่:</span>
        @for (j of jumps; track j.id) { <button type="button" class="button-quiet" (click)="jump(j.id)">{{ j.label }}</button> }
      </nav>
      <section class="intake-section" aria-labelledby="basic-h">
        <h2 id="basic-h">ชื่อและข้อมูลติดต่อ</h2>
        <dl class="profile-fields">
          @for (r of basic(member).shown; track r.label) {
            <div [class.full-width]="r.full"><dt>{{ r.label }}</dt><dd>{{ r.value }}</dd></div>
          }
        </dl>
        @if (basic(member).missing.length) {
          <details class="missing-fields"><summary>ยังไม่มีข้อมูล {{ basic(member).missing.length }} ช่อง</summary><p>{{ basic(member).missing.join(' · ') }}</p></details>
        }
      </section>
      <details class="intake-section" [open]="extra(member).shown.length > 0" aria-labelledby="extra-h">
        <summary><h2 id="extra-h">ข้อมูลเพิ่มเติมจากใบสมัคร</h2><span>{{ extra(member).shown.length ? 'มีข้อมูล ' + extra(member).shown.length + ' ช่อง' : 'ยังไม่มีข้อมูล' }}</span></summary>
        @if (extra(member).shown.length) {
          <dl class="profile-fields">
            @for (r of extra(member).shown; track r.label) { <div><dt>{{ r.label }}</dt><dd>{{ r.value }}</dd></div> }
          </dl>
        }
        @if (extra(member).missing.length) {
          <details class="missing-fields"><summary>ยังไม่มีข้อมูล {{ extra(member).missing.length }} ช่อง</summary><p>{{ extra(member).missing.join(' · ') }}</p></details>
        }
      </details>
      <details class="intake-section" [open]="contactCount(member) > 0" aria-labelledby="contact-h">
        <summary><h2 id="contact-h">ผู้ดูแลและผู้ติดต่อฉุกเฉิน</h2><span>{{ contactCount(member) ? 'มีข้อมูล ' + contactCount(member) + ' ช่อง' : 'ยังไม่มีข้อมูล' }}</span></summary>
        <dl class="profile-fields">
          @if (member.caregiverMemberId) {
            <div><dt>ผู้ดูแล</dt><dd><a [routerLink]="['/staff/members', member.caregiverMemberId]">{{ caregiverName() || 'เปิดข้อมูลสมาชิกผู้ดูแล' }}</a></dd></div>
          }
          @for (r of contact(member).shown; track r.label) { <div><dt>{{ r.label }}</dt><dd>{{ r.value }}</dd></div> }
        </dl>
        @if (contact(member).missing.length) {
          <details class="missing-fields"><summary>ยังไม่มีข้อมูล {{ contact(member).missing.length }} ช่อง</summary><p>{{ contact(member).missing.join(' · ') }}</p></details>
        }
      </details>
      <fl-signup-form-actions [member]="member" (signed)="load()" />
      <fl-member-registrations-list [memberId]="member.id" />
      <fl-member-membership [memberId]="member.id" />
      <fl-member-documents [memberId]="member.id" />
      <fl-member-line-actions [member]="member" [autoIssue]="saved === 'created'" (changed)="load()" />
      <app-case-notes [memberId]="member.id" />
      @if (session.user()?.role === 'admin') { <fl-member-admin-actions [member]="member" /> }
    }
  </main>`,
})
export class MemberProfileComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly session = inject(SessionService);
  private readonly route = inject(ActivatedRoute);
  readonly member = signal<MemberRecord | null>(null);
  readonly loading = signal(true);
  readonly error = signal('');
  readonly caregiverName = signal('');
  readonly serviceTypes = signal<ServiceType[]>([]);
  saved: string | null = null;
  private readonly destroyRef = inject(DestroyRef);
  private loadRequest = 0;
  readonly fields: Array<{ key: keyof MemberRecord; label: string }> = [
    { key: 'citizenId', label: 'เลขบัตรประชาชน' },
    { key: 'disabilityType', label: 'ประเภทความพิการ' },
    { key: 'phoneHome', label: 'เบอร์โทรศัพท์บ้าน' },
    { key: 'facebook', label: 'Facebook' },
    { key: 'maritalStatus', label: 'สถานภาพสมรส' },
    { key: 'education', label: 'การศึกษา' },
    { key: 'occupation', label: 'อาชีพ' },
    { key: 'housing', label: 'ลักษณะที่อยู่อาศัย' },
    { key: 'householdSize', label: 'จำนวนคนในครัวเรือน' },
    { key: 'householdEarners', label: 'จำนวนผู้มีรายได้ในครัวเรือน' },
    { key: 'householdIncome', label: 'รายได้ครัวเรือน' },
  ];
  readonly contactFields: Array<{ key: keyof MemberRecord; label: string }> = [
    { key: 'caregiverRelationship', label: 'ความสัมพันธ์ของผู้ดูแลกับสมาชิก' },
    { key: 'caregiverPhone', label: 'เบอร์โทรผู้ดูแล' },
    { key: 'emergencyName', label: 'ชื่อผู้ติดต่อฉุกเฉิน' },
    { key: 'emergencyRelationship', label: 'ความสัมพันธ์ของผู้ติดต่อฉุกเฉิน' },
    { key: 'emergencyPhone', label: 'เบอร์โทรฉุกเฉิน' },
  ];
  readonly jumps = [
    { id: 'paper-form-heading', label: 'แบบฟอร์ม' }, { id: 'mr-h', label: 'คอร์ส' }, { id: 'mem-h', label: 'สมาชิกภาพ' },
    { id: 'docs-heading', label: 'เอกสาร' }, { id: 'line-heading', label: 'LINE' }, { id: 'case-notes-heading', label: 'บันทึกเคส' },
  ];
  /** The page uses a base href, so in-page links are buttons that scroll to the section heading instead. */
  jump(id: string) {
    const el = document.getElementById(id);
    if (!el) return;
    el.setAttribute('tabindex', '-1');
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  }
  private rows(member: MemberRecord, defs: Array<{ key: keyof MemberRecord; label: string }>) {
    const shown: Row[] = [];
    const missing: string[] = [];
    for (const f of defs) {
      const v = member[f.key];
      if (v === 0 || (v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))) shown.push({ label: f.label, value: String(v) });
      else missing.push(f.label);
    }
    return { shown, missing };
  }
  basic(member: MemberRecord) {
    const shown: Row[] = [
      { label: 'วันเกิด', value: this.date(member.birthDate) },
      { label: 'เบอร์มือถือ', value: member.phoneMobile || 'ยังไม่ระบุ' },
      { label: 'อีเมล', value: member.email || 'ยังไม่ระบุ' },
      { label: 'ประเภทสมาชิก', value: member.memberType === 'caregiver' ? 'ผู้ดูแล' : member.memberType === 'disabled' ? 'คนพิการ' : member.memberType === 'at_risk' ? 'ผู้มีแนวโน้มจะพิการ' : 'ยังไม่ระบุ' },
    ];
    const missing: string[] = [];
    const optional: Array<[string, string, boolean]> = [
      ['ที่อยู่ตามใบสมัคร', member.address || '', true],
      ['จังหวัด / อำเภอ / ตำบล / รหัสไปรษณีย์', [member.provinceId, member.districtId, member.subdistrictId, member.postcode].filter(Boolean).join(' / '), true],
      ['บริการที่ต้องการ', this.requestedServices(member), true],
    ];
    for (const [label, value, full] of optional) { if (value) shown.push({ label, value, full }); else missing.push(label); }
    return { shown, missing };
  }
  extra(member: MemberRecord) { return this.rows(member, this.fields); }
  contact(member: MemberRecord) {
    // A linked caregiver is shown as a link in the template; otherwise the typed name is just another field.
    const defs = member.caregiverMemberId ? this.contactFields : [{ key: 'caregiverName' as keyof MemberRecord, label: 'ผู้ดูแล' }, ...this.contactFields];
    return this.rows(member, defs);
  }
  contactCount(member: MemberRecord) { return this.contact(member).shown.length + (member.caregiverMemberId ? 1 : 0); }
  ngOnInit() {
    this.route.paramMap.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => void this.load());
  }
  async load() {
    const request = ++this.loadRequest;
    this.saved = this.route.snapshot.queryParamMap.get('saved');
    this.caregiverName.set('');
    this.loading.set(true);
    this.error.set('');
    this.member.set(null);
    try {
      const member = await this.api.request<MemberRecord>(
        `/members/${this.route.snapshot.paramMap.get('id')}`,
      );
      if (request !== this.loadRequest) return;
      this.member.set(member);
      try {
        const services = await this.api.request<SettingsList<ServiceType>>('/settings/service-types');
        if (request === this.loadRequest) this.serviceTypes.set(services.items);
      } catch { this.serviceTypes.set([]); }
      if (member.caregiverMemberId) {
        const caregiver = await this.api.request<MemberRecord>(
          `/members/${member.caregiverMemberId}`,
        );
        if (request === this.loadRequest)
          this.caregiverName.set(`${caregiver.firstName} ${caregiver.lastName}`);
      }
    } catch (e) {
      if (request === this.loadRequest)
        this.error.set(e instanceof Error ? e.message : 'ยังเปิดข้อมูลไม่ได้');
    } finally {
      if (request === this.loadRequest) this.loading.set(false);
    }
  }
  date(value: string) {
    if (!value) return 'ยังไม่ระบุ';
    return new Intl.DateTimeFormat('th-TH', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      timeZone: 'Asia/Bangkok',
    }).format(new Date(value + 'T00:00:00Z'));
  }
  requestedServices(member: MemberRecord) {
    return member.requestedServiceIds
      .map((id) => this.serviceTypes().find((service) => service.id === id)?.name)
      .filter(Boolean).join(', ');
  }
}
