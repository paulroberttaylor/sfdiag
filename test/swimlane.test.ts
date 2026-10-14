import { describe, expect, it } from 'vitest';
import { compile } from '../src/index.js';
import { compileExample } from './helpers.js';

const centre = (n: { x: number; y: number; w: number; h: number }) => ({ x: n.x + n.w / 2, y: n.y + n.h / 2 });

describe('swimlanes', () => {
  const { layout } = compileExample('refund-approval-swimlane.yaml');
  const n = (id: string) => layout.nodes.get(id)!;

  it('lays out one lane per entry with the steps inside their lane', () => {
    const s = layout.swimlanes!;
    expect(s.lanes.map((l) => l.label)).toEqual(['Customer', 'Service Cloud', 'Service Agent', 'Manager']);
    const inside = (id: string, li: number) => {
      const l = s.lanes[li];
      const c = centre(n(id));
      return c.y > l.y && c.y < l.y + l.h && c.x > l.x + s.stripW && c.x < l.x + l.w;
    };
    expect(inside('request', 0) && inside('notified', 0)).toBe(true);
    expect(inside('case', 1) && inside('pay', 1)).toBe(true);
    expect(inside('approve', 3)).toBe(true);
  });

  it('orders steps by position across lanes', () => {
    const xs = ['request', 'case', 'review', 'limit', 'approve', 'pay', 'notified'].map((id) => centre(n(id)).x);
    for (let i = 1; i < xs.length; i++) expect(xs[i]).toBeGreaterThan(xs[i - 1]);
  });

  it('lines up steps that share a position, defaults `at` to the next position, and stacks shared cells', () => {
    const r = compile(
      [
        'title: T',
        'swimlanes:',
        '  lanes:',
        '    - title: A',
        '      steps: [{ id: a1, title: One }, { id: a2, title: Two }]',
        '    - title: B',
        '      steps: [{ id: b2, title: Two too, at: 2 }, { id: b2b, title: Also two, at: 2 }]',
      ].join('\n'),
    );
    const L = r.layout!;
    const c = (id: string) => centre(L.nodes.get(id)!);
    expect(c('a2').x).toBeCloseTo(c('b2').x, 5);
    expect(c('a1').x).toBeLessThan(c('a2').x);
    expect(c('b2b').y).toBeGreaterThan(c('b2').y + L.nodes.get('b2')!.h);
  });

  it('runs lanes as columns when vertical', () => {
    const r = compile('title: T\nswimlanes:\n  orientation: vertical\n  lanes:\n    - { title: A, steps: [{ id: a, title: A1 }] }\n    - { title: B, steps: [{ id: b, title: B1, at: 2 }] }\n');
    const L = r.layout!;
    expect(centre(L.nodes.get('b')!).x).toBeGreaterThan(centre(L.nodes.get('a')!).x);
    expect(centre(L.nodes.get('b')!).y).toBeGreaterThan(centre(L.nodes.get('a')!).y);
  });

  it('validates steps like any card', () => {
    const r = compile('title: T\nswimlanes:\n  lanes:\n    - { title: A, steps: [{ id: a, title: A1, icon: not-an-icon }] }\n');
    expect(r.validation.errors.some((e) => e.message.includes('unknown icon'))).toBe(true);
  });
});
