#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { Command } from 'commander';
import { catalog } from './catalog.js';
import { compile, iconDirsFor, type CompileOptions } from './index.js';
import { svgToPng } from './png.js';
import { jsonSchema } from './schema.js';
import type { TextMode } from './render.js';
import type { Issue, ValidationResult } from './validate.js';

const program = new Command();
program.name('sfdiag').description('Salesforce Well-Architected style diagrams as code').version('0.1.0');

function read(file: string): string {
  return fs.readFileSync(file, 'utf8');
}

function fmt(i: Issue, file: string): string {
  const loc = i.line ? `${file}:${i.line}` : file;
  return `${loc}  ${i.path || '(root)'}: ${i.message}${i.hint ? `\n    hint: ${i.hint}` : ''}`;
}

function report(v: ValidationResult, file: string, json: boolean): void {
  if (json) {
    process.stdout.write(JSON.stringify({ ok: v.ok, errors: v.errors, warnings: v.warnings }, null, 2) + '\n');
    return;
  }
  for (const e of v.errors) console.error(`error  ${fmt(e, file)}`);
  for (const w of v.warnings) console.error(`warn   ${fmt(w, file)}`);
  if (v.ok) console.error(`ok     ${file}${v.warnings.length ? ` (${v.warnings.length} warning(s))` : ''}`);
}

interface Common {
  icons?: string[];
  fonts?: string;
  json?: boolean;
}

function opts(file: string, o: Common & { text?: TextMode }): CompileOptions {
  return { baseDir: path.dirname(path.resolve(file)), iconDirs: o.icons, fontDir: o.fonts, text: o.text };
}

program
  .command('validate')
  .description('Check diagram files; exits 1 on errors. Use --json for machine-readable output.')
  .argument('<files...>')
  .option('--json', 'JSON output')
  .option('--icons <dir...>', 'extra icon override directories')
  .action((files: string[], o: Common) => {
    let failed = false;
    for (const f of files) {
      const r = compile(read(f), opts(f, o));
      report(r.validation, f, !!o.json);
      if (!r.validation.ok) failed = true;
    }
    process.exitCode = failed ? 1 : 0;
  });

program
  .command('render')
  .description('Render diagram(s) to SVG (default) and/or PNG next to the source file.')
  .argument('<files...>')
  .option('-o, --out <path>', 'output file (single input) or directory')
  .option('--png', 'also write a PNG')
  .option('--png-only', 'write only a PNG')
  .option('--scale <n>', 'PNG scale factor', '2')
  .option('--text <mode>', 'embed (fonts embedded) | paths (text as outlines) | plain', 'embed')
  .option('--icons <dir...>', 'extra icon override directories')
  .option('--fonts <dir>', 'directory with Regular/SemiBold/Bold .ttf files (e.g. Salesforce Sans)')
  .option('--json', 'JSON validation output')
  .action((files: string[], o: Common & { out?: string; png?: boolean; pngOnly?: boolean; scale: string; text: TextMode }) => {
    let failed = false;
    for (const f of files) {
      const r = compile(read(f), opts(f, o));
      report(r.validation, f, !!o.json);
      if (!r.svg) {
        failed = true;
        continue;
      }
      const base = f.replace(/\.(ya?ml|json)$/i, '');
      let outBase = base;
      if (o.out) {
        const isDir = files.length > 1 || (fs.existsSync(o.out) && fs.statSync(o.out).isDirectory());
        outBase = isDir ? path.join(o.out, path.basename(base)) : o.out.replace(/\.(svg|png)$/i, '');
        fs.mkdirSync(path.dirname(outBase), { recursive: true });
      }
      if (!o.pngOnly) {
        fs.writeFileSync(`${outBase}.svg`, r.svg);
        console.error(`wrote  ${outBase}.svg`);
      }
      if (o.png || o.pngOnly) {
        fs.writeFileSync(`${outBase}.png`, svgToPng(r.svg, Number(o.scale)));
        console.error(`wrote  ${outBase}.png`);
      }
    }
    process.exitCode = failed ? 1 : 0;
  });

program
  .command('export-lucid')
  .description('Export to a Lucid Standard Import (.lucid) file, editable in Lucidchart.')
  .argument('<file>')
  .option('-o, --out <path>', 'output .lucid path')
  .option('--icons <dir...>', 'extra icon override directories')
  .action(async (file: string, o: Common & { out?: string }) => {
    const r = compile(read(file), opts(file, o));
    report(r.validation, file, false);
    if (!r.layout) {
      process.exitCode = 1;
      return;
    }
    const { exportLucid } = await import('./lucid.js');
    const out = o.out ?? file.replace(/\.(ya?ml|json)$/i, '') + '.lucid';
    fs.writeFileSync(out, await exportLucid(r.layout));
    console.error(`wrote  ${out}`);
  });

program
  .command('catalog')
  .description('List icon ids (with aliases). Use --json for tooling / LLM context.')
  .option('--json', 'JSON output')
  .option('--icons <dir...>', 'extra icon override directories')
  .action((o: Common) => {
    const local = iconDirsFor({ iconDirs: o.icons, baseDir: process.cwd() }).flatMap((d) =>
      fs.readdirSync(d).filter((f) => f.endsWith('.svg')).map((f) => f.slice(0, -4)),
    );
    if (o.json) {
      const out = Object.fromEntries(Object.entries(catalog).map(([id, d]) => [id, { label: d.label, aliases: d.aliases ?? [] }]));
      process.stdout.write(JSON.stringify({ icons: out, localOverrides: local, slds: 'any SLDS utility icon as "slds:<name>" or "slds:<name>/<colour>"' }, null, 2) + '\n');
      return;
    }
    for (const [id, d] of Object.entries(catalog)) {
      console.log(`${id.padEnd(22)} ${d.label}${d.aliases?.length ? `  (aliases: ${d.aliases.join(', ')})` : ''}`);
    }
    if (local.length) console.log(`\nlocal overrides: ${local.join(', ')}`);
    console.log('\nAny SLDS utility glyph: "slds:<name>" or "slds:<name>/<colour>", e.g. slds:knowledge_base/teal');
  });

program
  .command('schema')
  .description('Print the JSON Schema for diagram files.')
  .action(() => {
    process.stdout.write(JSON.stringify(jsonSchema(), null, 2) + '\n');
  });

program.parseAsync();
