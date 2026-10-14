import type { DiagramInput, NodeInput } from './schema.js';
import type { Box, LNode } from './layout.js';
import { measure } from './text.js';

// Roadmaps: periods (months, quarters…) across the top, lanes (teams, clouds…) down the
// side, and cards spanning the periods they run through. Cards in a lane that would
// overlap are stacked onto extra sub-rows, as in the reference roadmaps.

export type TimelineInput = NonNullable<DiagramInput['timeline']>;

export interface TimelineLayout extends Box {
  periods: { label: string; x: number; w: number }[];
  lanes: { label: string; y: number; h: number }[];
  headerH: number;
  labelW: number;
  grid: 'solid' | 'dashed';
  shade: 'columns' | 'lanes' | 'none';
}

const LANE_SIZE = 15;
const PERIOD_SIZE = 12;
const PAD = 14; // inside a lane, around its cards
const ROW_GAP = 16; // between stacked sub-rows
const INSET = 10; // card edge to period boundary

/** Position along the period axis: names snap to period edges, numbers are 0-based positions. */
function position(periods: string[], v: string | number, end: boolean): number {
  if (typeof v === 'number') return v;
  const i = periods.findIndex((p) => p.toLowerCase() === v.toLowerCase());
  if (i < 0) throw new Error(`unknown period "${v}" (periods: ${periods.join(', ')})`);
  return end ? i + 1 : i;
}

export interface TimelineItem extends NodeInput {
  from: string | number;
  to?: string | number;
}

/**
 * Size and place timeline cards. `items` are the already-built card nodes, in lane order;
 * `measureCard` lays out a card for a given width and returns its natural height.
 */
export function layoutTimeline(
  t: TimelineInput,
  items: { lane: number; node: LNode; item: TimelineItem }[],
  measureCard: (n: LNode, width: number) => number,
  left: number,
  top: number,
  minWidth: number,
): TimelineLayout {
  const periods = t.periods;
  const labelW = Math.max(120, ...t.lanes.map((l) => measure(l.title, LANE_SIZE, 700) + 36));
  const periodW = t.periodWidth ?? Math.max(150, Math.floor((minWidth - labelW) / periods.length));
  const headerH = 58;
  const gridX = left + labelW;

  const lanes: TimelineLayout['lanes'] = [];
  let y = top + headerH;
  t.lanes.forEach((_, li) => {
    const mine = items.filter((it) => it.lane === li);
    // each card spans its periods; overlapping cards go to the next free sub-row
    const spans = mine.map((it) => {
      const x0 = gridX + position(periods, it.item.from, false) * periodW + INSET;
      const x1 = gridX + position(periods, it.item.to ?? it.item.from, true) * periodW - INSET;
      return { it, x0, x1: Math.max(x1, x0 + 60) };
    });
    const rows: { end: number; items: typeof spans }[] = [];
    for (const s of spans) {
      const row = rows.find((r) => r.end + ROW_GAP <= s.x0) ?? rows[rows.push({ end: -Infinity, items: [] }) - 1];
      row.items.push(s);
      row.end = s.x1;
    }
    let cy = y + PAD;
    for (const r of rows) {
      const h = Math.max(...r.items.map((s) => measureCard(s.it.node, s.x1 - s.x0)));
      for (const s of r.items) {
        Object.assign(s.it.node, { x: s.x0, y: cy, w: s.x1 - s.x0, h });
      }
      cy += h + ROW_GAP;
    }
    const laneH = Math.max(90, cy - ROW_GAP + PAD - y);
    lanes.push({ label: t.lanes[li].title, y, h: laneH });
    y += laneH;
  });

  return {
    x: left,
    y: top,
    w: labelW + periods.length * periodW,
    h: y - top,
    periods: periods.map((label, i) => ({ label, x: gridX + i * periodW, w: periodW })),
    lanes,
    headerH,
    labelW,
    grid: t.grid ?? 'solid',
    shade: t.shade ?? 'columns',
  };
}

export const timelineText = { lane: LANE_SIZE, period: PERIOD_SIZE, color: '#3E3E3C', line: '#B0ADAB', shade: '#F3F3F5' } as const;
