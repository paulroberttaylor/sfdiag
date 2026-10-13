import type { ConnectionInput, DiagramInput, NodeInput } from './schema.js';
import { resolveIcon, type ResolvedIcon } from './catalog.js';
import { measure, wrap } from './text.js';
import { theme } from './theme.js';

const C = theme.card;
const K = theme.container;
const X = theme.connector;
const H = theme.header;

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface LNode extends Box {
  id: string;
  input: NodeInput;
  parent?: LNode;
  children: LNode[];
  framed: boolean;
  icon?: ResolvedIcon;
  footerIcons: ResolvedIcon[];
  titleLines: string[];
  titleCenter: number; // relative y of first title line centre
  attrLines: string[];
  textX: number; // relative x of title / attributes
  ruleY: number; // relative y of the title rule
  bodyX: number; // relative x of the children block
  bodyY: number; // relative y of the children block
  attrY: number; // relative y of first attribute centre
  footerY: number; // relative y of footer band top (or icons row when no band)
  // natural size
  nw: number;
  nh: number;
  blockW: number;
  blockH: number;
  /** gaps between consecutive children (row/column) or uniform gap (grid) */
  gaps: number[];
}

export interface KeyEntry {
  label: string;
  icon?: ResolvedIcon;
  line?: 'solid' | 'dashed' | 'dotted';
  color?: string;
}

export interface HeaderLayout extends Box {
  logo?: ResolvedIcon;
  titleLines: string[];
  descLines: string[];
  titleX: number;
  titleY: number; // first title line centre
  descY: number; // first description line centre
  bulgeX: number;
  arcR: number;
  key?: { box: Box; cols: number; rows: number; colW: number; rowH: number; top: number; entries: KeyEntry[] };
}

export interface Layout {
  width: number;
  height: number;
  header: HeaderLayout;
  root: LNode;
  nodes: Map<string, LNode>;
  connections: ConnectionInput[];
  input: DiagramInput;
}

export interface LayoutOptions {
  iconDirs?: string[];
}

function icon(ref: string | undefined, opts: LayoutOptions): ResolvedIcon | undefined {
  if (!ref) return undefined;
  const r = resolveIcon(ref, opts.iconDirs);
  if (!r) throw new Error(`unknown icon "${ref}"`);
  return r;
}

function build(input: NodeInput, parent: LNode | undefined, nodes: Map<string, LNode>, opts: LayoutOptions): LNode {
  const n: LNode = {
    id: input.id,
    input,
    parent,
    children: [],
    framed: input.frame !== 'none',
    icon: icon(input.icon, opts),
    footerIcons: (input.footerIcons ?? []).map((r) => icon(r, opts)!),
    titleLines: [],
    titleCenter: 0,
    attrLines: [],
    textX: 0,
    ruleY: 0,
    bodyX: 0,
    bodyY: 0,
    attrY: 0,
    footerY: 0,
    nw: 0,
    nh: 0,
    blockW: 0,
    blockH: 0,
    gaps: [],
    x: 0,
    y: 0,
    w: 0,
    h: 0,
  };
  nodes.set(n.id, n);
  n.children = (input.children ?? []).map((c) => build(c, n, nodes, opts));
  return n;
}

function kidsAreLeaves(n: LNode): boolean {
  return n.children.every((c) => c.framed && !c.children.length);
}

export function ancestors(n: LNode): LNode[] {
  const out: LNode[] = [];
  for (let p = n.parent; p; p = p.parent) out.push(p);
  return out;
}

function childIndexContaining(parent: LNode, n: LNode): number {
  let cur: LNode | undefined = n;
  while (cur && cur.parent !== parent) cur = cur.parent;
  return cur ? parent.children.indexOf(cur) : -1;
}

/** Gap needed between children i and i+1 of `parent`, given the connections crossing it. */
function crossingGaps(parent: LNode, axis: 'x' | 'y', base: number, edges: ConnectionInput[], nodes: Map<string, LNode>): number[] {
  const gaps = parent.children.slice(1).map(() => base);
  for (const e of edges) {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    if (!a || !b) continue;
    const ia = childIndexContaining(parent, a);
    const ib = childIndexContaining(parent, b);
    if (ia < 0 || ib < 0 || ia === ib) continue;
    const pill = e.label ? measure(e.label, X.pillSize, 700) + 2 * X.pillPadX : 0;
    const step = e.step ? X.stepSize + 6 : 0;
    const need =
      axis === 'x'
        ? Math.max(2 * X.clearance + 24, pill + step + 2 * X.labelGap)
        : Math.max(2 * X.clearance + 20, e.label || e.step ? X.pillHeight + 2 * X.labelGap : 0);
    for (let i = Math.min(ia, ib); i < Math.max(ia, ib); i++) gaps[i] = Math.max(gaps[i], need);
  }
  return gaps;
}

function measureNode(n: LNode, edges: ConnectionInput[], nodes: Map<string, LNode>, isRoot = false): void {
  for (const c of n.children) measureNode(c, edges, nodes);
  const inp = n.input;
  const layoutKind = inp.layout ?? (isRoot ? 'column' : 'row');
  const baseGap = inp.gap ?? (isRoot ? theme.canvas.topGap : K.gap);

  // children block
  let bw = 0;
  let bh = 0;
  if (n.children.length) {
    if (layoutKind === 'grid') {
      const cols = Math.min(inp.columns ?? Math.ceil(Math.sqrt(n.children.length)), n.children.length);
      const cw = Math.max(...n.children.map((c) => c.nw));
      const rows = Math.ceil(n.children.length / cols);
      let total = 0;
      for (let r = 0; r < rows; r++) total += Math.max(...n.children.slice(r * cols, r * cols + cols).map((c) => c.nh));
      n.gaps = [baseGap];
      bw = cols * cw + (cols - 1) * baseGap;
      bh = total + (rows - 1) * baseGap;
    } else if (layoutKind === 'row') {
      const allLeaves = n.children.every((c) => !c.children.length && c.framed);
      if (allLeaves) {
        const m = Math.max(...n.children.map((c) => c.nw));
        for (const c of n.children) c.nw = m;
      }
      n.gaps = crossingGaps(n, 'x', baseGap, edges, nodes);
      bw = n.children.reduce((s, c) => s + c.nw, 0) + n.gaps.reduce((s, g) => s + g, 0);
      bh = Math.max(...n.children.map((c) => c.nh));
    } else {
      n.gaps = crossingGaps(n, 'y', baseGap, edges, nodes);
      bw = Math.max(...n.children.map((c) => c.nw));
      bh = n.children.reduce((s, c) => s + c.nh, 0) + n.gaps.reduce((s, g) => s + g, 0);
    }
  }
  n.blockW = bw;
  n.blockH = bh;

  if (!n.framed) {
    n.nw = Math.max(bw, inp.width ?? 0);
    n.nh = Math.max(bh, inp.height ?? 0);
    return;
  }

  // header: icon + title + rule
  n.textX = n.icon ? C.iconTop + C.icon + 12 : C.pad;
  n.titleLines = inp.title ? wrap(inp.title, C.titleSize, 700, inp.width ? Math.max(inp.width - n.textX - 16, 60) : C.maxTitleWidth) : [];
  const tl = Math.max(n.titleLines.length, 1);
  n.titleCenter = n.icon ? Math.max(C.titleCenterY - ((tl - 1) * C.titleLineHeight) / 2, 18) : C.titleCenterY;
  n.ruleY = n.titleCenter + (tl - 1) * C.titleLineHeight + C.ruleGap;
  const titleW = Math.max(0, ...n.titleLines.map((l) => measure(l, C.titleSize, 700)));

  n.attrLines = inp.attributes ?? [];
  const attrW = Math.max(0, ...n.attrLines.map((l) => measure(l, C.attrSize, 400)));
  n.attrY = n.ruleY + C.attrFirstGap;
  const attrBottom = n.attrLines.length ? n.attrY + (n.attrLines.length - 1) * C.attrLineHeight : 0;
  const footerTextW = inp.footer ? measure(inp.footer, C.footerSize, 400) + 30 : 0;
  const footerIconsW = n.footerIcons.length * C.footerIcon + (n.footerIcons.length - 1) * C.footerIconGap + 2 * C.pad;
  const iconBottom = n.icon ? C.iconTop + C.icon + 10 : 0;

  let contentW: number;
  let base: number;
  if (n.children.length) {
    const attrColW = n.attrLines.length ? attrW + K.attrColumnGap : 0;
    n.bodyX = n.attrLines.length ? n.textX + attrColW : K.pad;
    n.bodyY = n.ruleY + K.bodyGap;
    const attrH = n.attrLines.length ? (n.attrLines.length - 1) * C.attrLineHeight + 10 : 0;
    n.attrY = n.bodyY + 5;
    contentW = n.bodyX + bw + K.pad;
    base = n.bodyY + Math.max(bh, attrH) + K.bottomPad;
    if (inp.footer || n.footerIcons.length) base += 14;
  } else {
    contentW = n.textX + Math.max(titleW, attrW) + 20;
    base = n.attrLines.length ? attrBottom + 27 : n.ruleY + 20;
    if (inp.footer || n.footerIcons.length) base = n.attrLines.length ? attrBottom + (inp.footer ? 20 : 12) : n.ruleY + (inp.footer ? 14 : 8);
  }
  base = Math.max(base, iconBottom);
  n.footerY = base;
  if (inp.footer) base += C.footerBandHeight;
  if (n.footerIcons.length) base += C.footerIconPadY * 2 + C.footerIcon;
  else if (inp.footer) base += 10;

  n.nw = Math.max(C.minWidth, inp.width ?? 0, contentW, n.textX + titleW + 20, footerTextW, footerIconsW);
  n.nh = Math.max(base, inp.height ?? 0);
}

function place(n: LNode, x: number, y: number, w: number, h: number, isRoot = false): void {
  n.x = x;
  n.y = y;
  n.w = w;
  n.h = h;
  if (!n.children.length) return;
  const inp = n.input;
  const layoutKind = inp.layout ?? (isRoot ? 'column' : 'row');
  // rows of plain cards share the width; rows holding containers keep natural widths and
  // give the spare room to the gaps, where connectors run (as in the reference diagrams)
  const justify = inp.justify ?? (kidsAreLeaves(n) ? 'stretch' : 'space-between');
  const bx = x + n.bodyX;
  const by = y + n.bodyY;
  const bw = n.framed ? w - n.bodyX - K.pad : w;
  const bh = n.framed ? n.blockH : h;
  const kids = n.children;

  if (layoutKind === 'grid') {
    const cols = Math.min(inp.columns ?? Math.ceil(Math.sqrt(kids.length)), kids.length);
    const gap = n.gaps[0];
    const colW = (bw - (cols - 1) * gap) / cols;
    let cy = by;
    for (let r = 0; r * cols < kids.length; r++) {
      const row = kids.slice(r * cols, r * cols + cols);
      const rh = Math.max(...row.map((c) => c.nh));
      row.forEach((c, i) => place(c, bx + i * (colW + gap), cy, colW, rh));
      cy += rh + gap;
    }
    return;
  }

  const horizontal = layoutKind === 'row';
  const natural = horizontal ? n.blockW : n.blockH;
  const avail = horizontal ? bw : bh;
  const extra = Math.max(0, avail - natural);
  const gaps = [...n.gaps];
  let offset = 0;
  let grow = 0;
  if (horizontal && justify === 'stretch') grow = extra / kids.length;
  else if (justify === 'center') offset = extra / 2;
  else if (justify === 'space-between' && kids.length > 1) gaps.forEach((_, i) => (gaps[i] += extra / (kids.length - 1)));

  let cur = (horizontal ? bx : by) + offset;
  kids.forEach((c, i) => {
    if (horizontal) {
      place(c, cur, by, c.nw + grow, Math.max(bh, c.nh));
      cur += c.nw + grow + (gaps[i] ?? 0);
    } else {
      place(c, bx, cur, Math.max(bw, c.nw), c.nh);
      cur += c.nh + (gaps[i] ?? 0);
    }
  });
}

function keyEntries(input: DiagramInput, nodes: Map<string, LNode>, opts: LayoutOptions): KeyEntry[] {
  if (input.key === 'none') return [];
  const labels = input.keyLabels ?? {};
  if (Array.isArray(input.key)) {
    return input.key.map((k) => ({ label: k.label, icon: icon(k.icon, opts), line: k.line, color: k.color }));
  }
  const out: KeyEntry[] = [];
  const seen = new Set<string>();
  for (const n of nodes.values()) {
    for (const ic of n.footerIcons) {
      if (seen.has(ic.id)) continue;
      seen.add(ic.id);
      out.push({ label: labels[ic.id] ?? ic.label, icon: ic });
    }
  }
  for (const [id, label] of Object.entries(labels)) {
    if (seen.has(id) || ['solid', 'dashed', 'dotted'].includes(id)) continue;
    const ic = resolveIcon(id, opts.iconDirs);
    if (ic) {
      seen.add(id);
      out.push({ label, icon: ic });
    }
  }
  const styles = new Set((input.connections ?? []).map((c) => c.style ?? 'solid'));
  const defaults: Record<string, string> = { solid: 'Synchronous', dashed: 'Asynchronous', dotted: 'Optional' };
  const nonSolid = [...styles].filter((s) => s !== 'solid');
  if (nonSolid.length || labels.solid) {
    for (const s of ['solid', 'dashed', 'dotted'] as const) {
      if (styles.has(s)) out.push({ label: labels[s] ?? defaults[s], line: s });
    }
  }
  return out;
}

function layoutHeader(input: DiagramInput, width: number, entries: KeyEntry[], opts: LayoutOptions): HeaderLayout {
  const titleAreaW = Math.min(Math.max(width * 0.42, 320), 560);
  const logo = icon(input.logo, opts);
  const titleLines = wrap(input.title, H.titleSize, 400, titleAreaW);
  const descLines = input.description ? wrap(input.description, H.descSize, 400, titleAreaW) : [];
  const logoH = logo ? 44 : 0;
  const titleLH = H.titleSize * 1.3;
  const textH = H.padY * 2 + logoH + titleLines.length * titleLH + (descLines.length ? 10 + descLines.length * H.descLineHeight : 0);

  let key: HeaderLayout['key'];
  const bulgeMin = H.padX + titleAreaW + 40;
  let keyH = 0;
  if (entries.length) {
    const colW = Math.max(...entries.map((e) => (e.icon ? H.keyIcon : 30) + 10 + measure(e.label, H.keyLabelSize, 400)));
    const availW = width - bulgeMin - 50 - H.keyInset;
    const fit = Math.max(1, Math.floor((availW - 2 * H.keyPad + H.keyColGap) / (colW + H.keyColGap)));
    // like the official keys: stack up to three entries per column, then add columns
    let rows = Math.min(entries.length, 3);
    let cols = Math.ceil(entries.length / rows);
    while (cols > fit && cols > 1) cols = Math.ceil(entries.length / ++rows);
    rows = Math.ceil(entries.length / cols);
    keyH = 2 * H.keyPad + H.keyIcon + (rows - 1) * H.keyRowHeight;
    const contentW = 2 * H.keyPad + cols * colW + (cols - 1) * H.keyColGap;
    const kw = Math.max(contentW, Math.min(availW, width * 0.38));
    key = { box: { x: width - H.keyInset - kw, y: H.keyInset, w: kw, h: keyH }, cols, rows, colW: (kw - 2 * H.keyPad - (cols - 1) * H.keyColGap) / cols, rowH: H.keyRowHeight, top: H.keyPad, entries };
  }
  const h = Math.max(H.minHeight, textH, keyH + 2 * H.keyInset);
  if (key) {
    // the key panel fills the band's height; rows spread out to use it
    key.box.h = h - 2 * H.keyInset;
    const inner = key.box.h - 2 * H.keyPad - H.keyIcon;
    key.rowH = key.rows > 1 ? Math.min(H.keyRowHeight * 1.5, inner / (key.rows - 1)) : 0;
    key.top = (key.box.h - H.keyIcon - (key.rows - 1) * key.rowH) / 2;
  }
  const contentTop = (h - (textH - 2 * H.padY)) / 2;
  const titleY = contentTop + logoH + titleLH / 2;
  return {
    x: 0,
    y: 0,
    w: width,
    h,
    logo,
    key,
    titleLines,
    descLines,
    titleX: H.padX,
    titleY,
    descY: titleY + (titleLines.length - 1) * titleLH + titleLH / 2 + 10 + H.descLineHeight / 2,
    bulgeX: key ? Math.min(Math.max(bulgeMin, width * 0.5), key.box.x - 40) : Math.max(bulgeMin, width * 0.5),
    arcR: h * 0.8,
  };
}

export function layoutDiagram(input: DiagramInput, opts: LayoutOptions = {}): Layout {
  const nodes = new Map<string, LNode>();
  const rootInput: NodeInput = {
    id: '__root',
    frame: 'none',
    layout: input.layout ?? 'column',
    columns: input.columns,
    gap: input.gap,
    children: input.nodes,
  };
  const root = build(rootInput, undefined, nodes, opts);
  nodes.delete('__root');
  const edges = input.connections ?? [];
  measureNode(root, edges, nodes, true);

  const m = theme.canvas.margin;
  const entries = keyEntries(input, nodes, opts);
  // the header needs room for the title block plus the key panel
  const keyNeed = entries.length
    ? 2 * H.keyPad + Math.min(entries.length, 4) * (Math.max(...entries.map((e) => 42 + measure(e.label, H.keyLabelSize, 400))) + H.keyColGap)
    : 0;
  const headerMin = H.padX + 360 + 90 + keyNeed + H.keyInset;
  const width = Math.ceil(Math.max(input.width ?? 0, root.nw + 2 * m, headerMin, 900));
  const header = layoutHeader(input, width, entries, opts);
  const top = header.h + theme.canvas.headerGap;
  place(root, m, top, width - 2 * m, root.nh, true);
  const height = Math.ceil(top + root.nh + m + 8);
  return { width, height, header, root, nodes, connections: edges, input };
}
