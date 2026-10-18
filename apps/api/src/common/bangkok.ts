/** Asia/Bangkok has no daylight saving: UTC+7 all year, so fixed-offset arithmetic is exact. */
const OFFSET_MS = 7 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;
export function instantOf(date: string, time: string): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const [hh, mm] = time.split(':').map(Number) as [number, number];
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - OFFSET_MS);
}
export function bangkokDate(instant: Date): string {
  return new Date(instant.getTime() + OFFSET_MS).toISOString().slice(0, 10);
}
export function bangkokTime(instant: Date): string {
  return new Date(instant.getTime() + OFFSET_MS).toISOString().slice(11, 16);
}
export function isDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
export function isTime(value: unknown): value is string {
  return typeof value === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
