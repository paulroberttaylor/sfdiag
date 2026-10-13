import { describe, expect, it } from 'vitest';
import type { Box, LNode } from '../src/layout.js';
import { compileExample, exampleFiles } from './helpers.js';

const overlaps = (a: Box, b: Box) => a.x < b.x + b.w - 0.5 && b.x < a.x + a.w - 0.5 && a.y < b.y + b.h - 0.5 && b.y < a.y + a.h - 0.5;
const within = (inner: Box, outer: Box) => inner.x >= outer.x - 0.5 && inner.y >= outer.y - 0.5 && inner.x + inner.w <= outer.x + outer.w + 0.5 && inner.y + inner.h <= outer.y + outer.h + 0.5;

describe.each(exampleFiles)('layout %s', (file) => {
  const { layout } = compileExample(file);
  const all = [...layout.nodes.values()];

  it('siblings never overlap', () => {
    const check = (n: LNode) => {
      for (let i = 0; i < n.children.length; i++)
        for (let j = i + 1; j < n.children.length; j++) expect(overlaps(n.children[i], n.children[j]), `${n.children[i].id} vs ${n.children[j].id}`).toBe(false);
      n.children.forEach(check);
    };
    check(layout.root);
  });

  it('children sit inside their parent, below its title rule', () => {
    for (const n of all) {
      if (!n.parent || n.parent.id === '__root') continue;
      expect(within(n, n.parent), n.id).toBe(true);
      if (n.parent.framed) expect(n.y).toBeGreaterThan(n.parent.y + n.parent.ruleY);
    }
  });

  it('everything is below the header and inside the canvas', () => {
    for (const n of all) {
      expect(n.y).toBeGreaterThan(layout.header.h);
      expect(within(n, { x: 0, y: 0, w: layout.width, h: layout.height }), n.id).toBe(true);
    }
  });
});
