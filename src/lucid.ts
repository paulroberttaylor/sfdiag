// Lucid Standard Import (.lucid) exporter: recreates the rendered diagram as native, editable
// Lucidchart shapes. Mirrors src/render.ts (same geometry, tokens and z-order).
//
// Format notes (see developer.lucid.co "Standard Import"; shapes verified against the official
// demo.lucid sample where noted):
//  - image shape: { type:'image', image:{ type:'ref', ref:'file.png' }, stroke }   (verified in sample)
//  - colours may carry alpha as #RRGGBBAA                                           (verified in sample)
//  - flexiblePolygon vertices are RelativePosition {x,y} in 0..1 of the bbox       (docs)
//  - text is an HTML string using inline style on a <span>                          (sample)
import JSZip from 'jszip';
import type { ResolvedIcon } from './catalog.js';
import type { KeyEntry, Layout, LNode } from './layout.js';
import { routeAll, type Route } from './route.js';
import { baselineOffset, loadFonts, measure, type Weight } from './text.js';
import { svgToPng } from './png.js';
import { resolveColor, theme } from './theme.js';

const C = theme.card;
const X = theme.connector;
const H = theme.header;

/**
 * elbowControlPoints are unverified (no official sample uses them, semantics undocumented), and a
 * wrong value may make Lucid reject or mis-route the line. Off by default: endpoints carry exact
 * relative positions and Lucid routes the elbow itself.
 */
const ELBOW_CONTROL_POINTS = false;
/** Assumed horizontal inset of Lucid text boxes; text shapes are widened and shifted by this. */
const TEXT_PAD = 4;
/** Invisible stroke for shapes that must not draw an outline (alpha-0 colour). */
const NO_STROKE = { color: '#FFFFFF00', width: 1 };
const ICON_PX = 42; // reference size icons are rasterised at (x4)

const pt = (px: number) => Math.round(px * 0.75 * 100) / 100;
const r2 = (n: number) => Math.round(n * 100) / 100;
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const solid = (color: string) => ({ type: 'color', color });
const strokeW = (w: number) => Math.max(1, Math.round(w));

type Json = Record<string, unknown>;
type Dash = 'solid' | 'dashed' | 'dotted';

class Builder {
  shapes: Json[] = [];
  lines: Json[] = [];
  groups: Json[] = [];
  images = new Map<string, { file: string; png: Buffer }>();
  private counters = new Map<string, number>();
  private family = loadFonts().family;

  id(prefix: string): string {
    const n = (this.counters.get(prefix) ?? 0) + 1;
    this.counters.set(prefix, n);
    return `${prefix}-${n}`;
  }

  group(items: string[], zIndex: number) {
    if (items.length) this.groups.push({ id: this.id('grp'), items, zIndex });
  }

  rect(
    prefix: string,
    b: { x: number; y: number; w: number; h: number },
    o: { fill: string; stroke?: { color: string; width: number; style?: Dash }; rounding?: number; z: number; type?: string; text?: string },
  ): string {
    const id = this.id(prefix);
    const s: Json = {
      id,
      type: o.type ?? 'rectangle',
      boundingBox: { x: r2(b.x), y: r2(b.y), w: r2(b.w), h: r2(b.h) },
      style: { fill: solid(o.fill), stroke: o.stroke ?? NO_STROKE, ...(o.rounding ? { rounding: Math.round(o.rounding) } : {}) },
      zIndex: o.z,
    };
    if (o.text !== undefined) s.text = o.text;
    this.shapes.push(s);
    return id;
  }

  span(s: string, size: number, weight: Weight, color: string, align: string, italic = false): string {
    return (
      `<span style='text-align: ${align}; color: ${color}; font-size: ${pt(size)}pt; font-weight: ${weight >= 600 ? 'bold' : 'normal'}; ` +
      `${italic ? 'font-style: italic; ' : ''}font-family: ${this.family}; vertical-align: middle;'>${esc(s)}</span>`
    );
  }

  /** Text whose vertical centre sits at cy; same anchor semantics as render.ts. */
  text(s: string, x: number, cy: number, size: number, weight: Weight, color: string, z: number, anchor: 'start' | 'middle' = 'start', italic = false): string | undefined {
    if (!s) return undefined;
    const w = measure(s, size, weight, italic) * 1.15 + 2 * TEXT_PAD + 8;
    const h = Math.ceil(size * 1.7);
    const x0 = anchor === 'start' ? x - TEXT_PAD : x - w / 2;
    const id = this.id('txt');
    this.shapes.push({
      id,
      type: 'text',
      boundingBox: { x: r2(x0), y: r2(cy - h / 2), w: r2(w), h },
      text: this.span(s, size, weight, color, anchor === 'start' ? 'left' : 'center', italic),
      zIndex: z,
    });
    return id;
  }

  /** Icon image shape (matches Svg.icon in render.ts: plain icons are drawn 1.25x). */
  icon(ic: ResolvedIcon, cx: number, cy: number, d: number, z: number): string {
    const file = this.iconFile(ic);
    const size = ic.plain && !ic.custom ? d * 1.25 : d;
    const id = this.id('img');
    this.shapes.push({
      id,
      type: 'image',
      boundingBox: { x: r2(cx - size / 2), y: r2(cy - size / 2), w: r2(size), h: r2(size) },
      image: { type: 'ref', ref: file },
      stroke: NO_STROKE,
      zIndex: z,
    });
    return id;
  }

  private iconFile(ic: ResolvedIcon): string {
    const key = `${ic.id}|${ic.custom}|${ic.plain}|${ic.color}`;
    let e = this.images.get(key);
    if (!e) {
      e = { file: `icon-${this.images.size + 1}.png`, png: svgToPng(iconSvg(ic), 4) };
      this.images.set(key, e);
    }
    return e.file;
  }
}

function iconSvg(ic: ResolvedIcon): string {
  const d = ICON_PX;
  const sym = `<symbol id="g" viewBox="${ic.glyph.viewBox}">${ic.glyph.body}</symbol>`;
  const fam = loadFonts().family;
  let S = d;
  let body: string;
  if (ic.custom) {
    body = `<use href="#g" x="0" y="0" width="${d}" height="${d}"/>`;
  } else if (ic.plain) {
    S = d * 1.25;
    body = `<use href="#g" x="0" y="0" width="${S}" height="${S}" fill="${ic.color}"/>`;
    if (ic.id === 'salesforce') {
      const size = d * 0.2;
      const y = S / 2 + d * 0.02 + baselineOffset(size, 600);
      body += `<text x="${S / 2}" y="${y}" font-size="${size}" font-weight="600" text-anchor="middle" fill="#FFFFFF">salesforce</text>`;
    }
  } else {
    const g = d * 0.52;
    body =
      `<circle cx="${d / 2}" cy="${d / 2}" r="${d / 2}" fill="${ic.color}"/>` +
      `<use href="#g" x="${(d - g) / 2}" y="${(d - g) / 2}" width="${g}" height="${g}" fill="#FFFFFF"/>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}" font-family="'${fam}'"><defs>${sym}</defs>${body}</svg>`;
}

function drawHeader(b: Builder, l: Layout) {
  const h = l.header;
  const items: string[] = [];
  items.push(b.rect('hdr', { x: 0, y: 0, w: l.width, h: h.h }, { fill: h.band, z: 0 }));

  // White arc region: polygon approximating the SVG arc (circle radius R, bulging right to bulgeX).
  const R = Math.max(h.arcR, h.h / 2 + 1);
  const cx = h.bulgeX - R;
  const phi = Math.asin(h.h / 2 / R);
  const N = 32;
  const verts = [{ x: 0, y: 0 }];
  for (let i = 0; i <= N; i++) {
    const a = -phi + (2 * phi * i) / N;
    verts.push({ x: cx + R * Math.cos(a), y: h.h / 2 + R * Math.sin(a) });
  }
  verts.push({ x: 0, y: h.h });
  const bw = Math.max(1, Math.max(...verts.map((v) => v.x)));
  const arc = b.rect('arc', { x: 0, y: 0, w: bw, h: h.h }, { fill: '#FFFFFF', z: 1, type: 'flexiblePolygon' });
  b.shapes.find((s) => s.id === arc)!.vertices = verts.map((v) => ({ x: r2(Math.min(1, Math.max(0, v.x / bw))), y: r2(v.y / h.h) }));
  items.push(arc);

  if (h.logo) items.push(b.icon(h.logo, h.titleX + 22, h.logoY, 34, 2));
  if (h.eyebrow) items.push(b.text(h.eyebrow.toUpperCase(), h.titleX, h.eyebrowY, 12, 700, h.color, 2)!);
  h.titleLines.forEach((t, i) => items.push(b.text(t, h.titleX, h.titleY + i * H.titleSize * 1.3, H.titleSize, h.titleWeight, h.color, 2)!));
  h.descLines.forEach((t, i) => items.push(b.text(t, h.titleX, h.descY + i * H.descLineHeight, H.descSize, 400, h.color, 2)!));

  if (h.key) {
    const k = h.key;
    items.push(b.rect('key', k.box, { fill: '#FFFFFF', rounding: 20, z: 2 }));
    k.entries.forEach((e, i) => {
      const row = k.slots[i].row;
      const x = k.box.x + k.slots[i].x;
      const cy = k.box.y + k.top + H.keyIcon / 2 + row * k.rowH;
      if (e.chip) {
        const w = measure(e.label, H.keyLabelSize, 600) + 24;
        items.push(
          b.rect('chip', { x, y: cy - 10, w, h: 20 }, {
            fill: e.chip.fill,
            stroke: { color: e.chip.stroke, width: 2, style: 'solid' },
            rounding: 8,
            z: 3,
            text: b.span(e.label, H.keyLabelSize, 600, e.chip.text, 'center'),
          }),
        );
        return;
      }
      items.push(keySymbol(b, e, x, cy));
      const t = b.text(e.label, x + (e.icon ? H.keyIcon : 30) + 10, cy, H.keyLabelSize, 400, h.color, 3);
      if (t) items.push(t);
    });
  }
  b.group(items, 0);
}

function lineShape(b: Builder, p1: { x: number; y: number }, p2: { x: number; y: number }, color: string, width: number, style: Dash, z: number): string {
  const id = b.id('ln');
  b.lines.push({
    id,
    lineType: 'straight',
    endpoint1: { type: 'positionEndpoint', style: 'none', position: { x: r2(p1.x), y: r2(p1.y) } },
    endpoint2: { type: 'positionEndpoint', style: 'none', position: { x: r2(p2.x), y: r2(p2.y) } },
    stroke: { color, width: strokeW(width), style },
    zIndex: z,
  });
  return id;
}

function keySymbol(b: Builder, e: KeyEntry, x: number, cy: number): string {
  if (e.icon) return b.icon(e.icon, x + H.keyIcon / 2, cy, H.keyIcon, 3);
  return lineShape(b, { x, y: cy }, { x: x + 30, y: cy }, resolveColor(e.color, X.color), X.width + 0.5, e.line ?? 'solid', 3);
}

function drawSymbol(b: Builder, n: LNode, z: number, cardIds: Map<string, string>) {
  if (n.shape === 'note') {
    const items = n.titleLines.map((t, i) => b.text(t, n.x + 2, n.y + 8 + i * 12.5, C.attrSize, 400, n.titleColor, z, 'start', true)!);
    b.group(items, z);
    return;
  }
  const decision = n.shape === 'decision';
  const text = n.titleLines
    .map((t) => b.span(t, decision ? X.decisionSize : 9.5, decision ? 400 : 700, n.titleColor, 'center', decision))
    .join('<br>');
  const id = b.rect(decision ? 'dec' : 'term', n, {
    fill: n.fill,
    stroke: { color: n.stroke, width: 2, style: 'solid' },
    rounding: decision ? undefined : n.h,
    z,
    type: decision ? 'diamond' : 'rectangle',
    text,
  });
  cardIds.set(n.id, id);
}

function drawNode(b: Builder, n: LNode, depth: number, cardIds: Map<string, string>) {
  if (n.framed && n.shape !== 'card') return drawSymbol(b, n, depth * 4, cardIds);
  if (n.framed) {
    const z = depth * 4;
    const stroke = n.stroke;
    const fill = n.fill;
    const bw = C.borderWidth;
    const items: string[] = [];
    const card = b.rect('card', n, { fill, stroke: { color: stroke, width: strokeW(bw), style: 'solid' }, rounding: 2 * C.radius, z });
    cardIds.set(n.id, card);
    items.push(card);
    const zp = z + 1;
    if (n.icon) items.push(b.icon(n.icon, n.x + C.iconTop + C.icon / 2, n.y + C.iconTop + C.icon / 2, C.icon, zp));
    n.titleLines.forEach((t, i) => {
      const id = b.text(t, n.x + n.textX, n.y + n.titleCenter + i * C.titleLineHeight, C.titleSize, 700, n.titleColor, zp);
      if (id) items.push(id);
    });
    if (n.titleLines.length) {
      const x0 = n.x + n.textX;
      items.push(b.rect('rule', { x: x0, y: n.y + n.ruleY - C.ruleWidth / 2, w: n.x + n.w - bw / 2 - x0, h: C.ruleWidth }, { fill: C.ruleColor, z: zp }));
    }
    n.attrLines.forEach((t, i) => {
      const color = n.input.class ? n.titleColor : C.attrColor;
      const id = b.text(t, n.x + n.textX + n.attrDX[i], n.y + n.attrY + n.attrDY[i], C.attrSize, 400, color, zp, 'start', n.italicAttrs);
      if (id) items.push(id);
    });
    if (n.badge) items.push(b.icon(n.badge, n.x + n.w - 14, n.y + n.h - 14, 14, zp));
    let fy = n.y + n.footerY;
    if (n.input.footer) {
      items.push(b.rect('foot', { x: n.x + bw / 2, y: fy, w: n.w - bw, h: C.footerBandHeight }, { fill: C.footerBand, z: zp }));
      const id = b.text(n.input.footer, n.x + n.w / 2, fy + C.footerBandHeight / 2, C.footerSize, 400, C.attrColor, zp + 1, 'middle');
      if (id) items.push(id);
      fy += C.footerBandHeight;
    }
    if (n.footerIcons.length) {
      const d = C.footerIcon;
      const total = n.footerIcons.length * d + (n.footerIcons.length - 1) * C.footerIconGap;
      let x = n.x + (n.w - total) / 2 + d / 2;
      for (const ic of n.footerIcons) {
        items.push(b.icon(ic, x, fy + C.footerIconPadY + d / 2, d, zp));
        x += d + C.footerIconGap;
      }
    }
    b.group(items, z);
    for (const c of n.children) drawNode(b, c, depth + 1, cardIds);
  } else {
    for (const c of n.children) drawNode(b, c, depth, cardIds);
  }
}

function endpoint(cardIds: Map<string, string>, n: LNode, p: { x: number; y: number }, style: string): Json {
  const shapeId = cardIds.get(n.id);
  if (!shapeId) return { type: 'positionEndpoint', style, position: { x: r2(p.x), y: r2(p.y) } };
  const rel = (v: number, o: number, s: number) => r2(Math.min(1, Math.max(0, s ? (v - o) / s : 0.5)));
  return { type: 'shapeEndpoint', style, shapeId, position: { x: rel(p.x, n.x, n.w), y: rel(p.y, n.y, n.h) } };
}

function drawRoute(b: Builder, r: Route, cardIds: Map<string, string>, lineColor: string) {
  const color = resolveColor(r.conn.color, lineColor);
  const arrow = r.conn.arrow ?? 'end';
  const P = r.points;
  const id = b.id('conn');
  const line: Json = {
    id,
    lineType: 'elbow',
    endpoint1: endpoint(cardIds, r.from, P[0], arrow === 'start' || arrow === 'both' ? 'arrow' : 'none'),
    endpoint2: endpoint(cardIds, r.to, P[P.length - 1], arrow === 'end' || arrow === 'both' ? 'arrow' : 'none'),
    stroke: { color, width: strokeW(X.width), style: r.conn.style ?? 'solid' },
    zIndex: 1000,
  };
  if (ELBOW_CONTROL_POINTS && P.length > 2) line.elbowControlPoints = P.slice(1, -1).map((p) => ({ x: r2(p.x), y: r2(p.y) }));
  b.lines.push(line);
  const items = [id];
  if (r.label) {
    const l = r.label;
    const pill = b.rect('pill', l, {
      fill: '#FFFFFF',
      stroke: { color, width: strokeW(X.pillBorder), style: 'solid' },
      rounding: l.h,
      z: 2000,
      text: `<span style='text-align: center; color: ${r.conn.color ? color : X.color}; font-size: ${pt(X.pillSize)}pt; font-weight: bold; font-family: ${loadFonts().family}; vertical-align: middle;'>${esc(l.text)}</span>`,
    });
    items.push(pill);
  }
  if (r.step) {
    const s = r.step;
    const d = X.stepSize;
    items.push(
      b.rect('step', { x: s.x - d / 2, y: s.y - d / 2, w: d, h: d }, {
        fill: X.stepFill,
        z: 2001,
        type: 'circle',
        text: `<span style='text-align: center; color: #FFFFFF; font-size: ${pt(9)}pt; font-weight: bold; font-family: ${loadFonts().family}; vertical-align: middle;'>${s.n}</span>`,
      }),
    );
  }
  b.group(items, 1000);
}

export async function exportLucid(layout: Layout): Promise<Buffer> {
  const b = new Builder();
  const cardIds = new Map<string, string>();
  const routes = routeAll(layout);
  drawHeader(b, layout);
  for (const c of layout.root.children) drawNode(b, c, 0, cardIds);
  // the decorative road behind snake flowcharts is not exported (no arcs in Standard Import)
  const lineColor = resolveColor(layout.input.lineColor, X.color);
  for (const r of routes) drawRoute(b, r, cardIds, lineColor);

  const doc = {
    version: 1,
    documentSettings: { units: 'px' },
    pages: [
      {
        id: 'page-1',
        title: layout.input.title || 'Diagram',
        settings: { fillColor: theme.canvas.background, infiniteCanvas: true },
        shapes: b.shapes,
        lines: b.lines,
        groups: b.groups,
      },
    ],
  };
  const zip = new JSZip();
  zip.file('document.json', JSON.stringify(doc));
  for (const { file, png } of b.images.values()) zip.file(`images/${file}`, png);
  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
