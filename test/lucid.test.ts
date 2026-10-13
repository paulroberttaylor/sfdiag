import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { exportLucid } from '../src/lucid.js';
import { compileExample, exampleFiles } from './helpers.js';

const ID = /^[A-Za-z0-9\-_.~]{1,36}$/;

describe('lucid export', () => {
  for (const f of exampleFiles) {
    it(`${f} produces a valid Standard Import archive`, async () => {
      const { layout, routes } = compileExample(f);
      const zip = await JSZip.loadAsync(await exportLucid(layout));
      const doc = JSON.parse(await zip.file('document.json')!.async('string'));
      expect(doc.version).toBe(1);
      expect(doc.documentSettings.units).toBe('px');
      expect(doc.pages).toHaveLength(1);
      const page = doc.pages[0];
      expect(page.settings.infiniteCanvas).toBe(true);

      const ids: string[] = [page.id, ...page.shapes.map((s: any) => s.id), ...page.lines.map((s: any) => s.id), ...page.groups.map((s: any) => s.id)];
      for (const id of ids) expect(id).toMatch(ID);
      expect(new Set(ids).size).toBe(ids.length);

      const tol = 20;
      for (const s of page.shapes) {
        const b = s.boundingBox;
        expect(b.w).toBeGreaterThan(0);
        expect(b.h).toBeGreaterThan(0);
        expect(b.x).toBeGreaterThanOrEqual(-tol);
        expect(b.y).toBeGreaterThanOrEqual(-tol);
        expect(b.x + b.w).toBeLessThanOrEqual(layout.width + tol);
        expect(b.y + b.h).toBeLessThanOrEqual(layout.height + tol);
        if (s.type === 'flexiblePolygon') {
          expect(s.vertices.length).toBeGreaterThanOrEqual(3);
          expect(s.vertices.length).toBeLessThanOrEqual(100);
        }
      }

      const shapeIds = new Set(page.shapes.map((s: any) => s.id));
      expect(page.lines.filter((l: any) => l.lineType === 'elbow')).toHaveLength(routes.length);
      for (const l of page.lines) {
        for (const e of [l.endpoint1, l.endpoint2]) {
          if (e.type === 'shapeEndpoint') {
            expect(shapeIds.has(e.shapeId)).toBe(true);
            expect(e.position.x).toBeGreaterThanOrEqual(0);
            expect(e.position.x).toBeLessThanOrEqual(1);
          }
        }
      }
      const allItems = new Set([...shapeIds, ...page.lines.map((l: any) => l.id)]);
      for (const g of page.groups) for (const i of g.items) expect(allItems.has(i)).toBe(true);

      const files = new Set(Object.keys(zip.files).filter((n) => n.startsWith('images/')).map((n) => n.slice(7)));
      const refs = page.shapes.filter((s: any) => s.type === 'image').map((s: any) => s.image.ref);
      expect(refs.length).toBeGreaterThan(0);
      for (const r of refs) expect(files.has(r)).toBe(true);

      let framed = 0;
      const walk = (n: any) => {
        if (n.framed) framed++;
        n.children.forEach(walk);
      };
      layout.root.children.forEach(walk);
      expect(page.shapes.filter((s: any) => s.id.startsWith('card-'))).toHaveLength(framed);
    });
  }

  it('escapes text', async () => {
    const { layout } = compileExample(exampleFiles[0]);
    layout.input.title = 'A <b> & C';
    layout.header.titleLines = ['A <b> & C'];
    const zip = await JSZip.loadAsync(await exportLucid(layout));
    const s = await zip.file('document.json')!.async('string');
    expect(s).toContain('A &lt;b&gt; &amp; C');
  });
});
