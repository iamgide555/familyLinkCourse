export const MEMBER_TYPES: Array<{ value: 'caregiver' | 'disabled' | 'at_risk'; label: string }> = [
  { value: 'caregiver', label: 'ผู้ดูแล' },
  { value: 'disabled', label: 'คนพิการ' },
  { value: 'at_risk', label: 'ผู้มีแนวโน้มจะพิการ' },
];
export const memberTypeLabel = (value: string): string => MEMBER_TYPES.find((t) => t.value === value)?.label ?? 'ยังไม่ระบุ';
export function thaiDate(value: string | null | undefined): string {
  if (!value) return 'ยังไม่ระบุ';
  const date = value.length === 10 ? new Date(value + 'T00:00:00Z') : new Date(value);
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(date);
}
export function thaiDateTime(value: string): string {
  return new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Bangkok' }).format(new Date(value)) + ' น.';
}
export const errorText = (e: unknown, fallback = 'ทำรายการไม่สำเร็จ กรุณาลองอีกครั้ง'): string => (e instanceof Error && e.message ? e.message : fallback);

/** Bangkok wall-clock helpers: forms edit Bangkok time regardless of the browser's own time zone. */
export const bangkokInput = (iso: string | null): string => (iso ? new Date(new Date(iso).getTime() + 7 * 3600000).toISOString().slice(0, 16) : '');
export const bangkokIso = (local: string): string | null => (local ? new Date(`${local}:00+07:00`).toISOString() : null);
export const shortDate = (value: string): string => new Intl.DateTimeFormat('th-TH', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' }).format(new Date(value + 'T00:00:00Z'));
export const todayBangkok = (): string => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
export const STATUS_WORD: Record<string, string> = { submitted: 'รอเจ้าหน้าที่อนุมัติ', confirmed: 'ยืนยันแล้ว', waitlisted: 'อยู่ในคิวรอ', rejected: 'ไม่อนุมัติ', cancelled: 'ยกเลิกแล้ว', refused: 'ที่นั่งเต็ม ไม่ได้ลงทะเบียน' };
export const AVAILABILITY_WORD: Record<string, string> = { available: 'ยังมีที่ว่าง', full_waitlist: 'เต็มแล้ว ลงชื่อรอคิวได้', full_closed: 'เต็มแล้ว', closed: 'ปิดรับลงทะเบียน', not_open: 'ยังไม่เปิดรับ', cancelled: 'ยกเลิกแล้ว' };
