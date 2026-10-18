import type { StaffIntakeInput } from '../../../../packages/contracts/src/members.js';
import { AppError } from '../common/errors.js';
export function normalizePhone(value: string): string {
  return value.replace(/[\s()-]/g, '');
}
export function validateIntake(input: StaffIntakeInput, now: Date): void {
  const fields: Record<string, string> = {};
  if (!input.firstName.trim()) fields['firstName'] = 'กรุณากรอกชื่อ';
  if (!input.lastName.trim()) fields['lastName'] = 'กรุณากรอกนามสกุล';
  if (input.phoneMobile && !/^0[689]\d{8}$/.test(input.phoneMobile))
    fields['phoneMobile'] = 'กรุณากรอกเบอร์มือถือไทย 10 หลัก เช่น 0812345678';
  if (input.phoneHome && !/^0\d{8,9}$/.test(input.phoneHome))
    fields['phoneHome'] = 'กรุณาตรวจสอบเบอร์โทรศัพท์';
  if (input.caregiverPhone && !/^0\d{8,9}$/.test(input.caregiverPhone))
    fields['caregiverPhone'] = 'กรุณาตรวจสอบเบอร์ผู้ดูแล';
  if (input.emergencyPhone && !/^0\d{8,9}$/.test(input.emergencyPhone))
    fields['emergencyPhone'] = 'กรุณาตรวจสอบเบอร์ติดต่อฉุกเฉิน';
  if (input.birthDate) {
    const date = new Date(input.birthDate + 'T00:00:00.000Z');
    const bangkokToday = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== input.birthDate ||
      input.birthDate > bangkokToday
    )
      fields['birthDate'] = 'กรุณากรอกวันเกิดที่ถูกต้อง และไม่เป็นวันในอนาคต';
  }
  if (input.citizenId) {
    const id = input.citizenId;
    const sum = /^\d{13}$/.test(id)
      ? [...id.slice(0, 12)].reduce((s, c, i) => s + Number(c) * (13 - i), 0)
      : -1;
    if (sum < 0 || (11 - (sum % 11)) % 10 !== Number(id[12]))
      fields['citizenId'] = 'เลขบัตรประชาชนไม่ถูกต้อง กรุณาตรวจสอบทั้ง 13 หลัก';
  }
  if (input.caregiverMemberId && !input.caregiverRelationship?.trim())
    fields['caregiverRelationship'] = 'กรุณาระบุความสัมพันธ์กับสมาชิก';
  if (input.duplicateDecision === 'create_new' && !input.duplicateReason?.trim())
    fields['duplicateReason'] = 'กรุณาระบุเหตุผลที่สร้างสมาชิกใหม่';
  if (Object.keys(fields).length)
    throw new AppError(422, 'INVALID_INPUT', 'กรุณาตรวจสอบช่องที่ระบุ', fields);
}
