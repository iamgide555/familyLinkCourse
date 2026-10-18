import { PDFDocument, PDFName, StandardFonts, degrees, rgb } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { AppError } from '../common/errors.js';
import { WATERMARK_TEXT, type UploadMime } from './upload-policy.js';
import { splitRuns, watermarkFonts, watermarkOutline } from './watermark.js';

const MAX_PIXELS = 40_000_000;
const MAX_PDF_PAGES = 30;
const unreadable = () => new AppError(422, 'UNREADABLE_FILE', 'ไฟล์เสียหรืออ่านไม่ได้ กรุณาเลือกไฟล์อื่น');

export type Sanitized = { bytes: Buffer; mime: 'image/jpeg' | 'image/png' | 'application/pdf' };

async function sanitizeImage(input: Buffer, mime: UploadMime): Promise<Sanitized> {
  let source = input;
  let outputPng = mime === 'image/png';
  try {
    if (mime === 'image/heic') {
      source = Buffer.from(await heicConvert({ buffer: input, format: 'JPEG', quality: 0.9 }));
      outputPng = false;
    }
    const meta = await sharp(source, { limitInputPixels: MAX_PIXELS }).metadata();
    if (!meta.width || !meta.height || meta.width * meta.height > MAX_PIXELS) throw new Error('too large');
    // rotate() applies EXIF orientation, then sharp drops all metadata (EXIF, GPS, ICC text) on output.
    const base = sharp(source, { limitInputPixels: MAX_PIXELS }).rotate().resize({ width: 2600, height: 2600, fit: 'inside', withoutEnlargement: true });
    const { data: raw, info } = await base.clone().raw().toBuffer({ resolveWithObject: true });
    const size = Math.max(16, Math.round(Math.min(info.width, info.height) / 20));
    const outline = await watermarkOutline(size);
    const tileW = Math.round(outline.width + size * 3);
    const tileH = Math.round(size * 6);
    const overlay = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${info.width}" height="${info.height}">` +
        `<defs><pattern id="w" width="${tileW}" height="${tileH}" patternUnits="userSpaceOnUse" patternTransform="rotate(-28)">` +
        `<g transform="translate(${size} ${Math.round(size * 3)})" fill="#12353d" fill-opacity="0.34" stroke="#ffffff" stroke-opacity="0.34" stroke-width="${(size / 28).toFixed(2)}">${outline.svg}</g></pattern></defs>` +
        `<rect width="100%" height="100%" fill="url(#w)"/></svg>`,
    );
    const composed = sharp(raw, { raw: { width: info.width, height: info.height, channels: info.channels } })
      .composite([{ input: overlay, top: 0, left: 0 }]);
    const bytes = outputPng ? await composed.png().toBuffer() : await composed.jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    return { bytes, mime: outputPng ? 'image/png' : 'image/jpeg' };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unreadable();
  }
}

async function sanitizePdf(input: Buffer): Promise<Sanitized> {
  try {
    const source = await PDFDocument.load(input, { ignoreEncryption: false, updateMetadata: false, throwOnInvalidObject: true });
    const count = source.getPageCount();
    if (count < 1 || count > MAX_PDF_PAGES) throw new AppError(422, 'PDF_PAGES', `ไฟล์ PDF ต้องมี 1–${MAX_PDF_PAGES} หน้า`);
    // Copy pages into a fresh document so catalog actions, JavaScript and attachments are not carried over.
    const output = await PDFDocument.create();
    output.registerFontkit(fontkit);
    const fonts = await watermarkFonts();
    const thai = await output.embedFont(fonts.thaiBytes, { subset: true });
    const latin = await output.embedFont(fonts.latinBytes, { subset: true });
    await output.embedFont(StandardFonts.Helvetica);
    const pages = await output.copyPages(source, source.getPageIndices());
    for (const page of pages) {
      page.node.delete(PDFName.of('Annots'));
      page.node.delete(PDFName.of('AA'));
      output.addPage(page);
      const { width, height } = page.getSize();
      const size = Math.max(14, Math.min(width, height) / 22);
      const angle = 30;
      const cos = Math.cos((angle * Math.PI) / 180);
      const sin = Math.sin((angle * Math.PI) / 180);
      const runs = splitRuns(WATERMARK_TEXT).map((run) => ({ run, font: run.script === 'thai' ? thai : latin }));
      const total = runs.reduce((sum, { run, font }) => sum + font.widthOfTextAtSize(run.text, size), 0);
      for (const [cx, cy] of [[0.5, 0.25], [0.5, 0.52], [0.5, 0.8]] as const) {
        let x = width * cx - (total / 2) * cos;
        let y = height * cy - (total / 2) * sin;
        for (const { run, font } of runs) {
          page.drawText(run.text, { x, y, size, font, rotate: degrees(angle), color: rgb(0.07, 0.21, 0.24), opacity: 0.3 });
          const advance = font.widthOfTextAtSize(run.text, size);
          x += advance * cos;
          y += advance * sin;
        }
      }
    }
    output.setTitle('');
    output.setAuthor('');
    output.setSubject('');
    output.setKeywords([]);
    output.setProducer('FamilyLink');
    output.setCreator('FamilyLink');
    return { bytes: Buffer.from(await output.save()), mime: 'application/pdf' };
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw unreadable();
  }
}

export async function sanitizeUpload(bytes: Buffer, mime: UploadMime): Promise<Sanitized> {
  return mime === 'application/pdf' ? sanitizePdf(bytes) : sanitizeImage(bytes, mime);
}
