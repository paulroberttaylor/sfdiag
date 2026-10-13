import { describe, expect, it } from 'vitest';
import { svgToPng } from '../src/png.js';
import { compileExample, exampleFiles } from './helpers.js';

describe.each(exampleFiles)('render %s', (file) => {
  it('produces a well-formed SVG and a PNG', () => {
    const { svg } = compileExample(file);
    expect(svg).toMatch(/^<svg[^>]+role="img"/);
    expect(svg).toContain('<title>');
    const png = svgToPng(svg!, 1);
    expect(png.subarray(1, 4).toString()).toBe('PNG');
  });
});
