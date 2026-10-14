import { describe, expect, it } from 'vitest';
import { ancestors } from '../src/layout.js';
import { compileExample, exampleFiles } from './helpers.js';

describe.each(exampleFiles)('routing %s', (file) => {
  const { layout, routes } = compileExample(file);

  it('every connection is orthogonal and starts/ends on its nodes', () => {
    for (const r of routes) {
      for (let i = 1; i < r.points.length; i++) {
        const a = r.points[i - 1];
        const b = r.points[i];
        expect(Math.abs(a.x - b.x) < 0.01 || Math.abs(a.y - b.y) < 0.01, `${r.conn.from}->${r.conn.to}`).toBe(true);
      }
      const onEdge = (p: { x: number; y: number }, n: { x: number; y: number; w: number; h: number }) =>
        (Math.abs(p.x - n.x) < 0.01 || Math.abs(p.x - n.x - n.w) < 0.01 || Math.abs(p.y - n.y) < 0.01 || Math.abs(p.y - n.y - n.h) < 0.01);
      expect(onEdge(r.points[0], r.from)).toBe(true);
      expect(onEdge(r.points[r.points.length - 1], r.to)).toBe(true);
    }
  });

  it('connections do not pass through unrelated cards', () => {
    const cards = [...layout.nodes.values()].filter((n) => n.framed);
    for (const r of routes) {
      const skip = new Set([r.from, r.to, ...ancestors(r.from), ...ancestors(r.to)]);
      for (const n of cards) {
        if (skip.has(n)) continue;
        for (let i = 1; i < r.points.length; i++) {
          const a = r.points[i - 1];
          const b = r.points[i];
          const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
          const hit = x1 > n.x + 1 && x0 < n.x + n.w - 1 && y1 > n.y + 1 && y0 < n.y + n.h - 1;
          expect(hit, `${r.conn.from}->${r.conn.to} crosses ${n.id}`).toBe(false);
        }
      }
    }
  });

  it('connections do not cut back across their own end cards', () => {
    for (const r of routes) {
      for (const n of [r.from, r.to]) {
        if (!n.framed || n.children.length) continue;
        for (let i = 1; i < r.points.length; i++) {
          const a = r.points[i - 1];
          const b = r.points[i];
          const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
          const hit = x1 > n.x + 1 && x0 < n.x + n.w - 1 && y1 > n.y + 1 && y0 < n.y + n.h - 1;
          expect(hit, `${r.conn.from}->${r.conn.to} crosses its end ${n.id}`).toBe(false);
        }
      }
    }
  });

  it('labels do not overlap each other', () => {
    const boxes = routes.map((r) => r.label).filter((b): b is NonNullable<typeof b> => !!b);
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h, `${a.text} vs ${b.text}`).toBe(false);
      }
  });
});

it('a sideways exit into a bottom entry makes a single clean L', () => {
  const { routes } = compileExample('order-of-execution.yaml');
  const r = routes.find((x) => x.conn.from === 's2c' && x.conn.to === 'd2')!;
  expect(r.points).toHaveLength(3);
});

it('a decision branches down to side cards from its left and right points', () => {
  const { routes } = compileExample('approval-workflow.yaml');
  const side = (to: string) => routes.find((x) => x.conn.from === 'review' && x.conn.to === to)!;
  expect([side('approve').fromSide, side('approve').toSide]).toEqual(['left', 'top']);
  expect([side('reject').fromSide, side('reject').toSide]).toEqual(['right', 'top']);
});
