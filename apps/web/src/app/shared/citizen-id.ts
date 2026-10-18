/** Digits only: people type spaces or dashes when copying from a card. */
export const normalizeCitizenId = (raw: string) => raw.replace(/[\s-]/g, '');

/** The same check the server applies: 13 digits and the Thai ID check digit. */
export function isValidCitizenId(raw: string): boolean {
  const id = normalizeCitizenId(raw);
  if (!/^\d{13}$/.test(id)) return false;
  const sum = [...id.slice(0, 12)].reduce((total, digit, i) => total + Number(digit) * (13 - i), 0);
  return (11 - (sum % 11)) % 10 === Number(id[12]);
}

export type CitizenIdModel = { citizenId?: string; noCitizenId?: boolean; citizenIdMissingReason?: string };

/** Client-side problems for the ID block; the server repeats the same rules. */
export function citizenIdProblems(model: CitizenIdModel, required: boolean): Record<string, string> {
  const errors: Record<string, string> = {};
  const id = normalizeCitizenId(model.citizenId ?? '');
  if (model.noCitizenId) {
    if (!(model.citizenIdMissingReason ?? '').trim()) errors['citizenIdMissingReason'] = 'กรุณาระบุเหตุผลที่ไม่มีเลขบัตรประชาชน';
  } else if (id) {
    if (!isValidCitizenId(id)) errors['citizenId'] = 'เลขบัตรประชาชนไม่ถูกต้อง กรุณาตรวจสอบทั้ง 13 หลัก';
  } else if (required) {
    errors['citizenId'] = 'กรุณากรอกเลขบัตรประชาชน 13 หลัก หรือเลือก “ไม่มีเลขบัตรประชาชน” พร้อมเหตุผล';
  }
  return errors;
}
