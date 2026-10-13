import { describe, expect, it } from 'vitest';
import { validateSource } from '../src/validate.js';

const base = `title: T\nnodes:\n  - id: a\n    title: A\n  - id: b\n    title: B\n`;

describe('validate', () => {
  it('accepts a minimal diagram', () => {
    expect(validateSource(base).ok).toBe(true);
  });
  it('reports YAML syntax errors with a line', () => {
    const r = validateSource('title: [unclosed\nnodes: []');
    expect(r.ok).toBe(false);
    expect(r.errors[0].line).toBeDefined();
  });
  it('suggests close matches for unknown keys', () => {
    const r = validateSource(base.replace('title: A', 'tittle: A'));
    expect(r.errors.some((e) => e.hint?.includes('did you mean "title"'))).toBe(true);
  });
  it('flags dangling connection ids with suggestions and line numbers', () => {
    const r = validateSource(`${base}connections:\n  - { from: a, to: bb }\n`);
    const e = r.errors.find((x) => x.path === 'connections[0].to')!;
    expect(e.hint).toContain('"b"');
    expect(e.line).toBe(8);
  });
  it('flags unknown icons with suggestions', () => {
    const r = validateSource(base.replace('title: A', 'title: A\n    icon: sales-clod'));
    expect(r.errors[0].hint).toContain('sales-cloud');
  });
  it('flags duplicate ids and untitled cards', () => {
    const r = validateSource(`title: T\nnodes:\n  - id: a\n    title: A\n  - id: a\n  - id: g\n    frame: none\n    children: [{id: c, title: C}]\n`);
    expect(r.errors.map((e) => e.message)).toEqual(['duplicate id "a"', 'card "a" needs a title']);
  });
});
