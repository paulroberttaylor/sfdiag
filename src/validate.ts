import YAML from 'yaml';
import { Diagram, type DiagramInput, type NodeInput } from './schema.js';
import { iconIds, resolveIcon } from './catalog.js';
import { palette } from './theme.js';

export interface Issue {
  path: string;
  message: string;
  hint?: string;
  line?: number;
}

export interface ValidationResult {
  ok: boolean;
  diagram?: DiagramInput;
  errors: Issue[];
  warnings: Issue[];
}

function lev(a: string, b: string): number {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

export function suggest(word: string, options: string[], n = 3): string[] {
  const w = word.toLowerCase();
  return options
    .map((o) => ({ o, d: o.includes(w) || w.includes(o) ? 1 : lev(w, o.toLowerCase()) }))
    .filter((x) => x.d <= Math.max(2, Math.floor(w.length / 2)))
    .sort((a, b) => a.d - b.d)
    .slice(0, n)
    .map((x) => x.o);
}

function pathString(p: PropertyKey[]): string {
  return p.reduce<string>((s, k) => (typeof k === 'number' ? `${s}[${k}]` : s ? `${s}.${String(k)}` : String(k)), '');
}

function lineOf(doc: YAML.Document.Parsed, lc: YAML.LineCounter, path: PropertyKey[]): number | undefined {
  for (let i = path.length; i >= 0; i--) {
    const node = doc.getIn(path.slice(0, i) as (string | number)[], true) as { range?: [number, number, number] } | undefined;
    if (node && typeof node === 'object' && node.range) return lc.linePos(node.range[0]).line;
  }
  return undefined;
}

export function validateSource(src: string, opts: { iconDirs?: string[] } = {}): ValidationResult {
  const errors: Issue[] = [];
  const warnings: Issue[] = [];
  const lc = new YAML.LineCounter();
  const doc = YAML.parseDocument(src, { lineCounter: lc, uniqueKeys: true });
  for (const e of doc.errors) {
    errors.push({ path: '', message: e.message.split('\n')[0], line: e.linePos?.[0]?.line, hint: 'Fix the YAML syntax first.' });
  }
  if (errors.length) return { ok: false, errors, warnings };

  const parsed = Diagram.safeParse(doc.toJS());
  if (!parsed.success) {
    for (const iss of parsed.error.issues) {
      const p = pathString(iss.path);
      let hint: string | undefined;
      if (iss.code === 'unrecognized_keys') {
        const known = ['shape', 'class', 'bullets', 'badge', 'align', 'reverse', 'classes', 'header', 'lineColor', 'road', 'eyebrow', 'band', 'id', 'title', 'icon', 'attributes', 'footer', 'footerIcons', 'color', 'fill', 'frame', 'layout', 'columns', 'gap', 'justify', 'width', 'height', 'children', 'from', 'to', 'label', 'style', 'arrow', 'step', 'fromSide', 'toSide', 'description', 'logo', 'key', 'keyLabels', 'nodes', 'connections'];
        hint = iss.keys.map((k) => `"${k}"${suggest(k, known, 1).length ? ` → did you mean "${suggest(k, known, 1)[0]}"?` : ' is not allowed'}`).join('; ');
      }
      errors.push({ path: p, message: iss.message, hint, line: lineOf(doc, lc, iss.path) });
    }
    return { ok: false, errors, warnings };
  }
  const d = parsed.data;

  // semantic checks
  const ids = new Map<string, string>();
  const allIcons = iconIds();
  const checkIcon = (ref: string, p: (string | number)[]) => {
    if (resolveIcon(ref, opts.iconDirs)) return;
    const s = suggest(ref, allIcons);
    errors.push({
      path: pathString(p),
      message: `unknown icon "${ref}"`,
      hint: (s.length ? `did you mean ${s.map((x) => `"${x}"`).join(', ')}? ` : '') + 'Run `sfdiag catalog` for the list, or use "slds:<utility-icon-name>".',
      line: lineOf(doc, lc, p),
    });
  };
  const walk = (nodes: NodeInput[], base: (string | number)[]) => {
    nodes.forEach((n, i) => {
      const p = [...base, i];
      if (ids.has(n.id)) errors.push({ path: pathString([...p, 'id']), message: `duplicate id "${n.id}"`, hint: `already used at ${ids.get(n.id)}; ids must be unique across the whole diagram`, line: lineOf(doc, lc, [...p, 'id']) });
      else ids.set(n.id, pathString(p));
      if (n.frame !== 'none' && !n.title) errors.push({ path: pathString(p), message: `card "${n.id}" needs a title`, hint: 'add title, or set frame: none for an invisible layout group', line: lineOf(doc, lc, p) });
      if (n.icon) checkIcon(n.icon, [...p, 'icon']);
      if (n.badge) checkIcon(n.badge, [...p, 'badge']);
      if (n.class && !d.classes?.[n.class]) {
        const s = suggest(n.class, Object.keys(d.classes ?? {}));
        errors.push({ path: pathString([...p, 'class']), message: `unknown class "${n.class}"`, hint: s.length ? `did you mean "${s[0]}"?` : 'define it under the top-level `classes:` map', line: lineOf(doc, lc, [...p, 'class']) });
      }
      if (n.shape && n.shape !== 'card' && n.children?.length) errors.push({ path: pathString(p), message: `a ${n.shape} cannot have children`, line: lineOf(doc, lc, p) });
      n.footerIcons?.forEach((f, j) => checkIcon(f, [...p, 'footerIcons', j]));
      if (n.layout === 'grid' && !n.columns) warnings.push({ path: pathString(p), message: 'grid without columns; defaulting to a square grid' });
      if (n.frame === 'none' && (n.icon || n.attributes || n.footer)) warnings.push({ path: pathString(p), message: 'icon/attributes/footer are ignored on frame: none groups' });
      if (n.frame === 'none' && !n.children?.length) errors.push({ path: pathString(p), message: `group "${n.id}" has no children`, line: lineOf(doc, lc, p) });
      if (n.title && n.title.length > 40) warnings.push({ path: pathString([...p, 'title']), message: 'long card title; keep titles short so they read at a glance' });
      n.attributes?.forEach((a, j) => {
        if (j > 0 && /^[a-z]/.test(a.trim()))
          warnings.push({
            path: pathString([...p, 'attributes', j]),
            message: `attribute "${a}" starts lower-case; was a comma inside an unquoted item split it?`,
            hint: 'quote items that contain commas: ["Program, member, partner management"]',
            line: lineOf(doc, lc, [...p, 'attributes', j]),
          });
      });
      if ((n.attributes?.length ?? 0) > 8) warnings.push({ path: pathString([...p, 'attributes']), message: 'more than 8 attributes; consider splitting the card' });
      for (const c of [n.color, n.fill]) if (c && !c.startsWith('#') && !palette[c]) errors.push({ path: pathString(p), message: `unknown colour "${c}"`, hint: `palette: ${Object.keys(palette).join(', ')}` });
      if (n.children) walk(n.children, [...p, 'children']);
    });
  };
  walk(d.nodes ?? [], ['nodes']);
  d.swimlanes?.lanes.forEach((lane, li) => walk(lane.steps, ['swimlanes', 'lanes', li, 'steps']));
  d.timeline?.lanes.forEach((lane, li) => {
    walk(lane.items as NodeInput[], ['timeline', 'lanes', li, 'items']);
    lane.items.forEach((it, ii) => {
      for (const end of ['from', 'to'] as const) {
        const v = it[end];
        if (typeof v !== 'string' || d.timeline!.periods.some((p) => p.toLowerCase() === v.toLowerCase())) continue;
        const s = suggest(v, d.timeline!.periods);
        errors.push({
          path: pathString(['timeline', 'lanes', li, 'items', ii, end]),
          message: `unknown period "${v}"`,
          hint: s.length ? `did you mean "${s[0]}"?` : `periods: ${d.timeline!.periods.join(', ')} (or a number such as 1.5)`,
          line: lineOf(doc, lc, ['timeline', 'lanes', li, 'items', ii, end]),
        });
      }
    });
  });
  if (d.logo) checkIcon(d.logo, ['logo']);
  if (Array.isArray(d.key)) d.key.forEach((k, i) => k.icon && checkIcon(k.icon, ['key', i, 'icon']));

  const parentOf = new Map<string, string | undefined>();
  const mapParents = (nodes: NodeInput[], parent?: string) => nodes.forEach((n) => (parentOf.set(n.id, parent), n.children && mapParents(n.children, n.id)));
  mapParents(d.nodes ?? []);
  const checkAlign = (nodes: NodeInput[], base: (string | number)[]) =>
    nodes.forEach((n, i) => {
      const p = [...base, i];
      if (n.alignWith && !ids.has(n.alignWith)) {
        const s = suggest(n.alignWith, [...ids.keys()]);
        errors.push({ path: pathString([...p, 'alignWith']), message: `alignWith unknown node "${n.alignWith}"`, hint: s.length ? `did you mean "${s[0]}"?` : undefined, line: lineOf(doc, lc, [...p, 'alignWith']) });
      }
      if (n.alignWith === n.id) errors.push({ path: pathString([...p, 'alignWith']), message: 'a node cannot align with itself', line: lineOf(doc, lc, [...p, 'alignWith']) });
      if (n.children) checkAlign(n.children, [...p, 'children']);
    });
  checkAlign(d.nodes ?? [], ['nodes']);
  (d.connections ?? []).forEach((c, i) => {
    for (const end of ['from', 'to'] as const) {
      if (!ids.has(c[end])) {
        const s = suggest(c[end], [...ids.keys()]);
        errors.push({
          path: pathString(['connections', i, end]),
          message: `connection ${end} unknown node "${c[end]}"`,
          hint: s.length ? `did you mean ${s.map((x) => `"${x}"`).join(', ')}?` : `known ids: ${[...ids.keys()].join(', ')}`,
          line: lineOf(doc, lc, ['connections', i, end]),
        });
      }
    }
    if (c.from === c.to) errors.push({ path: pathString(['connections', i]), message: 'connection from a node to itself', line: lineOf(doc, lc, ['connections', i]) });
    for (let p = parentOf.get(c.to); p; p = parentOf.get(p)) if (p === c.from) warnings.push({ path: pathString(['connections', i]), message: `"${c.from}" contains "${c.to}"; connecting a container to its own child rarely reads well` });
    if (c.color && !c.color.startsWith('#') && !palette[c.color]) errors.push({ path: pathString(['connections', i, 'color']), message: `unknown colour "${c.color}"` });
  });
  const styles = new Set((d.connections ?? []).map((c) => c.style ?? 'solid'));
  if (styles.size > 1 && d.key === 'none') warnings.push({ path: 'key', message: 'several line styles are used but the key is disabled; readers cannot tell what they mean' });

  return { ok: errors.length === 0, diagram: errors.length ? undefined : d, errors, warnings };
}
