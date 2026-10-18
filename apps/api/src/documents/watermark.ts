import { readFile } from 'node:fs/promises';
import fontkit from '@pdf-lib/fontkit';
import { WATERMARK_TEXT } from './upload-policy.js';

type Glyph = { path: { toSVG(): string }; advanceWidth: number };
type Position = { xAdvance: number; xOffset: number; yOffset: number };
type KitFont = { unitsPerEm: number; layout(text: string): { glyphs: Glyph[]; positions: Position[] } };
type Fonts = { thai: KitFont; latin: KitFont; thaiBytes: Buffer; latinBytes: Buffer };

let cached: Promise<Fonts> | null = null;
export function watermarkFonts(): Promise<Fonts> {
  cached ??= (async () => {
    const dir = new URL('../forms/assets/', import.meta.url);
    const [thaiBytes, latinBytes] = await Promise.all([
      readFile(new URL('sarabun-600-thai.woff2', dir)),
      readFile(new URL('sarabun-600-latin.woff2', dir)),
    ]);
    const kit = fontkit as unknown as { create(bytes: Buffer): KitFont };
    return { thai: kit.create(thaiBytes), latin: kit.create(latinBytes), thaiBytes, latinBytes };
  })();
  return cached;
}

export type Run = { text: string; script: 'thai' | 'latin' };
/** Splits text into Thai and Latin runs because the bundled fonts are separate subsets. */
export function splitRuns(text: string): Run[] {
  const runs: Run[] = [];
  for (const character of text) {
    const script = /[฀-๿]/.test(character) ? 'thai' : 'latin';
    const last = runs[runs.length - 1];
    if (last && last.script === script) last.text += character;
    else runs.push({ text: character, script });
  }
  return runs;
}

/** Outlines the watermark as SVG paths so rendering never depends on system fonts. */
export async function watermarkOutline(size: number): Promise<{ svg: string; width: number }> {
  const fonts = await watermarkFonts();
  let x = 0;
  const parts: string[] = [];
  for (const run of splitRuns(WATERMARK_TEXT)) {
    const font = fonts[run.script];
    const scale = size / font.unitsPerEm;
    const { glyphs, positions } = font.layout(run.text);
    glyphs.forEach((glyph, index) => {
      const position = positions[index]!;
      const d = glyph.path.toSVG();
      if (d)
        parts.push(`<path d="${d}" transform="translate(${(x + position.xOffset * scale).toFixed(2)} ${(-position.yOffset * scale).toFixed(2)}) scale(${scale.toFixed(5)} ${(-scale).toFixed(5)})"/>`);
      x += position.xAdvance * scale;
    });
  }
  return { svg: parts.join(''), width: x };
}
