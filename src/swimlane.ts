import type { DiagramInput } from './schema.js';
import type { Box, LNode } from './layout.js';
import { wrap } from './text.js';

// Swimlanes: one lane per actor or system, steps placed at sequence positions (`at`).
// Steps sharing a position line up across lanes; steps sharing a lane and position stack.
// Horizontal (default): lanes are rows and the flow runs left to right. Vertical: lanes
// are columns and the flow runs top to bottom.

export type SwimlanesInput = NonNullable<DiagramInput['swimlanes']>;

export interface SwimlaneLayout extends Box {
  vertical: boolean;
  /** label strip size: width (horizontal) or height (vertical) */
  stripW: number;
  lanes: { label: string; lines: string[]; x: number; y: number; w: number; h: number; fill?: string }[];
}

const LABEL_SIZE = 14;
const PAD = 26; // lane edge to its steps
const STACK_GAP = 24; // between steps sharing a cell
const STEP_GAP = 64; // between positions: room for connectors and their labels

export interface SwimlaneStep {
  lane: number;
  at: number;
  node: LNode;
}

/** Sequence positions: explicit `at`, else one after the lane's previous step. */
export function stepPositions(s: SwimlanesInput): number[][] {
  return s.lanes.map((l) => {
    let prev = 0;
    return l.steps.map((st) => (prev = st.at ?? prev + 1));
  });
}

export function layoutSwimlanes(s: SwimlanesInput, steps: SwimlaneStep[], left: number, top: number, minW: number): SwimlaneLayout {
  const vertical = s.orientation === 'vertical';
  const ats = [...new Set(steps.map((st) => st.at))].sort((a, b) => a - b);
  const gap = s.gap ?? STEP_GAP;
  // along = the flow axis, across = the lane axis
  const along = (n: LNode) => (vertical ? n.nh : n.nw);
  const across = (n: LNode) => (vertical ? n.nw : n.nh);
  const cell = (lane: number, at: number) => steps.filter((st) => st.lane === lane && st.at === at);

  const stripW = vertical ? 44 : Math.max(110, Math.min(180, s.labelWidth ?? 150));
  const laneLines = s.lanes.map((l) => wrap(l.title, LABEL_SIZE, 700, vertical ? 400 : stripW - 24));
  // each position is as long as its longest step; each lane as thick as its fullest cell
  const slot = ats.map((at) => Math.max(...steps.filter((st) => st.at === at).map((st) => along(st.node))));
  const laneThick = s.lanes.map((l, li) => {
    const fullest = Math.max(0, ...ats.map((at) => cell(li, at).reduce((sum, st, i) => sum + across(st.node) + (i ? STACK_GAP : 0), 0)));
    const label = vertical ? 0 : laneLines[li].length * LABEL_SIZE * 1.3 + 24;
    return Math.max(s.laneSize ?? 0, fullest + 2 * PAD, label, vertical ? 200 : 110);
  });
  // spread spare width (e.g. a wide header) into the gaps between positions
  const natural = PAD + slot.reduce((a, b) => a + b, 0) + gap * Math.max(0, ats.length - 1) + PAD;
  const room = vertical ? 0 : Math.max(0, minW - stripW - natural);
  const g = ats.length > 1 ? gap + room / (ats.length - 1) : gap;
  const pad = ats.length > 1 ? PAD : PAD + room / 2;
  const start = ats.map((_, i) => pad + slot.slice(0, i).reduce((a, b) => a + b, 0) + i * g);
  const flowLen = 2 * pad + slot.reduce((a, b) => a + b, 0) + g * Math.max(0, ats.length - 1);

  const lanes: SwimlaneLayout['lanes'] = [];
  let off = 0;
  s.lanes.forEach((l, li) => {
    const thick = laneThick[li];
    const lx = vertical ? left + off : left;
    const ly = vertical ? top : top + off;
    lanes.push({
      label: l.title,
      lines: laneLines[li],
      x: lx,
      y: ly,
      w: vertical ? thick : stripW + flowLen,
      h: vertical ? stripW + flowLen : thick,
      fill: l.fill,
    });
    ats.forEach((at, ai) => {
      const here = cell(li, at);
      const total = here.reduce((sum, st, i) => sum + across(st.node) + (i ? STACK_GAP : 0), 0);
      let c = (thick - total) / 2;
      for (const st of here) {
        const n = st.node;
        const a = start[ai] + (slot[ai] - along(n)) / 2;
        if (vertical) Object.assign(n, { x: lx + c, y: ly + stripW + a, w: n.nw, h: n.nh });
        else Object.assign(n, { x: lx + stripW + a, y: ly + c, w: n.nw, h: n.nh });
        c += across(n) + STACK_GAP;
      }
    });
    off += thick;
  });
  const w = vertical ? off : stripW + flowLen;
  const h = vertical ? stripW + flowLen : off;
  return { x: left, y: top, w, h, vertical, stripW, lanes };
}

export const swimlaneText = { size: LABEL_SIZE, color: '#3E3E3C', line: '#B0ADAB', strip: '#F3F3F5' } as const;
