import type { ConnectionInput } from './schema.js';
import { ancestors, type Box, type Layout, type LNode } from './layout.js';
import { measure } from './text.js';
import { theme } from './theme.js';

const X = theme.connector;

export type Side = 'left' | 'right' | 'top' | 'bottom';
export interface Point {
  x: number;
  y: number;
}

export interface Route {
  conn: ConnectionInput;
  from: LNode;
  to: LNode;
  fromSide: Side;
  toSide: Side;
  points: Point[];
  label?: { x: number; y: number; w: number; h: number; text: string };
  step?: { x: number; y: number; n: number };
}

interface End {
  route: Route;
  node: LNode;
  side: Side;
  other: LNode;
  pos?: number; // coordinate along the side
  fixed: boolean;
}

const horizontalSide = (s: Side) => s === 'left' || s === 'right';

function overlap(a0: number, a1: number, b0: number, b1: number): [number, number] {
  return [Math.max(a0, b0), Math.min(a1, b1)];
}

function contains(a: Box, b: Box): boolean {
  return b.x >= a.x && b.y >= a.y && b.x + b.w <= a.x + a.w && b.y + b.h <= a.y + a.h;
}

function chooseSides(a: LNode, b: LNode, c: ConnectionInput, all: LNode[]): [Side, Side] {
  const [ox0, ox1] = overlap(a.x, a.x + a.w, b.x, b.x + b.w);
  const [oy0, oy1] = overlap(a.y, a.y + a.h, b.y, b.y + b.h);
  const acx = a.x + a.w / 2;
  const bcx = b.x + b.w / 2;
  const acy = a.y + a.h / 2;
  const bcy = b.y + b.h / 2;
  let fs: Side;
  let ts: Side;
  if (contains(a, b) || contains(b, a)) {
    // nested: run from the inner node's top/bottom to the matching outer edge
    fs = ts = bcy >= acy ? 'bottom' : 'top';
  } else if (oy1 - oy0 >= 16 && (a.x + a.w <= b.x || b.x + b.w <= a.x)) {
    fs = acx < bcx ? 'right' : 'left';
    ts = acx < bcx ? 'left' : 'right';
    // cards in between: skip over them along the top, as a hand-drawn diagram would
    const x0 = Math.min(a.x + a.w, b.x + b.w);
    const x1 = Math.max(a.x, b.x);
    const skip = new Set<LNode>([a, b, ...ancestors(a), ...ancestors(b)]);
    const blocked = all.some((n) => !skip.has(n) && n.framed && n.x < x1 && n.x + n.w > x0 && n.y < oy1 && n.y + n.h > oy0);
    if (blocked) fs = ts = 'top';
  } else if (ox1 - ox0 >= 16) {
    fs = acy < bcy ? 'bottom' : 'top';
    ts = acy < bcy ? 'top' : 'bottom';
  } else {
    const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
    const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
    // diagonal neighbours: Z-shaped route between facing sides, as drawn by hand
    if (gapX >= gapY) {
      fs = acx < bcx ? 'right' : 'left';
      ts = acx < bcx ? 'left' : 'right';
    } else {
      fs = acy < bcy ? 'bottom' : 'top';
      ts = acy < bcy ? 'top' : 'bottom';
    }
  }
  return [c.fromSide ?? fs, c.toSide ?? ts];
}

function sideRange(n: LNode, s: Side): [number, number] {
  const inset = theme.card.radius + 8;
  return horizontalSide(s) ? [n.y + inset, n.y + n.h - inset] : [n.x + inset, n.x + n.w - inset];
}

function portPoint(n: LNode, s: Side, pos: number): Point {
  switch (s) {
    case 'left':
      return { x: n.x, y: pos };
    case 'right':
      return { x: n.x + n.w, y: pos };
    case 'top':
      return { x: pos, y: n.y };
    case 'bottom':
      return { x: pos, y: n.y + n.h };
  }
}

function outward(s: Side): Point {
  return { left: { x: -1, y: 0 }, right: { x: 1, y: 0 }, top: { x: 0, y: -1 }, bottom: { x: 0, y: 1 } }[s];
}

function assignPorts(routes: Route[]): Map<Route, [number, number]> {
  const ends: End[] = [];
  const byRoute = new Map<Route, [End, End]>();
  for (const r of routes) {
    const ea: End = { route: r, node: r.from, side: r.fromSide, other: r.to, fixed: false };
    const eb: End = { route: r, node: r.to, side: r.toSide, other: r.from, fixed: false };
    ends.push(ea, eb);
    byRoute.set(r, [ea, eb]);
  }

  // A: straight connections between facing sides that overlap
  const groups = new Map<string, Route[]>();
  for (const r of routes) {
    const opposite = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' }[r.fromSide];
    if (opposite !== r.toSide) continue;
    const [lo, hi] = horizontalSide(r.fromSide)
      ? overlap(...sideRange(r.from, r.fromSide), ...sideRange(r.to, r.toSide))
      : overlap(...sideRange(r.from, r.fromSide), ...sideRange(r.to, r.toSide));
    if (hi - lo < 4) continue;
    const key = [r.from.id, r.to.id].sort().join('|') + (horizontalSide(r.fromSide) ? 'h' : 'v');
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(r);
  }
  // claim slots per side so straight groups never share a port with each other
  const minGap = 16;
  const occupied = new Map<string, number[]>();
  const sideKey = (n: LNode, s: Side) => `${n.id}:${s}`;
  const free = (k: string, pos: number) => (occupied.get(k) ?? []).every((q) => Math.abs(q - pos) >= minGap);
  const claim = (k: string, pos: number) => (occupied.get(k) ?? occupied.set(k, []).get(k)!).push(pos);
  // larger bundles first: they need the most room
  for (const rs of [...groups.values()].sort((a, b) => b.length - a.length)) {
    const r0 = rs[0];
    const [lo, hi] = overlap(...sideRange(r0.from, r0.fromSide), ...sideRange(r0.to, r0.toSide));
    const ideal = (i: number) => (rs.length === 1 ? (lo + hi) / 2 : lo + ((i + 1) * (hi - lo)) / (rs.length + 1));
    // try the ideal spread, then shift the whole bundle until every port is free
    let shift: number | undefined;
    for (let k = 0; k <= 40 && shift === undefined; k++) {
      for (const sgn of k ? [1, -1] : [1]) {
        const d = sgn * k * 8;
        const ok = rs.every((r, i) => {
          const pos = ideal(i) + d;
          return pos >= lo && pos <= hi && free(sideKey(r.from, r.fromSide), pos) && free(sideKey(r.to, r.toSide), pos);
        });
        if (ok) {
          shift = d;
          break;
        }
      }
    }
    if (shift === undefined) continue; // no room: leave these to the general spreading below
    rs.forEach((r, i) => {
      const pos = ideal(i) + shift!;
      const [ea, eb] = byRoute.get(r)!;
      ea.pos = eb.pos = pos;
      ea.fixed = eb.fixed = true;
      claim(sideKey(r.from, r.fromSide), pos);
      claim(sideKey(r.to, r.toSide), pos);
    });
  }

  // B: everything else aims at the other node's centre, then gets spread out
  const perSide = new Map<string, End[]>();
  for (const e of ends) {
    const k = `${e.node.id}:${e.side}`;
    (perSide.get(k) ?? perSide.set(k, []).get(k)!).push(e);
  }
  for (const list of perSide.values()) {
    const [lo, hi] = sideRange(list[0].node, list[0].side);
    for (const e of list) {
      if (e.fixed) continue;
      const oc = horizontalSide(e.side) ? e.other.y + e.other.h / 2 : e.other.x + e.other.w / 2;
      const [olo, ohi] = sideRange(e.other, e.side);
      // aim at the overlap with the other node if any, else at its centre
      const [a, b] = overlap(lo, hi, olo, ohi);
      e.pos = b > a ? (a + b) / 2 : Math.min(Math.max(oc, lo), hi);
    }
    list.sort((a, b) => a.pos! - b.pos!);
    for (let iter = 0; iter < 20; iter++) {
      let moved = false;
      for (let i = 1; i < list.length; i++) {
        const d = list[i].pos! - list[i - 1].pos!;
        if (d < minGap) {
          const push = (minGap - d) / 2;
          if (!list[i - 1].fixed) list[i - 1].pos! -= list[i].fixed ? 2 * push : push;
          if (!list[i].fixed) list[i].pos! += list[i - 1].fixed ? 2 * push : push;
          moved = true;
        }
      }
      for (const e of list) if (!e.fixed) e.pos = Math.min(Math.max(e.pos!, lo), hi);
      if (!moved) break;
    }
  }
  const out = new Map<Route, [number, number]>();
  for (const [r, [a, b]] of byRoute) out.set(r, [a.pos!, b.pos!]);
  return out;
}

interface Seg {
  a: Point;
  b: Point;
}

function segHitsBox(a: Point, b: Point, o: Box): boolean {
  // strict interior intersection of an axis-aligned segment with a box
  const eps = 0.01;
  if (a.y === b.y) {
    const y = a.y;
    if (y <= o.y + eps || y >= o.y + o.h - eps) return false;
    const x0 = Math.min(a.x, b.x);
    const x1 = Math.max(a.x, b.x);
    return x1 > o.x + eps && x0 < o.x + o.w - eps;
  }
  const x = a.x;
  if (x <= o.x + eps || x >= o.x + o.w - eps) return false;
  const y0 = Math.min(a.y, b.y);
  const y1 = Math.max(a.y, b.y);
  return y1 > o.y + eps && y0 < o.y + o.h - eps;
}

function inside(p: Point, o: Box): boolean {
  return p.x > o.x && p.x < o.x + o.w && p.y > o.y && p.y < o.y + o.h;
}

class Heap<T> {
  private items: { k: number; v: T }[] = [];
  push(k: number, v: T) {
    const it = this.items;
    it.push({ k, v });
    let i = it.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (it[p].k <= it[i].k) break;
      [it[p], it[i]] = [it[i], it[p]];
      i = p;
    }
  }
  pop(): T | undefined {
    const it = this.items;
    if (!it.length) return undefined;
    const top = it[0];
    const last = it.pop()!;
    if (it.length) {
      it[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < it.length && it[l].k < it[m].k) m = l;
        if (r < it.length && it[r].k < it[m].k) m = r;
        if (m === i) break;
        [it[m], it[i]] = [it[i], it[m]];
        i = m;
      }
    }
    return top.v;
  }
  get size() {
    return this.items.length;
  }
}

function uniqSorted(v: number[]): number[] {
  const s = [...v].sort((a, b) => a - b);
  const out: number[] = [];
  for (const x of s) if (!out.length || x - out[out.length - 1] > 0.5) out.push(x);
  return out;
}

const BEND = 40;

function astar(start: Point, startDir: Point, goal: Point, goalDir: Point, obstacles: Box[], bounds: Box, used: Seg[]): Point[] | undefined {
  const c = X.clearance;
  const xsRaw = [start.x, goal.x, bounds.x, bounds.x + bounds.w];
  const ysRaw = [start.y, goal.y, bounds.y, bounds.y + bounds.h];
  for (const o of obstacles) {
    xsRaw.push(o.x, o.x + o.w);
    ysRaw.push(o.y, o.y + o.h);
  }
  // corridor centre lines look hand-placed
  const addMid = (raw: number[]) => {
    const s = uniqSorted(raw);
    const mids = s.slice(1).map((v, i) => (v + s[i]) / 2);
    return uniqSorted([...s, ...mids]);
  };
  const xs = addMid(xsRaw);
  const ys = addMid(ysRaw);
  const xi = new Map(xs.map((v, i) => [v, i]));
  const yi = new Map(ys.map((v, i) => [v, i]));
  const find = (arr: number[], m: Map<number, number>, v: number) => m.get(v) ?? arr.findIndex((q) => Math.abs(q - v) < 0.6);
  const sx = find(xs, xi, start.x);
  const sy = find(ys, yi, start.y);
  const gx = find(xs, xi, goal.x);
  const gy = find(ys, yi, goal.y);
  if (sx < 0 || sy < 0 || gx < 0 || gy < 0) return undefined;

  const blocked = (p: Point) => obstacles.some((o) => inside(p, o));
  const dirs = [
    { x: 1, y: 0 },
    { x: -1, y: 0 },
    { x: 0, y: 1 },
    { x: 0, y: -1 },
  ];
  const dirIndex = (d: Point) => dirs.findIndex((q) => q.x === d.x && q.y === d.y);
  const key = (i: number, j: number, d: number) => (i * ys.length + j) * 4 + d;
  const best = new Map<number, number>();
  const prev = new Map<number, number>();
  const heap = new Heap<[number, number, number, number]>(); // i, j, dir, g
  const h = (i: number, j: number) => Math.abs(xs[i] - goal.x) + Math.abs(ys[j] - goal.y);
  const sd = dirIndex(startDir);
  const k0 = key(sx, sy, sd);
  best.set(k0, 0);
  heap.push(h(sx, sy), [sx, sy, sd, 0]);
  const gdIn = dirIndex(goalDir); // direction of travel when arriving at the goal

  const penalty = (a: Point, b: Point): number => {
    let p = 0;
    const horiz = a.y === b.y;
    for (const s of used) {
      const sh = s.a.y === s.b.y;
      if (horiz && sh && Math.abs(s.a.y - a.y) < c * 0.6) {
        const [l, r] = overlap(Math.min(a.x, b.x), Math.max(a.x, b.x), Math.min(s.a.x, s.b.x), Math.max(s.a.x, s.b.x));
        if (r > l) p += (r - l) * 3 + 60;
      } else if (!horiz && !sh && Math.abs(s.a.x - a.x) < c * 0.6) {
        const [l, r] = overlap(Math.min(a.y, b.y), Math.max(a.y, b.y), Math.min(s.a.y, s.b.y), Math.max(s.a.y, s.b.y));
        if (r > l) p += (r - l) * 3 + 60;
      } else if (horiz !== sh) {
        const hs = horiz ? { a, b } : s;
        const vs = horiz ? s : { a, b };
        const y = hs.a.y;
        const x = vs.a.x;
        if (x > Math.min(hs.a.x, hs.b.x) && x < Math.max(hs.a.x, hs.b.x) && y > Math.min(vs.a.y, vs.b.y) && y < Math.max(vs.a.y, vs.b.y)) p += 25;
      }
    }
    return p;
  };

  let found: number | undefined;
  let guard = 0;
  while (heap.size && guard++ < 200000) {
    const [i, j, d, g] = heap.pop()!;
    const k = key(i, j, d);
    if (g > (best.get(k) ?? Infinity)) continue;
    if (i === gx && j === gy) {
      if (d === gdIn) {
        found = k;
        break;
      }
      continue;
    }
    for (let nd = 0; nd < 4; nd++) {
      const dv = dirs[nd];
      if (dv.x === -dirs[d].x && dv.y === -dirs[d].y) continue; // no U-turns
      const ni = i + dv.x;
      const nj = j + dv.y;
      if (ni < 0 || nj < 0 || ni >= xs.length || nj >= ys.length) continue;
      const a = { x: xs[i], y: ys[j] };
      const b = { x: xs[ni], y: ys[nj] };
      if (blocked(b) && !(ni === gx && nj === gy)) continue;
      if (obstacles.some((o) => segHitsBox(a, b, o))) continue;
      const len = Math.abs(b.x - a.x) + Math.abs(b.y - a.y);
      const ng = g + len + (nd !== d ? BEND : 0) + penalty(a, b);
      const nk = key(ni, nj, nd);
      if (ng < (best.get(nk) ?? Infinity)) {
        best.set(nk, ng);
        prev.set(nk, k);
        heap.push(ng + h(ni, nj), [ni, nj, nd, ng]);
      }
    }
  }
  if (found === undefined) return undefined;
  const pts: Point[] = [];
  for (let k: number | undefined = found; k !== undefined; k = prev.get(k)) {
    const cell = Math.floor(k / 4);
    pts.push({ x: xs[Math.floor(cell / ys.length)], y: ys[cell % ys.length] });
  }
  return pts.reverse();
}

function simplify(pts: Point[]): Point[] {
  const out: Point[] = [];
  for (const p of pts) {
    if (out.length && Math.abs(out[out.length - 1].x - p.x) < 0.01 && Math.abs(out[out.length - 1].y - p.y) < 0.01) continue;
    out.push(p);
    while (out.length >= 3) {
      const [a, b, c] = out.slice(-3);
      if ((a.x === b.x && b.x === c.x) || (a.y === b.y && b.y === c.y)) out.splice(out.length - 2, 1);
      else break;
    }
  }
  return out;
}

function fallback(a: Point, as: Side, b: Point): Point[] {
  if (horizontalSide(as)) {
    const mx = (a.x + b.x) / 2;
    return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
  }
  const my = (a.y + b.y) / 2;
  return [a, { x: a.x, y: my }, { x: b.x, y: my }, b];
}

export function routeAll(layout: Layout): Route[] {
  const routes: Route[] = [];
  for (const conn of layout.connections) {
    const from = layout.nodes.get(conn.from)!;
    const to = layout.nodes.get(conn.to)!;
    const [fromSide, toSide] = chooseSides(from, to, conn, [...layout.nodes.values()]);
    routes.push({ conn, from, to, fromSide, toSide, points: [] });
  }
  const ports = assignPorts(routes);
  const framed = [...layout.nodes.values()].filter((n) => n.framed);
  const bounds: Box = { x: 2, y: layout.header.h + 4, w: layout.width - 4, h: layout.height - layout.header.h - 6 };
  const used: Seg[] = [];
  const c = X.clearance;

  // route shorter connections first: they have the least freedom
  const order = [...routes].sort((r1, r2) => {
    const d = (r: Route) => Math.abs(r.from.x - r.to.x) + Math.abs(r.from.y - r.to.y);
    return d(r1) - d(r2);
  });
  for (const r of order) {
    const [pa, pb] = ports.get(r)!;
    const A = portPoint(r.from, r.fromSide, pa);
    const B = portPoint(r.to, r.toSide, pb);
    const da = outward(r.fromSide);
    const db = outward(r.toSide);
    const SA = { x: A.x + da.x * c, y: A.y + da.y * c };
    const SB = { x: B.x + db.x * c, y: B.y + db.y * c };
    const skip = new Set<LNode>([r.from, r.to, ...ancestors(r.from), ...ancestors(r.to)]);
    let obstacles = framed
      .filter((n) => !skip.has(n))
      .map((n) => ({ x: n.x - c, y: n.y - c, w: n.w + 2 * c, h: n.h + 2 * c }));
    // where nodes sit closer than the clearance, fall back to their bare outline
    obstacles = obstacles.map((o) =>
      inside(SA, o) || inside(SB, o) ? { x: o.x + c - 1, y: o.y + c - 1, w: o.w - 2 * c + 2, h: o.h - 2 * c + 2 } : o,
    );
    obstacles = obstacles.filter((o) => !inside(SA, o) && !inside(SB, o));
    let mid = astar(SA, da, SB, { x: -db.x, y: -db.y }, obstacles, bounds, used);
    // straight shot if ports line up
    const straight = (A.x === B.x || A.y === B.y) && !obstacles.some((o) => segHitsBox(A, B, o));
    let pts: Point[];
    if (straight && ((A.y === B.y && horizontalSide(r.fromSide)) || (A.x === B.x && !horizontalSide(r.fromSide)))) pts = [A, B];
    else if (mid) pts = simplify([A, ...mid, B]);
    else pts = simplify(fallback(A, r.fromSide, B));
    r.points = pts;
    for (let i = 1; i < pts.length; i++) used.push({ a: pts[i - 1], b: pts[i] });
  }
  placeLabels(routes);
  return routes;
}

function placeLabels(routes: Route[]): void {
  const taken: Box[] = [];
  const segsOf = (r: Route) => r.points.slice(1).map((b, i) => ({ a: r.points[i], b }));
  for (const r of routes) {
    const { label, step } = r.conn;
    if (!label && !step) continue;
    const pw = label ? measure(label, X.pillSize, 700) + 2 * X.pillPadX : 0;
    const ph = X.pillHeight;
    const sw = step ? X.stepSize + (label ? 5 : 0) : 0;
    const total = pw + sw;
    const others = routes.filter((o) => o !== r).flatMap(segsOf);
    const last = r.points.length - 1;
    const arrowAtStart = r.conn.arrow === 'start' || r.conn.arrow === 'both';

    // rank segments by free room around the pill; horizontal wins ties
    const cands = segsOf(r)
      .map(({ a, b }, k) => {
        const i = k + 1;
        const len = Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
        const need = a.y === b.y ? total : ph;
        const room = len - need - (i === last ? X.arrowLength + 8 : 0) - (i === 1 && arrowAtStart ? X.arrowLength + 8 : 0);
        return { a, b, score: room >= 24 ? room + (a.y === b.y ? 60 : 0) : room - 1000 };
      })
      .sort((p, q) => q.score - p.score);

    const boxAt = (a: Point, b: Point, t: number): Box => {
      const p = { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
      return { x: p.x - total / 2, y: p.y - ph / 2, w: total, h: ph };
    };
    const clash = (bx: Box) =>
      taken.some((o) => bx.x < o.x + o.w + 4 && bx.x + bx.w + 4 > o.x && bx.y < o.y + o.h + 4 && bx.y + bx.h + 4 > o.y) ||
      others.some(({ a, b }) => segHitsBox(a, b, { x: bx.x - 3, y: bx.y - 3, w: bx.w + 6, h: bx.h + 6 }));
    let chosen: Box | undefined;
    search: for (const c of cands) {
      for (const t of [0.5, 0.4, 0.6, 0.3, 0.7, 0.2, 0.8]) {
        const bx = boxAt(c.a, c.b, t);
        if (!clash(bx)) {
          chosen = bx;
          break search;
        }
      }
    }
    const bx = chosen ?? boxAt(cands[0].a, cands[0].b, 0.5);
    taken.push(bx);
    if (step) r.step = { x: bx.x + X.stepSize / 2, y: bx.y + ph / 2, n: step };
    if (label) r.label = { x: bx.x + sw, y: bx.y, w: pw, h: ph, text: label };
  }
}
