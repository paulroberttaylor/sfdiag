import { describe, expect, it } from 'vitest';
import { compile } from '../src/index.js';
import { routeAll } from '../src/route.js';

const build = (yaml: string) => {
  const r = compile(yaml);
  if (!r.layout) throw new Error(JSON.stringify(r.validation.errors));
  return { ...r, layout: r.layout!, routes: routeAll(r.layout!) };
};

describe('layout features', () => {
  it('grow weights set width shares within a row', () => {
    const { layout } = build(`title: T
nodes:
  - id: row
    frame: none
    children:
      - { id: a, title: A, grow: 1 }
      - { id: b, title: B, grow: 3 }
      - { id: c, title: C, grow: 1 }
`);
    const [a, b, c] = ['a', 'b', 'c'].map((id) => layout.nodes.get(id)!);
    expect(b.w / a.w).toBeCloseTo(3, 1);
    expect(c.w).toBeCloseTo(a.w, 1);
  });

  it('an explicit width is exact and does not spread to siblings', () => {
    const { layout } = build(`title: T
nodes:
  - id: row
    frame: none
    children:
      - { id: a, title: A, width: 400 }
      - { id: b, title: B }
`);
    expect(layout.nodes.get('a')!.nw).toBe(400);
    expect(layout.nodes.get('b')!.nw).toBeLessThan(400);
  });

  it('column containers put their attributes above the children', () => {
    const { layout } = build(`title: T
nodes:
  - id: box
    title: Box
    layout: column
    attributes: [One, Two]
    children: [{ id: a, title: A }]
`);
    const box = layout.nodes.get('box')!;
    const a = layout.nodes.get('a')!;
    expect(a.y).toBeGreaterThan(box.y + box.attrY + box.attrDY[1]);
    expect(a.x - box.x).toBeLessThan(20);
  });

  it('indents attributes that start with two spaces', () => {
    const { layout } = build(`title: T
nodes:
  - { id: a, title: A, attributes: [Lead, "  Sub item"] }
`);
    const a = layout.nodes.get('a')!;
    expect(a.attrDX[1]).toBeGreaterThan(a.attrDX[0]);
    expect(a.attrLines[1]).toBe('Sub item');
  });
});

describe('routing features', () => {
  it('unlabelled fan-outs share one trunk and a bus line', () => {
    const { routes } = build(`title: T
nodes:
  - { id: boss, title: Boss }
  - id: team
    frame: none
    children: [{ id: a, title: A }, { id: b, title: B }, { id: c, title: C }]
connections:
  - { from: boss, to: a }
  - { from: boss, to: b }
  - { from: boss, to: c }
`);
    const starts = new Set(routes.map((r) => `${r.points[0].x},${r.points[0].y}`));
    expect(starts.size).toBe(1);
    const busYs = new Set(routes.filter((r) => r.points.length > 2).map((r) => r.points[1].y));
    expect(busYs.size).toBe(1);
  });

  it('multi-line labels make taller pills', () => {
    const { routes } = build(`title: T
layout: row
nodes: [{ id: a, title: A }, { id: b, title: B }]
connections:
  - { from: a, to: b, label: "Order on behalf\\nOrder history" }
`);
    expect(routes[0].label!.lines).toEqual(['Order on behalf', 'Order history']);
    expect(routes[0].label!.h).toBeGreaterThan(20);
  });
});

describe('header features', () => {
  it('renders markdown links in the description as links', () => {
    const { svg } = build(`title: T
description: See the [Salesforce Diagrams](https://architect.salesforce.com/diagrams) guide.
nodes: [{ id: a, title: A }]
`);
    expect(svg).toContain('<a href="https://architect.salesforce.com/diagrams">');
    expect(svg).toContain('>Salesforce Diagrams<');
    expect(svg).not.toContain('](');
  });

  it('packs a small key into a single row', () => {
    const { layout } = build(`title: T
keyLabels: { flow: Automation, apex: Code, database: Data, security: Privacy }
nodes: [{ id: a, title: A }]
`);
    expect(layout.header.key!.rows).toBe(1);
    expect(layout.header.key!.entries.map((e) => e.label)).toEqual(['Automation', 'Code', 'Data', 'Privacy']);
  });
});

describe('timeline', () => {
  it('places cards across periods and stacks overlaps into sub-rows', () => {
    const { layout } = build(`title: Roadmap
timeline:
  periods: [Jan, Feb, Mar, Apr]
  lanes:
    - title: Sales
      items:
        - { id: a, title: A, from: Jan, to: Feb }
        - { id: b, title: B, from: Feb, to: Mar }
        - { id: c, title: C, from: Mar, to: Apr }
`);
    const t = layout.timeline!;
    const [a, b, c] = ['a', 'b', 'c'].map((id) => layout.nodes.get(id)!);
    expect(a.x).toBeGreaterThan(t.periods[0].x);
    expect(a.x + a.w).toBeLessThan(t.periods[2].x);
    expect(b.y).toBeGreaterThan(a.y); // overlaps A, so it drops to the next row
    expect(c.y).toBe(a.y); // clear of A, so it shares A's row
  });

  it('rejects unknown period names with a suggestion', async () => {
    const { validateSource } = await import('../src/validate.js');
    const r = validateSource(`title: R
timeline:
  periods: [January, February]
  lanes: [{ title: L, items: [{ id: a, title: A, from: Febuary }] }]
`);
    expect(r.errors[0].hint).toContain('February');
  });
});
