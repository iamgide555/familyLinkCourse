import type { NotificationKind } from '../../../../packages/contracts/src/notifications.js';

/** Allowed placeholders. Templates never receive sensitive intake values, document contents or other members' details. */
export const PLACEHOLDERS = ['member', 'course', 'sessions', 'date', 'outcome'] as const;
export const DEFAULT_TEMPLATES: Record<NotificationKind, string> = {
  'signup.linked': 'เจ้าหน้าที่ยืนยันข้อมูลสมาชิกของคุณแล้ว ใช้งานโปรไฟล์และลงทะเบียนคอร์สได้เลย',
  'signup.created': 'สมัครสมาชิก FamilyLink เรียบร้อยแล้ว ลงทะเบียนคอร์สได้เลย',
  'signup.rejected': 'เจ้าหน้าที่ยังไม่สามารถยืนยันใบสมัครของคุณได้ กรุณาติดต่อเจ้าหน้าที่ของสมาคม',
  'profile.approved': 'เจ้าหน้าที่อนุมัติการแก้ไขข้อมูลของ {{member}} แล้ว',
  'profile.rejected': 'เจ้าหน้าที่ไม่อนุมัติการแก้ไขข้อมูลของ {{member}} กรุณาติดต่อเจ้าหน้าที่หากมีข้อสงสัย',
  'registration.submitted': '{{member}} ส่งการลงทะเบียน {{course}} แล้ว รอเจ้าหน้าที่อนุมัติ {{sessions}}',
  'registration.confirmed': '{{member}} ลงทะเบียน {{course}} เรียบร้อยแล้ว {{sessions}}',
  'registration.waitlisted': '{{member}} อยู่ในคิวรอของ {{course}} ยังไม่มีที่นั่งรับประกัน เราจะแจ้งเมื่อมีที่ว่าง {{sessions}}',
  'registration.approved': 'เจ้าหน้าที่อนุมัติการลงทะเบียน {{course}} ของ {{member}} แล้ว {{sessions}}',
  'registration.rejected': 'เจ้าหน้าที่ไม่อนุมัติการลงทะเบียน {{course}} ของ {{member}} {{sessions}}',
  'waitlist.promoted': 'มีที่ว่างแล้ว! {{member}} ได้ที่นั่งใน {{course}} {{sessions}} {{outcome}}',
  'session.reminder': 'พรุ่งนี้มีเรียน {{course}} ของ {{member}}: {{sessions}}',
  'session.cancelled': 'สมาคมขอยกเลิกวันเรียนของ {{course}} {{sessions}} ขออภัยในความไม่สะดวก',
  'run.cancelled': 'สมาคมขอยกเลิกรอบเรียน {{course}} ขออภัยในความไม่สะดวก',
  'session.rescheduled': 'เลื่อนวันเรียน {{course}} เป็น {{sessions}} หากไม่สะดวก ยกเลิกเองได้ภายใน 7 วัน',
};
export const TEMPLATE_KINDS = Object.keys(DEFAULT_TEMPLATES) as NotificationKind[];

/** Returns an error message when a template could pull in markup, links or unknown data. */
export function templateProblem(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return 'ข้อความต้องไม่ว่าง';
  if (value.length > 400) return 'ข้อความยาวเกิน 400 ตัวอักษร';
  if (/[<>]/.test(value)) return 'ห้ามใช้เครื่องหมาย < >';
  if (/https?:|javascript:|data:|www\./i.test(value)) return 'ห้ามใส่ลิงก์ในข้อความแจ้งเตือน';
  for (const match of value.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)) if (!(PLACEHOLDERS as readonly string[]).includes(match[1]!)) return `ไม่รู้จักตัวแทนข้อความ {{${match[1]}}}`;
  if (/\{\{[^}]*$/.test(value) || /^[^{]*\}\}/.test(value)) return 'รูปแบบ {{...}} ไม่ถูกต้อง';
  return null;
}
export function renderTemplate(template: string, vars: Partial<Record<(typeof PLACEHOLDERS)[number], string>>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => (vars as Record<string, string>)[key] ?? '').replace(/\s+/g, ' ').trim();
}
