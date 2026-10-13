// Visual tokens measured from the official Salesforce Architects diagrams
// (architect.salesforce.com/diagrams). Units are CSS px at 1x; PNGs render at 2x.

export const palette: Record<string, string> = {
  navy: '#032D60',
  blue: '#0176D3',
  cloud: '#00A1E0',
  teal: '#18827C',
  maroon: '#89093F',
  orange: '#DD7A01',
  green: '#3B6548',
  lightgreen: '#7DC37D',
  purple: '#5A25A6',
  indigo: '#321D71',
  darkpurple: '#200E37',
  lavender: '#7F8DE1',
  red: '#BA0517',
  yellow: '#FCC003',
  grey: '#747474',
  black: '#000000',
  white: '#FFFFFF',
};

export const theme = {
  font: {
    family: 'Nunito Sans',
    regular: 400,
    semibold: 600,
    bold: 700,
  },
  canvas: { background: '#FFFFFF', margin: 24, headerGap: 34, topGap: 30 },
  header: {
    band: '#E5E5E5',
    text: '#032D60',
    titleSize: 22,
    descSize: 10.5,
    descLineHeight: 16,
    padX: 26,
    padY: 22,
    minHeight: 150,
    keyPad: 18,
    keyInset: 20,
    keyIcon: 32,
    keyLabelSize: 10.5,
    keyRowHeight: 44,
    keyColGap: 14,
  },
  card: {
    border: '#747474',
    borderWidth: 1.5,
    radius: 10,
    fill: '#FFFFFF',
    shadow: '#000000',
    shadowOpacity: 0.22,
    pad: 12,
    icon: 42,
    iconTop: 11,
    titleSize: 12.5,
    titleColor: '#000000',
    titleCenterY: 32,
    titleLineHeight: 16,
    ruleColor: '#E5E5E5',
    ruleWidth: 1.5,
    ruleGap: 13, // title centre -> rule
    attrSize: 9.5,
    attrColor: '#000000',
    attrLineHeight: 19.5,
    attrFirstGap: 15, // rule -> first attribute centre
    bottomPad: 20,
    minWidth: 170,
    maxTitleWidth: 210,
    footerBand: '#E5E5E5',
    footerBandHeight: 21,
    footerSize: 9,
    footerIcon: 28,
    footerIconGap: 12,
    footerIconPadY: 11,
  },
  container: {
    pad: 14,
    bodyGap: 21, // rule -> first child
    bottomPad: 16,
    gap: 20,
    attrColumnGap: 24,
  },
  connector: {
    color: '#3A414A',
    width: 1.5,
    arrowLength: 9,
    arrowWidth: 7,
    dash: '6 4',
    dot: '1.5 3',
    pillHeight: 18,
    pillPadX: 10,
    pillSize: 9.5,
    pillBorder: 1.5,
    stepSize: 16,
    stepFill: '#032D60',
    clearance: 14, // min distance kept between a routed line and a card
    labelGap: 24, // space either side of a pill inside a gap
    decisionSize: 9.5,
    decisionLineHeight: 12.5,
  },
} as const;

export type Theme = typeof theme;

export function resolveColor(c: string | undefined, fallback: string): string {
  if (!c) return fallback;
  if (c.startsWith('#')) return c;
  return palette[c] ?? fallback;
}
