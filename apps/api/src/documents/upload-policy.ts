export const MAX_UPLOAD_BYTES = 10_000_000;
export const MAX_FILES_PER_DRAFT = 5;
export const WATERMARK_TEXT = 'ใช้สำหรับสมาคม FamilyLink เท่านั้น';
export type UploadMime = 'image/jpeg' | 'image/png' | 'application/pdf' | 'image/heic';

const HEIC_BRANDS = new Set(['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']);

/** Detect the real type from content. File names and client MIME headers are never trusted. */
export function detectMime(bytes: Buffer): UploadMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (bytes.length >= 5 && bytes.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (bytes.length >= 12 && bytes.subarray(4, 8).toString('latin1') === 'ftyp' &&
    HEIC_BRANDS.has(bytes.subarray(8, 12).toString('latin1'))) return 'image/heic';
  return null;
}
