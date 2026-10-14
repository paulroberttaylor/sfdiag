import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as fontkit from 'fontkit';

export type Weight = 400 | 600 | 700;

export interface FontSet {
  family: string;
  files: Record<Weight, string>;
  fonts: Record<Weight, fontkit.Font>;
  /** italic faces (400 and 700); fall back to upright when absent */
  italicFiles: Partial<Record<400 | 700, string>>;
  italics: Partial<Record<400 | 700, fontkit.Font>>;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const bundledFontDir = path.resolve(here, '..', 'fonts');

let current: FontSet | undefined;

/**
 * Load fonts. A custom directory may hold Regular / SemiBold / Bold .ttf or .otf files
 * (e.g. SalesforceSans-Regular.ttf); the family name is read from the font itself.
 */
export function loadFonts(dir?: string): FontSet {
  if (current && !dir) return current;
  const d = dir ?? bundledFontDir;
  const all = fs.readdirSync(d).filter((f) => /\.(ttf|otf)$/i.test(f));
  const files = all.filter((f) => !/italic|oblique/i.test(f));
  const slanted = all.filter((f) => /italic|oblique/i.test(f));
  if (!files.length) throw new Error(`no .ttf/.otf fonts found in ${d}`);
  const pick = (w: Weight): string => {
    const patterns: Record<Weight, RegExp[]> = {
      400: [/-400\./, /regular/i, /book/i, /roman/i],
      600: [/-600\./, /semi\s*bold/i, /demi/i, /medium/i, /-700\./, /bold/i],
      700: [/-700\./, /(?<!semi|demi)bold/i, /heavy/i, /black/i],
    };
    for (const re of patterns[w]) {
      const f = files.find((x) => re.test(x));
      if (f) return path.join(d, f);
    }
    return path.join(d, files[0]);
  };
  const paths = { 400: pick(400), 600: pick(600), 700: pick(700) } as Record<Weight, string>;
  const fonts = {} as Record<Weight, fontkit.Font>;
  for (const w of [400, 600, 700] as Weight[]) fonts[w] = fontkit.openSync(paths[w]) as fontkit.Font;
  const italicFiles: FontSet['italicFiles'] = {};
  const italics: FontSet['italics'] = {};
  const boldRe = /-700italic|bold/i;
  const reg = slanted.find((f) => !boldRe.test(f));
  const bold = slanted.find((f) => boldRe.test(f) && !/semi|demi/i.test(f));
  for (const [w, f] of [[400, reg], [700, bold]] as const) {
    if (!f) continue;
    italicFiles[w] = path.join(d, f);
    italics[w] = fontkit.openSync(italicFiles[w]!) as fontkit.Font;
  }
  current = { family: fonts[400].familyName, files: paths, fonts, italicFiles, italics };
  return current;
}

function face(weight: Weight, italic = false): fontkit.Font {
  const set = loadFonts();
  if (italic) {
    const f = set.italics[weight === 400 ? 400 : 700];
    if (f) return f;
  }
  return set.fonts[weight];
}

export function measure(text: string, size: number, weight: Weight = 400, italic = false): number {
  const f = face(weight, italic);
  return (f.layout(text).advanceWidth / f.unitsPerEm) * size;
}

/** Distance from a line's visual centre (cap-height centre) to its baseline. */
export function baselineOffset(size: number, weight: Weight = 400): number {
  const f = loadFonts().fonts[weight];
  const cap = (f.capHeight || f.unitsPerEm * 0.7) / f.unitsPerEm;
  return (cap * size) / 2;
}

export function wrap(text: string, size: number, weight: Weight, maxWidth: number, italic = false): string[] {
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(/\s+/).filter(Boolean);
    let line = '';
    for (const w of words) {
      const next = line ? `${line} ${w}` : w;
      if (line && measure(next, size, weight, italic) > maxWidth) {
        lines.push(line);
        line = w;
      } else line = next;
    }
    lines.push(line);
  }
  return lines;
}

/** Text as SVG path data with its baseline at y. */
export function textPath(text: string, x: number, y: number, size: number, weight: Weight, italic = false): string {
  const f = face(weight, italic);
  const run = f.layout(text);
  const s = size / f.unitsPerEm;
  let pen = 0;
  const parts: string[] = [];
  run.glyphs.forEach((g, i) => {
    const pos = run.positions[i];
    const gx = x + (pen + pos.xOffset) * s;
    const gy = y - pos.yOffset * s;
    const d = g.path.scale(s, -s).translate(gx, gy).toSVG();
    if (d) parts.push(d);
    pen += pos.xAdvance;
  });
  return parts.join('');
}

/** Lines of a connector label: explicit "\n" breaks, long lines wrapped at ~150px. */
export function labelLines(label: string, size: number, maxWidth = 150): string[] {
  return label.split('\n').flatMap((l) => wrap(l, size, 700, maxWidth));
}
