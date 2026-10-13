import fs from 'node:fs';
import path from 'node:path';
import { layoutDiagram, type Layout } from './layout.js';
import { renderSvg, type TextMode } from './render.js';
import { validateSource, type ValidationResult } from './validate.js';
import { loadFonts } from './text.js';

export { validateSource } from './validate.js';
export { layoutDiagram } from './layout.js';
export { renderSvg } from './render.js';
export { svgToPng } from './png.js';
export { catalog } from './catalog.js';
export { jsonSchema } from './schema.js';

export interface CompileOptions {
  /** directory of the diagram file; `<dir>/icons` is searched for icon overrides */
  baseDir?: string;
  iconDirs?: string[];
  fontDir?: string;
  text?: TextMode;
}

export interface CompileResult {
  validation: ValidationResult;
  layout?: Layout;
  svg?: string;
}

export function iconDirsFor(opts: CompileOptions): string[] {
  const dirs = [...(opts.iconDirs ?? [])];
  if (opts.baseDir) dirs.push(path.join(opts.baseDir, 'icons'));
  return dirs.filter((d) => fs.existsSync(d));
}

export function compile(src: string, opts: CompileOptions = {}): CompileResult {
  if (opts.fontDir) loadFonts(opts.fontDir);
  const iconDirs = iconDirsFor(opts);
  const validation = validateSource(src, { iconDirs });
  if (!validation.ok || !validation.diagram) return { validation };
  const layout = layoutDiagram(validation.diagram, { iconDirs });
  const { svg } = renderSvg(layout, { text: opts.text });
  return { validation, layout, svg };
}
