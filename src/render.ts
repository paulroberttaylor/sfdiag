import fs from 'node:fs';
import type { ResolvedIcon } from './catalog.js';
import { keyLineW, keyPillLineW, pillSize, type KeyEntry, type Layout, type LNode } from './layout.js';
import { routeAll, type Point, type Route } from './route.js';
import { baselineOffset, loadFonts, measure, textPath, type Weight } from './text.js';
import { resolveColor, theme } from './theme.js';
import { timelineText as T } from './timeline.js';

const C = theme.card;
const X = theme.connector;
const H = theme.header;

export type TextMode = 'embed' | 'paths' | 'plain';

export interface RenderOptions {
  text?: TextMode;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const r2 = (n: number) => Math.round(n * 100) / 100;

class Svg {
  parts: string[] = [];
  glyphs = new Map<string, ResolvedIcon>();
  constructor(private mode: TextMode) {}

  push(s: string) {
    this.parts.push(s);
  }

  /** Text whose visual (cap-height) centre sits at cy. */
  text(s: string, x: number, cy: number, size: number, weight: Weight, fill: string, anchor: 'start' | 'middle' | 'end' = 'start', italic = false) {
    if (!s) return;
    const y = cy + baselineOffset(size, weight);
    let x0 = x;
    if (this.mode === 'paths') {
      const w = measure(s, size, weight, italic);
      if (anchor === 'middle') x0 = x - w / 2;
      if (anchor === 'end') x0 = x - w;
      this.push(`<path d="${textPath(s, x0, y, size, weight, italic)}" fill="${fill}"><title>${esc(s)}</title></path>`);
      return;
    }
    const a = anchor === 'start' ? '' : ` text-anchor="${anchor}"`;
    const fw = weight === 400 ? '' : ` font-weight="${weight}"`;
    const fs = (italic ? ' font-style="italic"' : '') + (/^\s|\s$/.test(s) ? ' xml:space="preserve"' : '');
    this.push(`<text x="${r2(x0)}" y="${r2(y)}" font-size="${size}"${fw}${fs}${a} fill="${fill}">${esc(s)}</text>`);
  }

  glyphRef(ic: ResolvedIcon): string {
    const id = `g-${ic.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    this.glyphs.set(id, ic);
    return id;
  }

  /** Draw an icon centred at (cx, cy) with diameter d. */
  icon(ic: ResolvedIcon, cx: number, cy: number, d: number, bare = false) {
    if (ic.id === 'placeholder') {
      this.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(d / 2)}" fill="${ic.color}"/>`);
      return;
    }
    const id = this.glyphRef(ic);
    if (bare && !ic.custom && !ic.plain) {
      // coloured glyph without its disc, as many reference diagrams draw product icons
      const g = d * 0.8;
      this.push(`<use href="#${id}" x="${r2(cx - g / 2)}" y="${r2(cy - g / 2)}" width="${r2(g)}" height="${r2(g)}" fill="${ic.color}"/>`);
      return;
    }
    if (ic.custom) {
      this.push(`<use href="#${id}" x="${r2(cx - d / 2)}" y="${r2(cy - d / 2)}" width="${d}" height="${d}"/>`);
      return;
    }
    if (ic.plain) {
      const w = d * 1.25;
      this.push(`<use href="#${id}" x="${r2(cx - w / 2)}" y="${r2(cy - w / 2)}" width="${r2(w)}" height="${r2(w)}" fill="${ic.color}"/>`);
      if (ic.id === 'salesforce') this.text('salesforce', cx, cy + d * 0.02, d * 0.2, 600, '#FFFFFF', 'middle');
      return;
    }
    const g = d * 0.52;
    this.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(d / 2)}" fill="${ic.color}"/>`);
    this.push(`<use href="#${id}" x="${r2(cx - g / 2)}" y="${r2(cy - g / 2)}" width="${r2(g)}" height="${r2(g)}" fill="#FFFFFF"/>`);
  }

  defs(): string {
    const syms = [...this.glyphs].map(
      ([id, ic]) => `<symbol id="${id}" viewBox="${ic.glyph.viewBox}">${ic.glyph.body}</symbol>`,
    );
    return syms.join('');
  }
}

function fontFace(svgBody: string): string {
  const fonts = loadFonts();
  const face = (file: string, w: number, style: string) =>
    `@font-face{font-family:'${fonts.family}';font-weight:${w};font-style:${style};src:url(data:font/ttf;base64,${fs.readFileSync(file).toString('base64')}) format('truetype');}`;
  const out = ([400, 600, 700] as Weight[]).map((w) => face(fonts.files[w], w, 'normal'));
  // only embed italics when the drawing uses them
  if (svgBody.includes('font-style="italic"')) {
    for (const [w, f] of Object.entries(fonts.italicFiles)) if (f) out.push(face(f, Number(w), 'italic'));
  }
  return out.join('');
}

function drawHeader(svg: Svg, l: Layout) {
  const h = l.header;
  svg.push(`<rect x="0" y="0" width="${l.width}" height="${r2(h.h)}" fill="${h.band}"/>`);
  const R = Math.max(h.arcR, h.h / 2 + 1);
  const xTop = h.bulgeX - (R - Math.sqrt(R * R - (h.h / 2) ** 2));
  svg.push(`<path d="M0 0H${r2(xTop)}A${r2(R)} ${r2(R)} 0 0 1 ${r2(xTop)} ${r2(h.h)}V${r2(h.h + 1)}H0Z" fill="#FFFFFF"/>`);
  if (h.logo) svg.icon(h.logo, h.titleX + 22, h.logoY, 34);
  if (h.eyebrow) svg.text(h.eyebrow.toUpperCase(), h.titleX, h.eyebrowY, 12, 700, h.color);
  h.titleLines.forEach((t, i) => svg.text(t, h.titleX, h.titleY + i * H.titleSize * 1.3, H.titleSize, h.titleWeight, h.color));
  h.descRuns.forEach((runs, i) => {
    const cy = h.descY + i * H.descLineHeight;
    let x = h.titleX;
    for (const r of runs) {
      const w = measure(r.text, H.descSize, 400);
      if (r.url) {
        svg.push(`<a href="${esc(r.url)}">`);
        svg.text(r.text, x, cy, H.descSize, 400, '#0176D3');
        svg.push(`<line x1="${r2(x)}" y1="${r2(cy + H.descSize * 0.55)}" x2="${r2(x + w)}" y2="${r2(cy + H.descSize * 0.55)}" stroke="#0176D3" stroke-width="0.7"/></a>`);
      } else svg.text(r.text, x, cy, H.descSize, 400, h.color);
      x += w;
    }
  });
  if (h.key) {
    const k = h.key;
    svg.push(`<rect x="${r2(k.box.x)}" y="${r2(k.box.y)}" width="${r2(k.box.w)}" height="${r2(k.box.h)}" rx="10" fill="#FFFFFF"/>`);
    const chipW = Math.max(0, ...k.entries.filter((e) => e.chip).map((e) => measure(e.label, H.keyLabelSize, 600) + 24));
    const bare = l.input.iconStyle === 'plain';
    k.entries.forEach((e, i) => {
      const row = k.slots[i].row;
      const x = k.box.x + k.slots[i].x;
      const cy = k.box.y + k.top + H.keyIcon / 2 + row * k.rowH;
      if (e.chip) {
        svg.push(`<rect x="${r2(x)}" y="${r2(cy - 10)}" width="${r2(chipW)}" height="20" rx="4" fill="${e.chip.fill}" stroke="${e.chip.stroke}" stroke-width="1.5"/>`);
        svg.text(e.label, x + chipW / 2, cy, H.keyLabelSize, 600, e.chip.text, 'middle');
        return;
      }
      if (e.pill) {
        const len = keyPillLineW(e.label);
        drawKeyLine(svg, e, x, x + len, cy);
        const ps = pillSize(e.label);
        const mx = x + len / 2;
        svg.push(`<rect x="${r2(mx - ps.w / 2)}" y="${r2(cy - ps.h / 2)}" width="${r2(ps.w)}" height="${r2(ps.h)}" rx="${X.pillHeight / 2}" fill="#FFFFFF" stroke="${resolveColor(e.color, X.color)}" stroke-width="${X.pillBorder}"/>`);
        ps.lines.forEach((t, j) => svg.text(t, mx, cy + (j - (ps.lines.length - 1) / 2) * X.pillLineHeight, X.pillSize, 700, X.color, 'middle'));
        return;
      }
      const sampleW = e.icon ? H.keyIcon : keyLineW(e);
      if (e.icon) svg.icon(e.icon, x + H.keyIcon / 2, cy, H.keyIcon, bare);
      else drawKeyLine(svg, e, x, x + sampleW, cy);
      const lh = H.keyLabelSize * 1.25;
      e.lines.forEach((t, j) => svg.text(t, x + sampleW + 10, cy + (j - (e.lines.length - 1) / 2) * lh, H.keyLabelSize, 400, h.color));
    });
  }
}

function drawKeyLine(svg: Svg, e: KeyEntry, x0: number, x1: number, cy: number) {
  const color = resolveColor(e.color, X.color);
  const patterns: Record<string, string> = { dashed: X.dash, dotted: X.dot, dashdot: '10 4 2 4' };
  const dash = patterns[e.line ?? ''] ? ` stroke-dasharray="${patterns[e.line!]}"${e.line === 'dotted' ? ' stroke-linecap="round"' : ''}` : '';
  const atStart = e.arrow === 'start' || e.arrow === 'both';
  const atEnd = e.arrow === 'end' || e.arrow === 'both';
  const a = atStart ? X.arrowLength - 1 : 0;
  const b = atEnd ? X.arrowLength - 1 : 0;
  svg.push(`<line x1="${r2(x0 + a)}" y1="${r2(cy)}" x2="${r2(x1 - b)}" y2="${r2(cy)}" stroke="${color}" stroke-width="${X.width + 0.5}"${dash}/>`);
  if (atEnd) arrowHead(svg, { x: x1, y: cy }, { x: x0, y: cy }, color);
  if (atStart) arrowHead(svg, { x: x0, y: cy }, { x: x1, y: cy }, color);
}

function drawSymbol(svg: Svg, n: LNode) {
  const cx = n.x + n.w / 2;
  const cy = n.y + n.h / 2;
  if (n.shape === 'decision') {
    svg.push(
      `<path d="M${r2(cx)} ${r2(n.y)}L${r2(n.x + n.w)} ${r2(cy)}L${r2(cx)} ${r2(n.y + n.h)}L${r2(n.x)} ${r2(cy)}Z" fill="${n.fill}" stroke="${n.stroke}" stroke-width="${C.borderWidth}" stroke-linejoin="round" filter="url(#sh)"/>`,
    );
    const lh = X.decisionLineHeight;
    const top = cy - ((n.titleLines.length - 1) * lh) / 2;
    n.titleLines.forEach((t, i) => svg.text(t, cx, top + i * lh, X.decisionSize, 400, n.titleColor, 'middle', true));
  } else if (n.shape === 'pill') {
    svg.push(`<rect x="${r2(n.x)}" y="${r2(n.y)}" width="${r2(n.w)}" height="${r2(n.h)}" rx="${r2(n.h / 2)}" fill="${n.fill}" stroke="${n.stroke}" stroke-width="2"/>`);
    svg.text(n.titleLines[0], cx, cy, 9.5, 700, n.titleColor, 'middle');
  } else {
    n.titleLines.forEach((t, i) => svg.text(t, n.x + 2, n.y + 8 + i * 12.5, C.attrSize, 400, n.titleColor, 'start', true));
  }
}

function drawNode(svg: Svg, n: LNode) {
  if (n.framed && n.shape !== 'card') return drawSymbol(svg, n);
  if (n.framed) {
    const stroke = n.stroke;
    const fill = n.fill;
    const bw = C.borderWidth;
    const border = n.input.border ?? 'solid';
    const dashes: Record<string, string> = { dashed: '8 5', dashdot: '10 4 2 4', dotted: '2 4' };
    const strokeAttr = border === 'none' ? 'stroke="none"' : `stroke="${stroke}" stroke-width="${bw}"${dashes[border] ? ` stroke-dasharray="${dashes[border]}"` : ''}`;
    svg.push(
      `<rect x="${r2(n.x)}" y="${r2(n.y)}" width="${r2(n.w)}" height="${r2(n.h)}" rx="${C.radius}" fill="${fill}" ${strokeAttr}${border === 'none' ? '' : ' filter="url(#sh)"'}/>`,
    );
    if (n.icon) svg.icon(n.icon, n.x + C.iconTop + C.icon / 2, n.y + C.iconTop + C.icon / 2, n.icon.plain && !n.icon.custom ? C.icon * 0.62 : C.icon, n.iconPlain);
    n.titleLines.forEach((t, i) => svg.text(t, n.x + n.textX, n.y + n.titleCenter + i * C.titleLineHeight, C.titleSize, 700, n.titleColor));
    if (n.titleLines.length && n.input.rule !== false) {
      svg.push(
        `<line x1="${r2(n.x + n.textX)}" y1="${r2(n.y + n.ruleY)}" x2="${r2(n.x + n.w - bw / 2)}" y2="${r2(n.y + n.ruleY)}" stroke="${C.ruleColor}" stroke-width="${C.ruleWidth}"/>`,
      );
    }
    n.attrLines.forEach((t, i) =>
      svg.text(t, n.x + n.textX + n.attrDX[i], n.y + n.attrY + n.attrDY[i], C.attrSize, 400, n.input.class ? n.titleColor : C.attrColor, 'start', n.italicAttrs),
    );
    if (n.badge) {
      const d = 14;
      const bx = n.x + n.w - d - 7;
      const by = n.y + n.h - d - 7;
      const id = svg.glyphRef(n.badge);
      svg.push(`<rect x="${r2(bx)}" y="${r2(by)}" width="${d}" height="${d}" rx="3" fill="${n.badge.color}"/>`);
      svg.push(`<use href="#${id}" x="${r2(bx + 2.5)}" y="${r2(by + 2.5)}" width="${d - 5}" height="${d - 5}" fill="#FFFFFF"/>`);
    }
    let fy = n.y + n.footerY;
    if (n.input.footer) {
      svg.push(`<rect x="${r2(n.x + bw / 2)}" y="${r2(fy)}" width="${r2(n.w - bw)}" height="${C.footerBandHeight}" fill="${C.footerBand}"/>`);
      svg.text(n.input.footer, n.x + n.w / 2, fy + C.footerBandHeight / 2, C.footerSize, 400, C.attrColor, 'middle');
      fy += C.footerBandHeight;
    }
    if (n.footerIcons.length) {
      const d = C.footerIcon;
      const total = n.footerIcons.length * d + (n.footerIcons.length - 1) * C.footerIconGap;
      let x = n.x + (n.w - total) / 2 + d / 2;
      for (const ic of n.footerIcons) {
        svg.icon(ic, x, fy + C.footerIconPadY + d / 2, d, n.footerPlain);
        x += d + C.footerIconGap;
      }
    }
  }
  for (const c of n.children) drawNode(svg, c);
}

function arrowHead(svg: Svg, tip: Point, from: Point, color: string) {
  const dx = Math.sign(tip.x - from.x);
  const dy = Math.sign(tip.y - from.y);
  const L = X.arrowLength;
  const W = X.arrowWidth / 2;
  const bx = tip.x - dx * L;
  const by = tip.y - dy * L;
  const p1 = { x: bx - dy * W, y: by + dx * W };
  const p2 = { x: bx + dy * W, y: by - dx * W };
  svg.push(`<path d="M${r2(tip.x)} ${r2(tip.y)}L${r2(p1.x)} ${r2(p1.y)}L${r2(p2.x)} ${r2(p2.y)}Z" fill="${color}"/>`);
}

function drawRoute(svg: Svg, r: Route, lineColor: string) {
  const color = resolveColor(r.conn.color, lineColor);
  const arrow = r.conn.arrow ?? 'end';
  const pts = r.points.map((p) => ({ ...p }));
  const trim = (i: number, j: number) => {
    const dx = Math.sign(pts[i].x - pts[j].x);
    const dy = Math.sign(pts[i].y - pts[j].y);
    pts[i] = { x: pts[i].x - dx * (X.arrowLength - 1), y: pts[i].y - dy * (X.arrowLength - 1) };
  };
  const last = pts.length - 1;
  if (arrow === 'end' || arrow === 'both') trim(last, last - 1);
  if (arrow === 'start' || arrow === 'both') trim(0, 1);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${r2(p.x)} ${r2(p.y)}`).join('');
  const style = r.conn.style ?? 'solid';
  const dash = style === 'dashed' ? ` stroke-dasharray="${X.dash}"` : style === 'dotted' ? ` stroke-dasharray="${X.dot}" stroke-linecap="round"` : '';
  svg.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${X.width}" stroke-linejoin="round"${dash}/>`);
  const P = r.points;
  if (arrow === 'end' || arrow === 'both') arrowHead(svg, P[P.length - 1], P[P.length - 2], color);
  if (arrow === 'start' || arrow === 'both') arrowHead(svg, P[0], P[1], color);
}

function drawLabels(svg: Svg, r: Route, lineColor: string) {
  const color = resolveColor(r.conn.color, lineColor);
  if (r.label) {
    const b = r.label;
    const dash = r.conn.style === 'dashed' ? ` stroke-dasharray="${X.dash}"` : r.conn.style === 'dotted' ? ` stroke-dasharray="${X.dot}"` : '';
    svg.push(
      `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${r2(b.h)}" rx="${r2(Math.min(b.h / 2, X.pillHeight / 2))}" fill="#FFFFFF" stroke="${color}" stroke-width="${X.pillBorder}"${dash}/>`,
    );
    const top = b.y + b.h / 2 - ((b.lines.length - 1) * X.pillLineHeight) / 2;
    b.lines.forEach((t, i) => svg.text(t, b.x + b.w / 2, top + i * X.pillLineHeight, X.pillSize, 700, r.conn.color ? color : X.color, 'middle'));
  }
  if (r.step) {
    svg.push(`<circle cx="${r2(r.step.x)}" cy="${r2(r.step.y)}" r="${X.stepSize / 2}" fill="${X.stepFill}" stroke="${X.stepStroke}" stroke-width="1.5"/>`);
    svg.text(String(r.step.n), r.step.x, r.step.y, 9.5, 700, X.stepStroke, 'middle');
  }
}

/** Roadmap grid: period headings, lane labels, shading and period dividers. */
function drawTimeline(svg: Svg, l: Layout) {
  const t = l.timeline!;
  const gridX = t.x + t.labelW;
  const right = t.x + t.w;
  const bottom = t.y + t.h;
  const bodyTop = t.y + t.headerH;
  const dash = t.grid === 'dashed' ? ' stroke-dasharray="6 5"' : '';
  if (t.shade === 'columns')
    t.periods.forEach((p, i) => i % 2 === 1 && svg.push(`<rect x="${r2(p.x)}" y="${r2(t.y)}" width="${r2(p.w)}" height="${r2(t.h)}" fill="${T.shade}"/>`));
  if (t.shade === 'lanes')
    t.lanes.forEach((ln, i) => i % 2 === 1 && svg.push(`<rect x="${r2(t.x)}" y="${r2(ln.y)}" width="${r2(t.w)}" height="${r2(ln.h)}" fill="${T.shade}"/>`));
  // period dividers run the full height; lane dividers span the whole width
  for (const p of t.periods) svg.push(`<line x1="${r2(p.x)}" y1="${r2(t.y)}" x2="${r2(p.x)}" y2="${r2(bottom)}" stroke="${T.line}" stroke-width="1"${dash}/>`);
  for (const ln of t.lanes) svg.push(`<line x1="${r2(t.x)}" y1="${r2(ln.y)}" x2="${r2(right)}" y2="${r2(ln.y)}" stroke="${T.line}" stroke-width="1"/>`);
  svg.push(`<rect x="${r2(gridX)}" y="${r2(t.y)}" width="${r2(right - gridX)}" height="${r2(t.h)}" fill="none" stroke="${T.line}" stroke-width="1"${dash}/>`);
  svg.push(`<rect x="${r2(t.x)}" y="${r2(bodyTop)}" width="${r2(t.w)}" height="${r2(bottom - bodyTop)}" fill="none" stroke="${T.line}" stroke-width="1"/>`);
  for (const p of t.periods) svg.text(p.label, p.x + p.w / 2, t.y + t.headerH / 2, T.period, 700, T.color, 'middle');
  for (const ln of t.lanes)
    ln.lines.forEach((s, i) => svg.text(s, t.x + 18, ln.y + ln.h / 2 + (i - (ln.lines.length - 1) / 2) * T.lane * 1.25, T.lane, 700, T.color));
}

/** A winding band behind the top-level rows, ending in an arrow (snake flowcharts). */
function drawRoad(svg: Svg, l: Layout, color: string) {
  const rows = l.root.children;
  if (!rows.length) return;
  const centers = rows.map((r) => r.y + r.h / 2);
  const minH = Math.min(...rows.map((r) => r.h));
  const T = Math.min(Math.max(minH * 0.5, 70), 150);
  const left = theme.canvas.margin * 0.4;
  const right = l.width - theme.canvas.margin * 0.4;
  let d = `M${r2(left)} ${r2(centers[0])}`;
  for (let i = 1; i < centers.length; i++) {
    const r = (centers[i] - centers[i - 1]) / 2;
    const goingRight = i % 2 === 1;
    const x = goingRight ? right - r - T / 2 : left + r + T / 2;
    d += `H${r2(x)}A${r2(r)} ${r2(r)} 0 0 ${goingRight ? 1 : 0} ${r2(x)} ${r2(centers[i])}`;
  }
  const endRight = centers.length % 2 === 1;
  const endX = endRight ? right - T * 0.9 : left + T * 0.9;
  d += `H${r2(endX)}`;
  svg.push(`<path d="${d}" fill="none" stroke="${color}" stroke-width="${r2(T)}"/>`);
  const y = centers[centers.length - 1];
  const tip = endRight ? right : left;
  const dir = endRight ? 1 : -1;
  svg.push(`<path d="M${r2(endX - dir)} ${r2(y - T * 0.85)}L${r2(tip)} ${r2(y)}L${r2(endX - dir)} ${r2(y + T * 0.85)}Z" fill="${color}"/>`);
}

export function renderSvg(layout: Layout, opts: RenderOptions = {}): { svg: string; routes: Route[] } {
  const mode = opts.text ?? 'embed';
  const svg = new Svg(mode);
  const routes = routeAll(layout);
  const lineColor = resolveColor(layout.input.lineColor, X.color);
  drawHeader(svg, layout);
  if (layout.input.road) drawRoad(svg, layout, resolveColor(layout.input.road, '#FBF9C9'));
  if (layout.timeline) drawTimeline(svg, layout);
  for (const c of layout.root.children) drawNode(svg, c);
  for (const r of routes) drawRoute(svg, r, lineColor);
  for (const r of routes) drawLabels(svg, r, lineColor);

  const fonts = loadFonts();
  const W = layout.width;
  const Hh = layout.height;
  const title = esc(layout.input.title);
  const desc = layout.input.description ? `<desc>${esc(layout.input.description.replace(/\[([^\]]+)\]\([^)\s]+\)/g, '$1'))}</desc>` : '';
  const body = svg.parts.join('\n');
  const style = mode === 'embed' ? `<style>${fontFace(body)}</style>` : '';
  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${title}" ` +
    `font-family="'${fonts.family}', 'Salesforce Sans', Arial, sans-serif">` +
    `<title>${title}</title>${desc}<defs>${style}` +
    `<filter id="sh" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="${C.shadow}" flood-opacity="${C.shadowOpacity}"/></filter>` +
    `${svg.defs()}</defs>` +
    (layout.input.background === 'none' ? '' : `<rect width="${W}" height="${Hh}" fill="${resolveColor(layout.input.background, theme.canvas.background)}"/>`);
  return { svg: `${head}${body}</svg>\n`, routes };
}
