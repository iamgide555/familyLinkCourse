import { Component, ElementRef, inject, OnInit, signal } from '@angular/core';
import { HelpTipComponent } from '../../shared/help-tip.component';
import { CitizenIdFieldComponent } from '../../shared/citizen-id-field.component';
import { citizenIdProblems, normalizeCitizenId } from '../../shared/citizen-id';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiClient, ApiRequestError } from '../../core/api-client';
import type {
  MemberRecord,
  MemberSummary,
  StaffIntakeInput,
} from '../../../../../../packages/contracts/src/members';
import type { ServiceType, SettingsList } from '../../../../../../packages/contracts/src/settings';
type TextField = Exclude<
  keyof StaffIntakeInput,
  'householdSize' | 'householdEarners' | 'noCitizenId' | 'duplicateDecision' | 'requestedServiceIds' | 'provinceId' | 'districtId' | 'subdistrictId' | 'postcode'
>;
type Field = { key: TextField; label: string; type?: string; hint?: string; max?: number };
@Component({
  selector: 'fl-member-form',
  imports: [FormsModule, RouterLink, HelpTipComponent, CitizenIdFieldComponent],
  templateUrl: './member-form.component.html',
})
export class MemberFormComponent implements OnInit {
  private readonly api = inject(ApiClient);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly element: ElementRef<HTMLElement> = inject(ElementRef);
  readonly id = this.route.snapshot.paramMap.get('id');
  readonly loading = signal(!!this.id);
  readonly loaded = signal(!this.id);
  readonly busy = signal(false);
  readonly conflict = signal(false);
  readonly provinces = signal<string[]>([]);
  readonly districts = signal<string[]>([]);
  readonly subdistricts = signal<{ name: string; postcodes: string[] }[]>([]);
  readonly postcodes = signal<string[]>([]);
  readonly serviceTypes = signal<ServiceType[]>([]);
  readonly referenceError = signal('');
  readonly error = signal('');
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly matches = signal<MemberSummary[]>([]);
  readonly caregiverResults = signal<MemberSummary[]>([]);
  readonly caregiverBusy = signal(false);
  readonly caregiverError = signal('');
  caregiverQuery = '';
  caregiverLabel = '';
  duplicateReason = '';
  private expectedVersion: number | null = null;
  /** A record that already had an ID number (or a reason) may not lose it; older records without either stay editable. */
  private hadIdentity = false;
  private hadBirthDate = false;
  readonly data: StaffIntakeInput = {
    firstName: '',
    lastName: '',
    birthDate: '',
    phoneMobile: '',
    email: '',
    memberType: '',
    citizenId: '',
    noCitizenId: false,
    citizenIdMissingReason: '',
    disabilityType: '',
    address: '',
    provinceId: '',
    districtId: '',
    subdistrictId: '',
    postcode: '',
    requestedServiceIds: [],
    phoneHome: '',
    facebook: '',
    maritalStatus: '',
    education: '',
    occupation: '',
    housing: '',
    householdIncome: '',
    householdSize: null,
    householdEarners: null,
    caregiverMemberId: null,
    caregiverName: '',
    caregiverRelationship: '',
    caregiverPhone: '',
    emergencyName: '',
    emergencyRelationship: '',
    emergencyPhone: '',
  };
  readonly basic: Field[] = [
    { key: 'firstName', label: 'ชื่อ', max: 150 },
    { key: 'lastName', label: 'นามสกุล', max: 150 },
    {
      key: 'birthDate',
      label: 'วันเกิด (ค.ศ.)',
      type: 'date',
      hint: 'ใช้ตรวจว่าเป็นคนเดียวกับสมาชิกเดิมหรือไม่ ใช้ปี ค.ศ. เช่น พ.ศ. 2500 คือ ค.ศ. 1957',
    },
    {
      key: 'phoneMobile',
      label: 'เบอร์มือถือ',
      type: 'tel',
      hint: 'เช่น 0812345678 ใช้เบอร์ร่วมกับคนในครอบครัวได้',
      max: 20,
    },
    { key: 'email', label: 'อีเมล', type: 'email', hint: 'ใช้ส่งข้อความแจ้งเตือนสำรอง เมื่อส่งทาง LINE ไม่ได้ ไม่บังคับกรอก', max: 254 },
  ];
  readonly personal: Field[] = [
    { key: 'disabilityType', label: 'ประเภทความพิการ', max: 500 },
    { key: 'phoneHome', label: 'เบอร์โทรศัพท์บ้าน', type: 'tel', max: 20 },
    { key: 'facebook', label: 'Facebook', max: 300 },
    { key: 'maritalStatus', label: 'สถานภาพสมรส', max: 150 },
    { key: 'education', label: 'การศึกษา', max: 150 },
    { key: 'occupation', label: 'อาชีพ', max: 150 },
    { key: 'housing', label: 'ลักษณะที่อยู่อาศัย', max: 150 },
    {
      key: 'householdIncome',
      label: 'รายได้ครัวเรือน',
      hint: 'ระบุจำนวนและช่วงเวลา เช่น 15000 บาทต่อเดือน',
      max: 100,
    },
  ];
  readonly contacts: Field[] = [
    { key: 'caregiverName', label: 'ชื่อผู้ดูแล (กรณียังไม่ได้เป็นสมาชิก)', max: 300 },
    {
      key: 'caregiverRelationship',
      label: 'ความสัมพันธ์ของผู้ดูแลกับสมาชิก',
      hint: 'เช่น มารดา บุตร หรือคู่สมรส',
      max: 150,
    },
    { key: 'caregiverPhone', label: 'เบอร์โทรผู้ดูแล', type: 'tel', max: 20 },
    { key: 'emergencyName', label: 'ชื่อผู้ติดต่อฉุกเฉิน', max: 300 },
    { key: 'emergencyRelationship', label: 'ความสัมพันธ์ของผู้ติดต่อฉุกเฉิน', max: 150 },
    { key: 'emergencyPhone', label: 'เบอร์โทรฉุกเฉิน', type: 'tel', max: 20 },
  ];
  ngOnInit() {
    void this.loadReferences();
    if (this.id) void this.loadMember();
  }
  async loadReferences() {
    try {
      const [provinces, services] = await Promise.all([
        this.api.request<{ items: string[] }>('/reference/address/provinces'),
        this.api.request<SettingsList<ServiceType>>('/settings/service-types'),
      ]);
      this.provinces.set(provinces.items);
      this.serviceTypes.set(services.items);
      this.referenceError.set('');
    } catch (e) {
      this.referenceError.set(e instanceof Error ? e.message : 'ยังเปิดรายการที่อยู่และบริการไม่ได้');
    }
  }
  async loadMember() {
    if (!this.id) return;
    this.loading.set(true);
    this.loaded.set(false);
    this.error.set('');
    try {
      const member = await this.api.request<MemberRecord>(`/members/${this.id}`);
      for (const key of Object.keys(this.data) as (keyof StaffIntakeInput)[])
        Object.assign(this.data, { [key]: member[key as keyof MemberRecord] });
      this.data.noCitizenId = !!member.citizenIdMissingReason;
      this.hadIdentity = !!(member.citizenId || member.citizenIdMissingReason);
      this.hadBirthDate = !!member.birthDate;
      this.expectedVersion = member.version;
      this.loaded.set(true);
      this.conflict.set(false);
      await this.loadAddressChoices();
      if (member.caregiverMemberId) {
        try {
          const caregiver = await this.api.request<MemberRecord>(`/members/${member.caregiverMemberId}`);
          this.caregiverLabel = `${caregiver.firstName} ${caregiver.lastName}`;
        } catch { this.caregiverLabel = 'สมาชิกผู้ดูแล'; }
      }
    } catch (e) {
      this.error.set(e instanceof Error ? e.message : 'ยังเปิดข้อมูลไม่ได้');
    } finally {
      this.loading.set(false);
    }
  }
  private async loadAddressChoices() {
    if (this.data.provinceId) {
      const districts = await this.api.request<{ items: string[] }>(`/reference/address/districts?province=${encodeURIComponent(this.data.provinceId)}`);
      this.districts.set(districts.items);
    }
    if (this.data.provinceId && this.data.districtId) {
      const subdistricts = await this.api.request<{ items: { name: string; postcodes: string[] }[] }>(`/reference/address/subdistricts?province=${encodeURIComponent(this.data.provinceId)}&district=${encodeURIComponent(this.data.districtId)}`);
      this.subdistricts.set(subdistricts.items);
      this.postcodes.set(subdistricts.items.find((x) => x.name === this.data.subdistrictId)?.postcodes ?? []);
    }
  }
  async provinceChanged() {
    this.data.districtId = '';
    this.data.subdistrictId = '';
    this.data.postcode = '';
    this.districts.set([]); this.subdistricts.set([]); this.postcodes.set([]);
    if (!this.data.provinceId) return;
    const selected = this.data.provinceId;
    try {
      const result = await this.api.request<{ items: string[] }>(`/reference/address/districts?province=${encodeURIComponent(selected)}`);
      if (this.data.provinceId === selected) this.districts.set(result.items);
    } catch (e) { this.referenceError.set(e instanceof Error ? e.message : 'ยังเปิดอำเภอไม่ได้'); }
  }
  async districtChanged() {
    this.data.subdistrictId = '';
    this.data.postcode = '';
    this.subdistricts.set([]); this.postcodes.set([]);
    if (!this.data.districtId || !this.data.provinceId) return;
    const province = this.data.provinceId, district = this.data.districtId;
    try {
      const result = await this.api.request<{ items: { name: string; postcodes: string[] }[] }>(`/reference/address/subdistricts?province=${encodeURIComponent(province)}&district=${encodeURIComponent(district)}`);
      if (this.data.provinceId === province && this.data.districtId === district) this.subdistricts.set(result.items);
    } catch (e) { this.referenceError.set(e instanceof Error ? e.message : 'ยังเปิดตำบลไม่ได้'); }
  }
  subdistrictChanged() {
    const postcodes = this.subdistricts().find((x) => x.name === this.data.subdistrictId)?.postcodes ?? [];
    this.postcodes.set(postcodes);
    this.data.postcode = postcodes.length === 1 ? postcodes[0] : '';
  }
  hasService(id: string) { return this.data.requestedServiceIds?.includes(id) ?? false; }
  toggleService(id: string, checked: boolean) {
    this.data.requestedServiceIds = checked
      ? [...(this.data.requestedServiceIds ?? []), id]
      : (this.data.requestedServiceIds ?? []).filter((x) => x !== id);
  }
  private focusProblem() {
    setTimeout(() => {
      const control =
        this.element.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]');
      const section = control?.closest('details');
      if (section) section.open = true;
      control?.focus();
    });
  }
  async save(createNew = false) {
    if (this.busy() || this.loading() || !this.loaded()) return;
    this.fieldErrors.set({});
    this.error.set('');
    const errors: Record<string, string> = {};
    if (!this.data.firstName.trim()) errors['firstName'] = 'กรุณากรอกชื่อ';
    if (!this.data.lastName.trim()) errors['lastName'] = 'กรุณากรอกนามสกุล';
    if (!this.data.birthDate && (!this.id || this.hadBirthDate)) errors['birthDate'] = 'กรุณากรอกวันเกิด ใช้ตรวจว่าเป็นคนเดียวกับสมาชิกเดิมหรือไม่';
    Object.assign(errors, citizenIdProblems(this.data, !this.id || this.hadIdentity));
    if (createNew && !this.duplicateReason.trim())
      errors['duplicateReason'] = 'กรุณาระบุเหตุผลที่สร้างสมาชิกใหม่';
    for (const key of ['householdSize', 'householdEarners'] as const) {
      const value = this.data[key];
      if (value !== null && value !== undefined && (!Number.isInteger(value) || value < 0 || value > 1000))
        errors[key] = 'กรุณากรอกจำนวนเต็ม 0 ถึง 1000';
    }
    if (Object.keys(errors).length) {
      this.fieldErrors.set(errors);
      this.focusProblem();
      return;
    }
    this.busy.set(true);
    try {
      const input = {
        ...this.data,
        citizenId: this.data.noCitizenId ? '' : normalizeCitizenId(this.data.citizenId ?? ''),
        citizenIdMissingReason: this.data.noCitizenId ? (this.data.citizenIdMissingReason ?? '').trim() : '',
        ...(this.id ? { expectedVersion: this.expectedVersion } : {}),
        ...(createNew
          ? {
              duplicateDecision: 'create_new' as const,
              duplicateReason: this.duplicateReason.trim(),
            }
          : {}),
      };
      const saved = await this.api.request<MemberRecord>(
        this.id ? `/members/${this.id}` : '/members',
        this.id ? 'PATCH' : 'POST',
        input,
      );
      await this.router.navigate(['/staff/members', saved.id], {
        queryParams: { saved: this.id ? 'updated' : 'created' },
      });
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'MEMBER_REVIEW_REQUIRED') {
        try {
          this.matches.set(
            await this.api.request<MemberSummary[]>(
              `/members/matches${this.id ? '?excludeId=' + encodeURIComponent(this.id) : ''}`,
              'POST',
              this.data,
            ),
          );
          setTimeout(() =>
            this.element.nativeElement.querySelector<HTMLElement>('#duplicate-title')?.focus(),
          );
        } catch {
          this.error.set('ยังเปิดรายชื่อที่ตรงกันไม่ได้ กรุณาลองบันทึกอีกครั้ง');
        }
      } else {
        if (e instanceof ApiRequestError && e.code === 'MEMBER_EDIT_CONFLICT') this.conflict.set(true);
        this.error.set(e instanceof Error ? e.message : 'ยังบันทึกไม่ได้ กรุณาลองอีกครั้ง');
        if (e instanceof ApiRequestError && e.fields) {
          this.fieldErrors.set(e.fields);
          this.focusProblem();
        }
      }
    } finally {
      this.busy.set(false);
    }
  }
  async findCaregivers() {
    if (this.caregiverBusy()) return;
    if (!this.caregiverQuery.trim()) {
      this.caregiverError.set('กรุณากรอกชื่อหรือเบอร์โทรผู้ดูแล');
      return;
    }
    this.caregiverBusy.set(true);
    this.caregiverError.set('');
    try {
      const result = await this.api.request<{ items: MemberSummary[] }>(
        `/members?q=${encodeURIComponent(this.caregiverQuery.trim())}`,
      );
      this.caregiverResults.set(result.items.filter((item) => item.id !== this.id));
      if (!this.caregiverResults().length)
        this.caregiverError.set('ไม่พบสมาชิกผู้ดูแล ลองค้นหาด้วยชื่อหรือเบอร์โทรอื่น');
    } catch (e) {
      this.caregiverError.set(e instanceof Error ? e.message : 'ยังค้นหาผู้ดูแลไม่ได้');
    } finally {
      this.caregiverBusy.set(false);
    }
  }
  chooseCaregiver(member: MemberSummary) {
    this.data.caregiverMemberId = member.id;
    this.caregiverLabel = `${member.firstName} ${member.lastName}`;
    this.caregiverResults.set([]);
    this.caregiverQuery = '';
  }
  clearCaregiver() {
    this.data.caregiverMemberId = null;
    this.caregiverLabel = '';
  }
}
