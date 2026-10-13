import type { ConnectionInput, DiagramInput, NodeInput } from './schema.js';
import { resolveColor } from './theme.js';
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
  attrDX: number[]; // per attribute line: x offset from textX (bullet continuation indent)
  attrDY: number[]; // per attribute line: y offset from attrY
  italicAttrs: boolean;
  shape: 'card' | 'decision' | 'pill' | 'note';
  fill: string;
  stroke: string;
  titleColor: string;
  badge?: ResolvedIcon;
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
  chip?: { fill: string; stroke: string; text: string };
  line?: 'solid' | 'dashed' | 'dotted';
  color?: string;
}

export interface HeaderLayout extends Box {
  logo?: ResolvedIcon;
  eyebrow?: string;
  eyebrowY: number;
  titleWeight: 400 | 700;
  band: string;
  color: string;
  titleLines: string[];
  descLines: string[];
  titleX: number;
  titleY: number; // first title line centre
  descY: number; // first description line centre
  bulgeX: number;
  arcR: number;
  key?: {
    box: Box;
    rows: number;
    rowH: number;
    top: number;
    entries: KeyEntry[];
    /** per entry: column x (relative to box.x) and row index */
    slots: { x: number; row: number }[];
  };
  logoY: number;
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
  classes?: DiagramInput['classes'];
  lineColor?: string;
}

/** Shapes that are not cards: fixed geometry, centred connection points, never stretched. */
export function isSymbol(n: LNode): boolean {
  return n.shape !== 'card';
}

function icon(ref: string | undefined, opts: LayoutOptions): ResolvedIcon | undefined {
  if (!ref) return undefined;
  const r = resolveIcon(ref, opts.iconDirs);
  if (!r) throw new Error(`unknown icon "${ref}"`);
  return r;
}

const shapeDefaults = {
  card: { fill: C.fill, stroke: C.border, text: C.titleColor },
  decision: { fill: '#FFD8D9', stroke: '#E35D6A', text: '#2C2D31' },
  pill: { fill: '#FFFFFF', stroke: '', text: '' },
  note: { fill: 'none', stroke: 'none', text: '#6B6D70' },
};

function build(input: NodeInput, parent: LNode | undefined, nodes: Map<string, LNode>, opts: LayoutOptions): LNode {
  const shape = input.shape ?? 'card';
  const cls = input.class ? opts.classes?.[input.class] : undefined;
  const lineColor = resolveColor(opts.lineColor, X.color);
  const def = shapeDefaults[shape];
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
    attrDX: [],
    attrDY: [],
    italicAttrs: !!input.bullets,
    shape,
    fill: resolveColor(input.fill ?? cls?.fill, def.fill),
    stroke: resolveColor(input.color ?? cls?.color, def.stroke || lineColor),
    titleColor: resolveColor(cls?.text, def.text || lineColor),
    badge: icon(input.badge, opts),
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

/** Lay out attribute lines (wrapping long ones); returns [width, offset of last line]. */
function layoutAttrs(n: LNode, maxW: number): [number, number] {
  const bullets = !!n.input.bullets;
  const size = C.attrSize;
  const bw = bullets ? measure('•  ', size, 400, true) : 0;
  const itemGap = bullets ? 17 : C.attrLineHeight;
  const contGap = 12.5;
  n.attrLines = [];
  n.attrDX = [];
  n.attrDY = [];
  let y = 0;
  let w = 0;
  (n.input.attributes ?? []).forEach((a, i) => {
    const lines = bullets ? wrap(a, size, 400, maxW - bw, true) : [a];
    lines.forEach((l, j) => {
      if (i > 0 || j > 0) y += j === 0 ? itemGap : contGap;
      n.attrLines.push(bullets && j === 0 ? `•  ${l}` : l);
      n.attrDX.push(bullets && j > 0 ? bw : 0);
      n.attrDY.push(y);
      w = Math.max(w, (j > 0 ? bw : 0) + measure(n.attrLines[n.attrLines.length - 1], size, 400, n.italicAttrs));
    });
  });
  return [w, y];
}

function measureSymbol(n: LNode): void {
  const inp = n.input;
  const title = inp.title ?? '';
  if (n.shape === 'decision') {
    // text block inscribed in the diamond: |dx|/(w/2) + |dy|/(h/2) <= 1 at its corners
    const lines = wrap(title, X.decisionSize, 400, inp.width ? inp.width * 0.5 : 84, true);
    const tw = Math.max(...lines.map((l) => measure(l, X.decisionSize, 400, true)));
    const th = lines.length * X.decisionLineHeight;
    n.titleLines = lines;
    n.nw = Math.max(inp.width ?? 0, 1.75 * tw + 28, 112);
    n.nh = Math.max(inp.height ?? 0, 1.75 * th + 30, 84);
  } else if (n.shape === 'pill') {
    n.titleLines = [title];
    n.nw = Math.max(inp.width ?? 0, measure(title, 9.5, 700) + 26);
    n.nh = Math.max(inp.height ?? 0, 20);
  } else {
    n.titleLines = wrap(title, C.attrSize, 400, inp.width ?? 150, true);
    n.nw = Math.max(...n.titleLines.map((l) => measure(l, C.attrSize, 400, true))) + 4;
    n.nh = n.titleLines.length * 12.5 + 4;
  }
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
  if (isSymbol(n)) return measureSymbol(n);
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
      const allLeaves = n.children.every((c) => !c.children.length && c.framed && !isSymbol(c));
      if (allLeaves) {
        const m = Math.max(...n.children.map((c) => c.nw));
        if (inp.align !== 'center' && inp.align !== 'start' && inp.align !== 'end') for (const c of n.children) c.nw = m;
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

  const [attrW, attrLast] = layoutAttrs(n, inp.width ? inp.width - n.textX - 14 : 230);
  n.attrY = n.ruleY + C.attrFirstGap;
  const attrBottom = n.attrLines.length ? n.attrY + attrLast : 0;
  const footerTextW = inp.footer ? measure(inp.footer, C.footerSize, 400) + 30 : 0;
  const footerIconsW = n.footerIcons.length * C.footerIcon + (n.footerIcons.length - 1) * C.footerIconGap + 2 * C.pad;
  const iconBottom = n.icon ? C.iconTop + C.icon + 10 : 0;

  let contentW: number;
  let base: number;
  if (n.children.length) {
    const attrColW = n.attrLines.length ? attrW + K.attrColumnGap : 0;
    n.bodyX = n.attrLines.length ? n.textX + attrColW : K.pad;
    n.bodyY = n.ruleY + K.bodyGap;
    const attrH = n.attrLines.length ? attrLast + 10 : 0;
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

  if (n.badge) base += 8;
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
  const kids = inp.reverse ? [...n.children].reverse() : n.children;
  const align = inp.align ?? 'stretch';
  // cross-axis placement of one child within `span` starting at `start`
  const cross = (c: LNode, start: number, span: number, natural: number): [number, number] => {
    const a = isSymbol(c) && align === 'stretch' ? 'center' : align;
    if (a === 'stretch') return [start, Math.max(span, natural)];
    const off = a === 'start' ? 0 : a === 'end' ? span - natural : (span - natural) / 2;
    return [start + Math.max(0, off), natural];
  };

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
  const gaps = inp.reverse ? [...n.gaps].reverse() : [...n.gaps];
  let offset = 0;
  let grow = 0;
  if (horizontal && justify === 'stretch') grow = kids.some(isSymbol) ? 0 : extra / kids.length;
  if (horizontal && justify === 'stretch' && kids.some(isSymbol)) gaps.forEach((_, i) => (gaps[i] += extra / Math.max(1, kids.length - 1)));
  else if (justify === 'center') offset = extra / 2;
  else if (justify === 'space-between' && kids.length > 1) gaps.forEach((_, i) => (gaps[i] += extra / (kids.length - 1)));

  let cur = (horizontal ? bx : by) + offset;
  kids.forEach((c, i) => {
    if (horizontal) {
      const [cy, ch] = cross(c, by, bh, c.nh);
      place(c, cur, cy, isSymbol(c) ? c.nw : c.nw + grow, ch);
      cur += c.nw + grow + (gaps[i] ?? 0);
    } else {
      const [cx, cw] = cross(c, bx, bw, c.nw);
      place(c, cx, cur, cw, c.nh);
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
  const used = new Set([...nodes.values()].map((n) => n.input.class).filter(Boolean));
  for (const [name, c] of Object.entries(input.classes ?? {})) {
    if (!used.has(name)) continue;
    out.push({
      label: c.label ?? name,
      chip: { fill: resolveColor(c.fill, '#FFFFFF'), stroke: resolveColor(c.color, C.border), text: resolveColor(c.text, '#000000') },
    });
  }
  for (const n of nodes.values()) {
    for (const ic of [...n.footerIcons, ...(n.badge ? [n.badge] : [])]) {
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
  const titleWeight = input.header?.bold ? 700 : 400;
  const titleLines = wrap(input.title, H.titleSize, titleWeight, titleAreaW);
  const descLines = input.description ? wrap(input.description, H.descSize, 400, titleAreaW) : [];
  const logoH = (logo ? 44 : 0) + (input.header?.eyebrow ? 20 : 0);
  const titleLH = H.titleSize * 1.3;
  const textH = H.padY * 2 + logoH + titleLines.length * titleLH + (descLines.length ? 10 + descLines.length * H.descLineHeight : 0);

  let key: HeaderLayout['key'];
  const bulgeMin = H.padX + titleAreaW + 40;
  let keyH = 0;
  if (entries.length) {
    const entryW = (e: KeyEntry) =>
      e.chip ? measure(e.label, H.keyLabelSize, 600) + 28 : (e.icon ? H.keyIcon : 30) + 10 + measure(e.label, H.keyLabelSize, 400);
    const availW = width - bulgeMin - 50 - H.keyInset;
    // category chips, then icons and line styles; each group starts its own column and
    // columns fill top-to-bottom (up to three entries each, as in the official keys)
    const groups = [entries.filter((e) => e.chip), entries.filter((e) => !e.chip)].filter((g) => g.length);
    const pack = (rows: number) => {
      const cols: KeyEntry[][] = [];
      for (const g of groups) for (let i = 0; i < g.length; i += rows) cols.push(g.slice(i, i + rows));
      const widths = cols.map((c) => Math.max(...c.map(entryW)));
      return { cols, widths, w: 2 * H.keyPad + widths.reduce((a, b) => a + b, 0) + (cols.length - 1) * H.keyColGap * 2 };
    };
    let rows = Math.min(Math.max(...groups.map((g) => g.length)), 3);
    let packed = pack(rows);
    while (packed.w > availW && rows < entries.length) packed = pack(++rows);
    keyH = 2 * H.keyPad + H.keyIcon + (rows - 1) * H.keyRowHeight;
    const kw = Math.max(packed.w, Math.min(availW, width * 0.38));
    const spare = (kw - packed.w) / Math.max(1, packed.cols.length - 1);
    const slots: { x: number; row: number }[] = [];
    let cx = H.keyPad;
    const order: KeyEntry[] = [];
    packed.cols.forEach((col, ci) => {
      col.forEach((e, ri) => {
        order.push(e);
        slots.push({ x: cx, row: ri });
      });
      cx += packed.widths[ci] + H.keyColGap * 2 + (packed.cols.length > 1 ? spare : 0);
    });
    key = { box: { x: width - H.keyInset - kw, y: H.keyInset, w: kw, h: keyH }, rows, rowH: H.keyRowHeight, top: H.keyPad, entries: order, slots };
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
    eyebrow: input.header?.eyebrow,
    titleWeight,
    logoY: titleY - titleLH / 2 - (input.header?.eyebrow ? 44 : 24),
    eyebrowY: titleY - titleLH / 2 - 12,
    band: resolveColor(input.header?.band, H.band),
    color: resolveColor(input.header?.color, H.text),
    titleLines,
    descLines,
    titleX: H.padX,
    titleY,
    descY: titleY + (titleLines.length - 1) * titleLH + titleLH / 2 + 10 + H.descLineHeight / 2,
    bulgeX: key ? Math.min(Math.max(bulgeMin, width * 0.5), key.box.x - 40) : Math.max(bulgeMin, width * 0.5),
    arcR: h * 0.8,
  };
}

export function layoutDiagram(input: DiagramInput, baseOpts: LayoutOptions = {}): Layout {
  const opts: LayoutOptions = { ...baseOpts, classes: input.classes, lineColor: input.lineColor };
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
