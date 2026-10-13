import fs from 'node:fs';
import type { ResolvedIcon } from './catalog.js';
import type { KeyEntry, Layout, LNode } from './layout.js';
import { routeAll, type Point, type Route } from './route.js';
import { baselineOffset, loadFonts, measure, textPath, type Weight } from './text.js';
import { resolveColor, theme } from './theme.js';

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
  text(s: string, x: number, cy: number, size: number, weight: Weight, fill: string, anchor: 'start' | 'middle' | 'end' = 'start') {
    if (!s) return;
    const y = cy + baselineOffset(size, weight);
    let x0 = x;
    if (this.mode === 'paths') {
      const w = measure(s, size, weight);
      if (anchor === 'middle') x0 = x - w / 2;
      if (anchor === 'end') x0 = x - w;
      this.push(`<path d="${textPath(s, x0, y, size, weight)}" fill="${fill}"><title>${esc(s)}</title></path>`);
      return;
    }
    const a = anchor === 'start' ? '' : ` text-anchor="${anchor}"`;
    const fw = weight === 400 ? '' : ` font-weight="${weight}"`;
    this.push(`<text x="${r2(x0)}" y="${r2(y)}" font-size="${size}"${fw}${a} fill="${fill}">${esc(s)}</text>`);
  }

  glyphRef(ic: ResolvedIcon): string {
    const id = `g-${ic.id.replace(/[^A-Za-z0-9_-]/g, '_')}`;
    this.glyphs.set(id, ic);
    return id;
  }

  /** Draw an icon centred at (cx, cy) with diameter d. */
  icon(ic: ResolvedIcon, cx: number, cy: number, d: number) {
    const id = this.glyphRef(ic);
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

function fontFace(): string {
  const fonts = loadFonts();
  return ([400, 600, 700] as Weight[])
    .map((w) => {
      const b64 = fs.readFileSync(fonts.files[w]).toString('base64');
      return `@font-face{font-family:'${fonts.family}';font-weight:${w};src:url(data:font/ttf;base64,${b64}) format('truetype');}`;
    })
    .join('');
}

function drawHeader(svg: Svg, l: Layout) {
  const h = l.header;
  svg.push(`<rect x="0" y="0" width="${l.width}" height="${r2(h.h)}" fill="${H.band}"/>`);
  const R = Math.max(h.arcR, h.h / 2 + 1);
  const xTop = h.bulgeX - (R - Math.sqrt(R * R - (h.h / 2) ** 2));
  svg.push(`<path d="M0 0H${r2(xTop)}A${r2(R)} ${r2(R)} 0 0 1 ${r2(xTop)} ${r2(h.h)}V${r2(h.h + 1)}H0Z" fill="#FFFFFF"/>`);
  if (h.logo) svg.icon(h.logo, h.titleX + 22, h.titleY - H.titleSize * 1.3 / 2 - 24, 34);
  h.titleLines.forEach((t, i) => svg.text(t, h.titleX, h.titleY + i * H.titleSize * 1.3, H.titleSize, 400, H.text));
  h.descLines.forEach((t, i) => svg.text(t, h.titleX, h.descY + i * H.descLineHeight, H.descSize, 400, H.text));
  if (h.key) {
    const k = h.key;
    svg.push(`<rect x="${r2(k.box.x)}" y="${r2(k.box.y)}" width="${r2(k.box.w)}" height="${r2(k.box.h)}" rx="10" fill="#FFFFFF"/>`);
    k.entries.forEach((e, i) => {
      const col = i % k.cols;
      const row = Math.floor(i / k.cols);
      const x = k.box.x + H.keyPad + col * (k.colW + H.keyColGap);
      const cy = k.box.y + H.keyPad + H.keyIcon / 2 + row * H.keyRowHeight;
      drawKeySymbol(svg, e, x, cy);
      svg.text(e.label, x + (e.icon ? H.keyIcon : 30) + 10, cy, H.keyLabelSize, 400, H.text);
    });
  }
}

function drawKeySymbol(svg: Svg, e: KeyEntry, x: number, cy: number) {
  if (e.icon) {
    svg.icon(e.icon, x + H.keyIcon / 2, cy, H.keyIcon);
    return;
  }
  const color = resolveColor(e.color, X.color);
  const dash = e.line === 'dashed' ? ` stroke-dasharray="${X.dash}"` : e.line === 'dotted' ? ` stroke-dasharray="${X.dot}" stroke-linecap="round"` : '';
  svg.push(`<line x1="${r2(x)}" y1="${r2(cy)}" x2="${r2(x + 30)}" y2="${r2(cy)}" stroke="${color}" stroke-width="${X.width + 0.5}"${dash}/>`);
}

function drawNode(svg: Svg, n: LNode) {
  if (n.framed) {
    const stroke = resolveColor(n.input.color, C.border);
    const fill = resolveColor(n.input.fill, C.fill);
    const bw = C.borderWidth;
    svg.push(
      `<rect x="${r2(n.x)}" y="${r2(n.y)}" width="${r2(n.w)}" height="${r2(n.h)}" rx="${C.radius}" fill="${fill}" stroke="${stroke}" stroke-width="${bw}" filter="url(#sh)"/>`,
    );
    if (n.icon) svg.icon(n.icon, n.x + C.iconTop + C.icon / 2, n.y + C.iconTop + C.icon / 2, n.icon.plain && !n.icon.custom ? C.icon * 0.62 : C.icon);
    n.titleLines.forEach((t, i) => svg.text(t, n.x + n.textX, n.y + n.titleCenter + i * C.titleLineHeight, C.titleSize, 700, C.titleColor));
    if (n.titleLines.length) {
      svg.push(
        `<line x1="${r2(n.x + n.textX)}" y1="${r2(n.y + n.ruleY)}" x2="${r2(n.x + n.w - bw / 2)}" y2="${r2(n.y + n.ruleY)}" stroke="${C.ruleColor}" stroke-width="${C.ruleWidth}"/>`,
      );
    }
    n.attrLines.forEach((t, i) => svg.text(t, n.x + n.textX, n.y + n.attrY + i * C.attrLineHeight, C.attrSize, 400, C.attrColor));
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
        svg.icon(ic, x, fy + C.footerIconPadY + d / 2, d);
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

function drawRoute(svg: Svg, r: Route) {
  const color = resolveColor(r.conn.color, X.color);
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

function drawLabels(svg: Svg, r: Route) {
  const color = resolveColor(r.conn.color, X.color);
  if (r.label) {
    const b = r.label;
    svg.push(
      `<rect x="${r2(b.x)}" y="${r2(b.y)}" width="${r2(b.w)}" height="${b.h}" rx="${b.h / 2}" fill="#FFFFFF" stroke="${color}" stroke-width="${X.pillBorder}"/>`,
    );
    svg.text(b.text, b.x + b.w / 2, b.y + b.h / 2, X.pillSize, 700, X.color, 'middle');
  }
  if (r.step) {
    svg.push(`<circle cx="${r2(r.step.x)}" cy="${r2(r.step.y)}" r="${X.stepSize / 2}" fill="${X.stepFill}"/>`);
    svg.text(String(r.step.n), r.step.x, r.step.y, 9, 700, '#FFFFFF', 'middle');
  }
}

export function renderSvg(layout: Layout, opts: RenderOptions = {}): { svg: string; routes: Route[] } {
  const mode = opts.text ?? 'embed';
  const svg = new Svg(mode);
  const routes = routeAll(layout);
  drawHeader(svg, layout);
  for (const c of layout.root.children) drawNode(svg, c);
  for (const r of routes) drawRoute(svg, r);
  for (const r of routes) drawLabels(svg, r);

  const fonts = loadFonts();
  const W = layout.width;
  const Hh = layout.height;
  const title = esc(layout.input.title);
  const desc = layout.input.description ? `<desc>${esc(layout.input.description)}</desc>` : '';
  const style = mode === 'embed' ? `<style>${fontFace()}</style>` : '';
  const head =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${Hh}" viewBox="0 0 ${W} ${Hh}" role="img" aria-label="${title}" ` +
    `font-family="'${fonts.family}', 'Salesforce Sans', Arial, sans-serif">` +
    `<title>${title}</title>${desc}<defs>${style}` +
    `<filter id="sh" x="-5%" y="-5%" width="110%" height="115%"><feDropShadow dx="0" dy="1.5" stdDeviation="1.2" flood-color="${C.shadow}" flood-opacity="${C.shadowOpacity}"/></filter>` +
    `${svg.defs()}</defs>` +
    `<rect width="${W}" height="${Hh}" fill="${theme.canvas.background}"/>`;
  return { svg: `${head}${svg.parts.join('\n')}</svg>\n`, routes };
}
