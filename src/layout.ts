import type { ConnectionInput, DiagramInput, NodeInput } from './schema.js';
import { resolveColor } from './theme.js';
import { layoutTimeline, type TimelineItem, type TimelineLayout } from './timeline.js';
import { resolveIcon, type ResolvedIcon } from './catalog.js';
import { labelLines, measure, wrap } from './text.js';
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
  footerBase: number; // footerY for the natural height; footers follow the bottom when stretched
  iconPlain: boolean;
  /** footer icons follow the diagram-wide icon style only */
  footerPlain: boolean;
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
  /** label wrapped for the key */
  lines: string[];
  icon?: ResolvedIcon;
  chip?: { fill: string; stroke: string; text: string };
  arrow?: 'end' | 'start' | 'both' | 'none';
  pill?: boolean;
  line?: 'solid' | 'dashed' | 'dotted' | 'dashdot';
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
  /** description lines split into runs; runs with a url are links */
  descRuns: { text: string; url?: string }[][];
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
  timeline?: TimelineLayout;
}

export interface LayoutOptions {
  iconDirs?: string[];
  classes?: DiagramInput['classes'];
  lineColor?: string;
  iconStyle?: 'circle' | 'plain';
  cardWidth?: number;
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
    footerBase: 0,
    iconPlain: (input.iconStyle ?? opts.iconStyle) === 'plain',
    footerPlain: opts.iconStyle === 'plain',
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
  // a diagram-wide card width applies to plain leaf cards that don't set their own
  if (opts.cardWidth && shape === 'card' && !n.children.length && input.width === undefined && input.frame !== 'none') {
    n.input = { ...input, width: opts.cardWidth };
  }
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
  (n.input.attributes ?? []).forEach((raw, i) => {
    // two leading spaces per indent level ("  Business outcomes")
    const indent = Math.floor((raw.length - raw.trimStart().length) / 2) * 12;
    const a = raw.trim();
    const lines = wrap(a, size, 400, maxW - bw - indent, n.italicAttrs);
    lines.forEach((l, j) => {
      if (i > 0 || j > 0) y += j === 0 ? itemGap : contGap;
      n.attrLines.push(bullets && j === 0 ? `•  ${l}` : l);
      n.attrDX.push(indent + (bullets && j > 0 ? bw : 0));
      n.attrDY.push(y);
      w = Math.max(w, indent + (bullets && j > 0 ? bw : 0) + measure(n.attrLines[n.attrLines.length - 1], size, 400, n.italicAttrs));
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

/** Width and height of a connector label pill. */
export function pillSize(label: string): { w: number; h: number; lines: string[] } {
  const lines = labelLines(label, X.pillSize);
  const w = Math.max(...lines.map((l) => measure(l, X.pillSize, 700))) + 2 * X.pillPadX;
  return { w, h: X.pillHeight + (lines.length - 1) * X.pillLineHeight, lines };
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
    const pill = e.label ? pillSize(e.label) : { w: 0, h: 0 };
    const step = e.step ? X.stepSize + 6 : 0;
    const lineRoom = 2 * X.clearance + (axis === 'x' ? 24 : 20);
    // only a connector between neighbours puts its pill in this gap; longer ones just pass through
    const labelled = Math.abs(ia - ib) === 1 && (e.label || e.step);
    const need = !labelled ? lineRoom : axis === 'x' ? Math.max(lineRoom, pill.w + step + 2 * X.labelGap) : Math.max(lineRoom, Math.max(pill.h, X.stepSize) + 30);
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
      const weighted = n.children.some((c) => c.input.grow !== undefined);
      // plain card rows share one width, except cards with an explicit width
      const equal = n.children.filter((c) => !c.children.length && c.framed && !isSymbol(c) && c.input.width === undefined);
      if (!weighted && equal.length === n.children.length && !['center', 'start', 'end'].includes(inp.align ?? '')) {
        const m = Math.max(...equal.map((c) => c.nw));
        for (const c of equal) c.nw = m;
      }
      n.gaps = crossingGaps(n, 'x', baseGap, edges, nodes);
      const gapSum = n.gaps.reduce((s, g) => s + g, 0);
      if (weighted) {
        // widths proportional to grow (default 1), wide enough for every child's content
        const g = (c: LNode) => c.input.grow ?? 1;
        const G = n.children.reduce((s, c) => s + g(c), 0);
        const unit = Math.max(...n.children.map((c) => c.nw / g(c)));
        bw = unit * G + gapSum;
      } else bw = n.children.reduce((s, c) => s + c.nw, 0) + gapSum;
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
  n.titleLines = inp.title ? wrap(inp.title, C.titleSize, 700, inp.width ? Math.max(inp.width - n.textX - 16, 50) : C.maxTitleWidth) : [];
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
    const attrsOnTop = (inp.attributesPosition ?? (layoutKind === 'column' ? 'top' : 'left')) === 'top';
    if (attrsOnTop || !n.attrLines.length) {
      n.bodyX = K.pad;
      n.bodyY = n.attrLines.length ? attrBottom + 18 : n.ruleY + K.bodyGap;
      contentW = Math.max(n.bodyX + bw + K.pad, n.textX + attrW + 20);
      base = n.bodyY + bh + K.bottomPad;
    } else {
      n.bodyX = n.textX + attrW + K.attrColumnGap;
      n.bodyY = n.ruleY + K.bodyGap;
      n.attrY = n.bodyY + 5;
      contentW = n.bodyX + bw + K.pad;
      base = n.bodyY + Math.max(bh, attrLast + 10) + K.bottomPad;
    }
    if (inp.footer || n.footerIcons.length) base += 14;
  } else {
    contentW = n.textX + Math.max(titleW, attrW) + 20;
    base = n.attrLines.length ? attrBottom + 27 : n.ruleY + 20;
    if (inp.footer || n.footerIcons.length) base = n.attrLines.length ? attrBottom + (inp.footer ? 20 : 12) : n.ruleY + (inp.footer ? 14 : 8);
  }
  base = Math.max(base, iconBottom);
  n.footerY = n.footerBase = base;
  if (inp.footer) base += C.footerBandHeight;
  if (n.footerIcons.length) base += C.footerIconPadY * 2 + C.footerIcon;
  else if (inp.footer) base += 10;

  if (n.badge) base += 8;
  n.nw =
    inp.width !== undefined && !n.children.length
      ? Math.max(inp.width, footerIconsW)
      : Math.max(C.minWidth, inp.width ?? 0, contentW, n.textX + titleW + 20, footerTextW, footerIconsW);
  n.nh = Math.max(base, inp.height ?? 0);
}

function place(n: LNode, x: number, y: number, w: number, h: number, isRoot = false): void {
  n.x = x;
  n.y = y;
  n.w = w;
  n.h = h;
  // a plain card placed wider or narrower than measured re-wraps its text to fit
  if (n.framed && n.shape === 'card' && !n.children.length && Math.abs(w - n.nw) > 2 && (n.input.attributes?.length || n.titleLines.length > 1)) {
    n.input = { ...n.input, width: w };
    measureNode(n, [], new Map());
  }
  // footers stay at the bottom of a card that was stretched taller than it needs
  if (n.framed) n.footerY = n.footerBase + Math.max(0, h - n.nh);
  if (!n.children.length) return;
  const inp = n.input;
  const layoutKind = inp.layout ?? (isRoot ? 'column' : 'row');
  // rows of plain cards share the width; rows holding containers keep natural widths and
  // give the spare room to the gaps, where connectors run (as in the reference diagrams);
  // columns keep natural heights unless asked to stretch
  let justify = inp.justify ?? (layoutKind === 'column' ? 'start' : kidsAreLeaves(n) ? 'stretch' : 'space-between');
  if (justify === 'space-between' && n.children.length === 1) justify = 'stretch';
  const bx = x + n.bodyX;
  const by = y + n.bodyY;
  const bw = n.framed ? w - n.bodyX - K.pad : w;
  // a stretched container passes its extra height on to its children block
  const bh = n.framed ? n.blockH + Math.max(0, h - n.nh) : h;
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
  // main-axis size of each child
  const size = new Map<LNode, number>(kids.map((c) => [c, horizontal ? c.nw : c.nh]));
  const weighted = horizontal && kids.some((c) => c.input.grow !== undefined);
  if (weighted) {
    const g = (c: LNode) => c.input.grow ?? 1;
    const G = kids.reduce((s, c) => s + g(c), 0);
    const room = avail - gaps.reduce((s, v) => s + v, 0);
    for (const c of kids) size.set(c, (room * g(c)) / G);
  } else if (justify === 'stretch') {
    const growable = kids.filter((c) => !isSymbol(c));
    if (growable.length === kids.length) for (const c of kids) size.set(c, size.get(c)! + extra / kids.length);
    else gaps.forEach((_, i) => (gaps[i] += extra / Math.max(1, kids.length - 1)));
  } else if (justify === 'center') offset = extra / 2;
  else if (justify === 'end') offset = extra;
  else if (justify === 'space-between' && kids.length > 1) gaps.forEach((_, i) => (gaps[i] += extra / (kids.length - 1)));

  let cur = (horizontal ? bx : by) + offset;
  kids.forEach((c, i) => {
    const s = size.get(c)!;
    if (horizontal) {
      const [cy, ch] = cross(c, by, bh, c.nh);
      place(c, cur, cy, s, ch);
    } else {
      const [cx, cw] = cross(c, bx, bw, c.nw);
      place(c, cx, cur, cw, s);
    }
    cur += s + (gaps[i] ?? 0);
  });
}

/** Length of a key line sample: long enough to show its dash pattern and arrowheads. */
export function keyLineW(e: KeyEntry): number {
  return e.arrow && e.arrow !== 'none' ? 72 : 48;
}

/** A key line sample carrying its label in a pill. */
export function keyPillLineW(label: string): number {
  return Math.max(170, pillSize(label).w + 70);
}

function keyEntries(input: DiagramInput, nodes: Map<string, LNode>, opts: LayoutOptions): KeyEntry[] {
  if (input.key === 'none') return [];
  const labels = input.keyLabels ?? {};
  const mk = (e: Omit<KeyEntry, 'lines'>): KeyEntry => ({
    ...e,
    lines: e.chip || e.pill ? [e.label] : wrap(e.label, H.keyLabelSize, 400, 130),
  });
  if (Array.isArray(input.key)) {
    return input.key.map((k) =>
      mk({
        label: k.label,
        icon: icon(k.icon, opts),
        line: k.line ?? (k.pill || k.arrow ? 'solid' : undefined),
        color: k.color,
        arrow: k.arrow,
        pill: k.pill,
        chip: k.chip ? { fill: resolveColor(k.chip.fill, '#FFFFFF'), stroke: resolveColor(k.chip.color, C.border), text: resolveColor(k.chip.text, '#000000') } : undefined,
      }),
    );
  }
  const chips: KeyEntry[] = [];
  const rest: { e: KeyEntry; key: string }[] = [];
  const seen = new Set<string>();
  const used = new Set([...nodes.values()].map((n) => n.input.class).filter(Boolean));
  for (const [name, c] of Object.entries(input.classes ?? {})) {
    if (!used.has(name)) continue;
    chips.push(
      mk({
        label: c.label ?? name,
        chip: { fill: resolveColor(c.fill, '#FFFFFF'), stroke: resolveColor(c.color, C.border), text: resolveColor(c.text, '#000000') },
      }),
    );
  }
  for (const n of nodes.values()) {
    for (const ic of [...n.footerIcons, ...(n.badge ? [n.badge] : [])]) {
      if (seen.has(ic.id)) continue;
      seen.add(ic.id);
      rest.push({ e: mk({ label: labels[ic.id] ?? ic.label, icon: ic }), key: ic.id });
    }
  }
  for (const [id, label] of Object.entries(labels)) {
    if (seen.has(id) || ['solid', 'dashed', 'dotted'].includes(id)) continue;
    const ic = resolveIcon(id, opts.iconDirs);
    if (ic) {
      seen.add(id);
      rest.push({ e: mk({ label, icon: ic }), key: id });
    }
  }
  const styles = new Set((input.connections ?? []).map((c) => c.style ?? 'solid'));
  const defaults: Record<string, string> = { solid: 'Synchronous', dashed: 'Asynchronous', dotted: 'Optional' };
  if ([...styles].some((s) => s !== 'solid') || labels.solid) {
    for (const s of ['solid', 'dashed', 'dotted'] as const) {
      if (styles.has(s)) rest.push({ e: mk({ label: labels[s] ?? defaults[s], line: s }), key: s });
    }
  }
  // entries named in keyLabels follow the order they were written in
  const order = Object.keys(labels);
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  rest.sort((a, b) => rank(a.key) - rank(b.key));
  return [...chips, ...rest.map((r) => r.e)];
}

/** "[text](url)" links: the plain text plus the character ranges that are links. */
function parseLinks(desc: string): { plain: string; links: { start: number; end: number; url: string }[] } {
  const src = desc.replace(/\s+/g, ' ').trim();
  const links: { start: number; end: number; url: string }[] = [];
  let plain = '';
  let last = 0;
  for (const m of src.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    plain += src.slice(last, m.index);
    links.push({ start: plain.length, end: plain.length + m[1].length, url: m[2] });
    plain += m[1];
    last = m.index! + m[0].length;
  }
  plain += src.slice(last);
  return { plain, links };
}

function runsFor(plain: string, lines: string[], links: { start: number; end: number; url: string }[]) {
  let pos = 0;
  return lines.map((line) => {
    const start = plain.indexOf(line, pos);
    pos = start + line.length;
    const runs: { text: string; url?: string }[] = [];
    let i = 0;
    while (i < line.length) {
      const at = start + i;
      const link = links.find((l) => at >= l.start && at < l.end);
      const stop = link ? Math.min(link.end - start, line.length) : Math.min(line.length, ...links.filter((l) => l.start > at).map((l) => l.start - start));
      runs.push({ text: line.slice(i, stop), url: link?.url });
      i = stop;
    }
    return runs;
  });
}

function layoutHeader(input: DiagramInput, width: number, entries: KeyEntry[], opts: LayoutOptions): HeaderLayout {
  let titleAreaW = Math.min(Math.max(width * 0.42, 320), 560);
  const logo = icon(input.logo, opts);
  const titleWeight = input.header?.bold ? 700 : 400;
  const logoH = (logo ? 44 : 0) + (input.header?.eyebrow ? 20 : 0);
  const titleLH = H.titleSize * 1.3;

  let key: HeaderLayout['key'];
  let bulgeMin = H.padX + titleAreaW + 40;
  let keyH = 0;
  if (entries.length) {
    const chipW = Math.max(0, ...entries.filter((e) => e.chip).map((e) => measure(e.label, H.keyLabelSize, 600) + 28));
    const textW = (e: KeyEntry) => Math.max(...e.lines.map((l) => measure(l, H.keyLabelSize, 400)));
    const entryW = (e: KeyEntry) =>
      e.chip ? chipW : e.pill ? keyPillLineW(e.label) : (e.icon ? H.keyIcon : keyLineW(e)) + 10 + textW(e);
    const availW = width - bulgeMin - 50 - H.keyInset;
    // category chips, then icons and line styles; each group starts its own column and
    // columns fill top-to-bottom, using as few rows as fit (at most 7 columns)
    const groups = [entries.filter((e) => e.chip), entries.filter((e) => !e.chip)].filter((g) => g.length);
    const pack = (rows: number) => {
      const cols: KeyEntry[][] = [];
      for (const g of groups) {
        if (input.keyFlow === 'rows') {
          // reading order across: entry i goes to column i mod (columns needed)
          const n = Math.ceil(g.length / rows);
          const cs: KeyEntry[][] = Array.from({ length: n }, () => []);
          g.forEach((e, i) => cs[i % n].push(e));
          cols.push(...cs);
        } else for (let i = 0; i < g.length; i += rows) cols.push(g.slice(i, i + rows));
      }
      const widths = cols.map((c) => Math.max(...c.map(entryW)));
      return { cols, widths, w: 2 * H.keyPad + widths.reduce((a, b) => a + b, 0) + (cols.length - 1) * H.keyColGap * 2 };
    };
    let rows: number;
    if (input.keyRows) rows = input.keyRows;
    else if (input.keyColumns) rows = Math.max(1, Math.ceil(Math.max(...groups.map((g) => g.length)) / Math.max(1, input.keyColumns - (groups.length - 1))));
    else {
      rows = 1;
      while (rows < entries.length && (pack(rows).cols.length > 7 || pack(rows).w > availW)) rows++;
    }
    const packed = pack(rows);
    rows = Math.max(...packed.cols.map((c) => c.length));
    keyH = 2 * H.keyPad + H.keyIcon + (rows - 1) * H.keyRowHeight;
    const kw = Math.max(packed.w, Math.min(availW, width * 0.38));
    const spare = Math.min(80, (kw - packed.w) / Math.max(1, packed.cols.length - 1));
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
  // a wide key squeezes the title block rather than running over it
  if (key) {
    titleAreaW = Math.max(220, Math.min(titleAreaW, key.box.x - 90 - H.padX));
    bulgeMin = H.padX + titleAreaW + 40;
  }
  const titleLines = wrap(input.title, H.titleSize, titleWeight, titleAreaW);
  const { plain, links } = parseLinks(input.description ?? '');
  const descLines = plain ? wrap(plain, H.descSize, 400, titleAreaW) : [];
  const descRuns = runsFor(plain, descLines, links);
  const textH = H.padY * 2 + logoH + titleLines.length * titleLH + (descLines.length ? 10 + descLines.length * H.descLineHeight : 0);
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
    descRuns,
    titleX: H.padX,
    titleY,
    descY: titleY + (titleLines.length - 1) * titleLH + titleLH / 2 + 10 + H.descLineHeight / 2,
    bulgeX: key ? Math.min(Math.max(bulgeMin, width * 0.5), key.box.x - 40) : Math.max(bulgeMin, width * 0.5),
    arcR: h * 0.8,
  };
}

function headerMinWidth(entries: KeyEntry[]): number {
  const keyNeed = entries.length
    ? 2 * H.keyPad + Math.min(entries.length, 4) * (Math.max(...entries.map((e) => 42 + measure(e.label, H.keyLabelSize, 400))) + H.keyColGap)
    : 0;
  return H.padX + 360 + 90 + keyNeed + H.keyInset;
}

function layoutRoadmap(
  input: DiagramInput,
  opts: LayoutOptions,
  root: LNode,
  nodes: Map<string, LNode>,
  edges: ConnectionInput[],
  items: { lane: number; item: TimelineItem }[],
): Layout {
  const m = theme.canvas.margin;
  const measureCard = (n: LNode, width: number) => {
    n.input = { ...n.input, width };
    measureNode(n, edges, nodes);
    return n.nh;
  };
  const placed = items.map((t) => ({ ...t, node: nodes.get(t.item.id)! }));
  const tl = layoutTimeline(input.timeline!, placed, measureCard, m, 0, Math.max(input.width ?? 0, 1200) - 2 * m);
  const entries = keyEntries(input, nodes, opts);
  const width = Math.ceil(Math.max(input.width ?? 0, tl.w + 2 * m, headerMinWidth(entries)));
  const header = layoutHeader(input, width, entries, opts);
  const top = header.h + theme.canvas.headerGap;
  for (const { node } of placed) place(node, node.x, node.y + top, node.w, node.h);
  tl.y += top;
  for (const l of tl.lanes) l.y += top;
  Object.assign(root, { x: tl.x, y: tl.y, w: tl.w, h: tl.h });
  return { width, height: Math.ceil(tl.y + tl.h + m + 8), header, root, nodes, connections: edges, input, timeline: tl };
}

export function layoutDiagram(input: DiagramInput, baseOpts: LayoutOptions = {}): Layout {
  const opts: LayoutOptions = {
    ...baseOpts,
    classes: input.classes,
    lineColor: input.lineColor,
    iconStyle: input.iconStyle,
    cardWidth: input.cardWidth,
  };
  const nodes = new Map<string, LNode>();
  const timelineItems = (input.timeline?.lanes ?? []).flatMap((l, lane) =>
    l.items.map((item) => ({ lane, item: { rule: false, ...item } as TimelineItem })),
  );
  const rootInput: NodeInput = {
    id: '__root',
    frame: 'none',
    layout: input.layout ?? 'column',
    columns: input.columns,
    gap: input.gap,
    children: input.timeline ? timelineItems.map((t) => t.item) : input.nodes,
  };
  const root = build(rootInput, undefined, nodes, opts);
  nodes.delete('__root');
  const edges = input.connections ?? [];
  if (input.timeline) return layoutRoadmap(input, opts, root, nodes, edges, timelineItems);
  measureNode(root, edges, nodes, true);

  const m = theme.canvas.margin;
  const entries = keyEntries(input, nodes, opts);
  // the header needs room for the title block plus the key panel
  const width = Math.ceil(Math.max(input.width ?? 0, root.nw + 2 * m, headerMinWidth(entries), 900));
  const header = layoutHeader(input, width, entries, opts);
  const top = header.h + theme.canvas.headerGap;
  place(root, m, top, width - 2 * m, root.nh, true);
  const height = Math.ceil(top + root.nh + m + 8);
  return { width, height, header, root, nodes, connections: edges, input };
}
