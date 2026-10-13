import fs from 'node:fs';
import path from 'node:path';
import { compile } from '../src/index.js';
import { routeAll } from '../src/route.js';

export const examplesDir = path.resolve(__dirname, '..', 'examples');
export const exampleFiles = fs.readdirSync(examplesDir).filter((f) => f.endsWith('.yaml'));

export function compileExample(file: string) {
  const r = compile(fs.readFileSync(path.join(examplesDir, file), 'utf8'), { baseDir: examplesDir });
  if (!r.layout) throw new Error(`${file}: ${JSON.stringify(r.validation.errors)}`);
  return { ...r, layout: r.layout, routes: routeAll(r.layout) };
}
