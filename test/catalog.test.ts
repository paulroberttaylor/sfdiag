import { describe, expect, it } from 'vitest';
import { catalog, resolveIcon, sldsGlyphExists } from '../src/catalog.js';

describe('catalog', () => {
  it('every catalog glyph exists in the SLDS icon package', () => {
    const missing = Object.entries(catalog).filter(([, d]) => !sldsGlyphExists(d.glyph)).map(([id, d]) => `${id} -> ${d.glyph}`);
    expect(missing).toEqual([]);
  });
  it('resolves ids, aliases and slds: refs', () => {
    expect(resolveIcon('sales-cloud')?.color).toBe('#18827C');
    expect(resolveIcon('sales')?.id).toBe('sales-cloud');
    expect(resolveIcon('slds:knowledge_base/teal')?.color).toBe('#18827C');
    expect(resolveIcon('nope')).toBeUndefined();
  });
  it('reads each glyph viewBox (some are 0 0 52 52, most 0 0 520 520)', () => {
    expect(resolveIcon('slack')!.glyph.viewBox).toBe('0 0 52 52');
    expect(resolveIcon('tableau')!.glyph.viewBox).toBe('0 0 520 520');
  });
});
