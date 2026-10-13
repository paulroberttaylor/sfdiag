import { Resvg } from '@resvg/resvg-js';
import { loadFonts } from './text.js';

export function svgToPng(svg: string, scale = 2): Buffer {
  const fonts = loadFonts();
  const r = new Resvg(svg, {
    fitTo: { mode: 'zoom', value: scale },
    font: {
      fontFiles: Object.values(fonts.files),
      loadSystemFonts: false,
      defaultFontFamily: fonts.family,
    },
    shapeRendering: 2,
    textRendering: 1,
  });
  return r.render().asPng();
}
