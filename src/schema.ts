import { z } from 'zod';

const Id = z
  .string()
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'ids start with a letter and use only letters, digits, "_" or "-"')
  .describe('Unique id, referenced by connections.');

const Color = z
  .string()
  .regex(/^(#[0-9A-Fa-f]{6}|[a-z]+)$/, 'use a palette name (navy, teal, orange, …) or #RRGGBB')
  .describe('Palette name (navy, blue, cloud, teal, maroon, orange, green, purple, indigo, lavender, red, grey) or #RRGGBB.');

const Side = z.enum(['left', 'right', 'top', 'bottom']);

export interface NodeInput {
  id: string;
  title?: string;
  icon?: string;
  attributes?: string[];
  footer?: string;
  footerIcons?: string[];
  color?: string;
  fill?: string;
  frame?: 'card' | 'none';
  layout?: 'row' | 'column' | 'grid';
  columns?: number;
  gap?: number;
  justify?: 'stretch' | 'start' | 'center' | 'end' | 'space-between';
  align?: 'stretch' | 'start' | 'center' | 'end';
  grow?: number;
  attributesPosition?: 'left' | 'top';
  iconStyle?: 'circle' | 'plain';
  rule?: boolean;
  border?: 'solid' | 'dashed' | 'dashdot' | 'dotted' | 'none';
  reverse?: boolean;
  shape?: 'card' | 'decision' | 'pill' | 'note';
  class?: string;
  bullets?: boolean;
  badge?: string;
  width?: number;
  height?: number;
  alignWith?: string;
  children?: NodeInput[];
}

export const Node: z.ZodType<NodeInput> = z
  .object({
    id: Id,
    title: z.string().optional().describe('Card title. Required unless frame is "none".'),
    icon: z.string().optional().describe('Icon id from `sfdiag catalog`, shown in a circle left of the title.'),
    attributes: z.array(z.string()).optional().describe('Bullet-free list of details shown under the title.'),
    footer: z.string().optional().describe('Text in the grey footer band.'),
    footerIcons: z.array(z.string()).optional().describe('Small icons in the card footer (add them to the key).'),
    color: Color.optional().describe('Border colour, e.g. to distinguish vendors.'),
    fill: Color.optional().describe('Background colour (keep light; text stays black).'),
    frame: z.enum(['card', 'none']).optional().describe('"none" makes an invisible layout group.'),
    layout: z.enum(['row', 'column', 'grid']).optional().describe('How children are arranged. Default row.'),
    columns: z.number().int().min(1).max(12).optional().describe('Columns for grid layout.'),
    gap: z.number().min(0).max(400).optional().describe('Space between children in px.'),
    justify: z
      .enum(['stretch', 'start', 'center', 'end', 'space-between'])
      .optional()
      .describe('Spare room along the layout axis: stretch grows children, the others position them.'),
    grow: z.number().min(0.1).max(20).optional().describe('Width share within a row (like CSS flex-grow): e.g. 1 / 3 / 1 gives a wide middle card.'),
    attributesPosition: z
      .enum(['left', 'top'])
      .optional()
      .describe('Container attributes: left column beside the children, or top (under the title). Default: top for column layouts, left otherwise.'),
    iconStyle: z.enum(['circle', 'plain']).optional().describe('circle (white glyph on a coloured disc) or plain (coloured glyph, no disc).'),
    border: z.enum(['solid', 'dashed', 'dashdot', 'dotted', 'none']).optional().describe('Card border style.'),
    rule: z.boolean().optional().describe('false hides the grey line under the title.'),
    align: z.enum(['stretch', 'start', 'center', 'end']).optional().describe('Cross-axis alignment of children. Default stretch; use center for flowcharts.'),
    reverse: z.boolean().optional().describe('Row runs right-to-left (snake layouts): list children in flow order.'),
    shape: z
      .enum(['card', 'decision', 'pill', 'note'])
      .optional()
      .describe('card (default) | decision (diamond with a question) | pill (START/END terminal) | note (free italic text).'),
    class: z.string().optional().describe('Name from the top-level `classes` map: colours the node and adds a key chip.'),
    bullets: z.boolean().optional().describe('Show attributes as an italic bulleted list (long items wrap).'),
    badge: z.string().optional().describe('Small icon in the bottom-right corner (explain it in the key).'),
    width: z.number().min(40).max(4000).optional().describe('Minimum width in px.'),
    height: z.number().min(30).max(4000).optional().describe('Minimum height in px.'),
    alignWith: Id.optional().describe('Line this node up with another node (same centre across the parent row/column), e.g. a decision level with the card its branch runs into.'),
    get children() {
      return z.array(Node).optional().describe('Nested cards. A node with children is a container.');
    },
  })
  .strict();

export const Connection = z
  .object({
    from: Id,
    to: Id,
    label: z.string().optional().describe('Text shown in a pill on the line.'),
    style: z.enum(['solid', 'dashed', 'dotted']).optional().describe('Line style; explain non-solid styles via the key.'),
    arrow: z.enum(['end', 'start', 'both', 'none']).optional().describe('Arrowheads. Default end.'),
    step: z.number().int().min(1).max(99).optional().describe('Sequence number badge for process flows.'),
    color: Color.optional(),
    fromSide: Side.optional(),
    toSide: Side.optional(),
    bundle: z
      .boolean()
      .optional()
      .describe('Unlabelled fan-outs/fan-ins from one node share a trunk (tree style) by default; false opts out.'),
  })
  .strict();

export const KeyItem = z
  .object({
    label: z.string(),
    icon: z.string().optional(),
    line: z.enum(['solid', 'dashed', 'dotted', 'dashdot']).optional(),
    color: Color.optional(),
    arrow: z.enum(['end', 'start', 'both', 'none']).optional().describe('Arrowheads on a line sample.'),
    pill: z.boolean().optional().describe('Draw the label in a pill on a long line sample.'),
    chip: z
      .object({ fill: Color.optional(), color: Color.optional(), text: Color.optional() })
      .strict()
      .optional()
      .describe('Draw the entry as a coloured chip (fill, border colour, text colour).'),
  })
  .strict();

const Period = z.union([z.string(), z.number()]);

export const TimelineItem = z
  .object({
    id: Id,
    title: z.string(),
    from: Period.describe('First period (name), or a 0-based position such as 1.5 for mid-February.'),
    to: Period.optional().describe('Last period (inclusive name) or end position. Defaults to `from`.'),
    icon: z.string().optional(),
    attributes: z.array(z.string()).optional(),
    footer: z.string().optional(),
    footerIcons: z.array(z.string()).optional(),
    color: Color.optional(),
    fill: Color.optional(),
    class: z.string().optional(),
    bullets: z.boolean().optional(),
    badge: z.string().optional(),
    iconStyle: z.enum(['circle', 'plain']).optional(),
    border: z.enum(['solid', 'dashed', 'dashdot', 'dotted', 'none']).optional(),
    rule: z.boolean().optional(),
    height: z.number().min(30).max(2000).optional().describe('Minimum card height.'),
  })
  .strict();

export const Timeline = z
  .object({
    periods: z.array(z.string()).min(1).describe('Column headings, e.g. months or quarters.'),
    periodWidth: z.number().min(60).max(800).optional(),
    periodWidths: z.array(z.number().min(40).max(1200)).optional().describe('Individual period widths (px), in order.'),
    grid: z.enum(['solid', 'dashed']).optional().describe('Period divider style.'),
    shade: z.enum(['columns', 'lanes', 'none']).optional().describe('Alternate shading of periods or lanes.'),
    lanes: z
      .array(z.object({ title: z.string(), items: z.array(TimelineItem) }).strict())
      .min(1)
      .describe('Rows (teams, clouds…) each holding cards that span periods.'),
  })
  .strict();

export const NodeClass = z
  .object({
    label: z.string().optional().describe('Key label; defaults to the class name.'),
    fill: Color.optional(),
    color: Color.optional().describe('Border colour.'),
    text: Color.optional().describe('Title colour.'),
  })
  .strict();

export const Diagram = z
  .object({
    title: z.string().describe('Diagram title shown in the header.'),
    description: z.string().optional().describe('One to three sentences: purpose, scope, message.'),
    logo: z.string().optional().describe('Icon id shown above the title (e.g. salesforce).'),
    key: z
      .union([z.enum(['auto', 'none']), z.array(KeyItem)])
      .optional()
      .describe('"auto" (default) builds the key from icons and line styles used.'),
    keyLabels: z
      .record(z.string(), z.string())
      .optional()
      .describe('Override key labels per icon id or line style, e.g. {dashed: "Batch"}.'),
    layout: z.enum(['row', 'column', 'grid']).optional().describe('Top-level arrangement. Default column.'),
    columns: z.number().int().min(1).max(12).optional(),
    gap: z.number().min(0).max(400).optional(),
    width: z.number().min(400).max(8000).optional().describe('Minimum canvas width.'),
    classes: z.record(z.string(), NodeClass).optional().describe('Named node categories (e.g. execute, validate), shown as chips in the key.'),
    header: z
      .object({
        band: Color.optional().describe('Header band colour (default light grey).'),
        color: Color.optional().describe('Title and description colour.'),
        eyebrow: z.string().optional().describe('Small uppercase line above the title.'),
        bold: z.boolean().optional().describe('Bold title (developer-docs style) instead of the light Architects style.'),
        logoPosition: z.enum(['above', 'side']).optional().describe('Logo above the title (default) or large, beside the title block (developer-docs style).'),
        titleSize: z.number().min(14).max(48).optional().describe('Title font size in px (default 22).'),
        italicDescription: z.boolean().optional().describe('Italic description text.'),
      })
      .strict()
      .optional(),
    lineColor: Color.optional().describe('Default connector colour.'),
    keyRows: z.number().int().min(1).max(12).optional().describe('Force the number of key rows.'),
    keyColumns: z.number().int().min(1).max(12).optional().describe('Force the number of key columns.'),
    keyTitle: z.string().optional().describe('Heading at the top-left of the key panel, e.g. "LEGEND:".'),
    keyOrder: z.enum(['chips-first', 'icons-first']).optional().describe('Key column order: category chips first (default) or icons first.'),
    keyFlow: z.enum(['columns', 'rows']).optional().describe('Fill the key column by column (default) or row by row.'),
    iconStyle: z.enum(['circle', 'plain']).optional().describe('Default icon style for every node and the key.'),
    cardWidth: z.number().min(80).max(800).optional().describe('Default width of leaf cards; titles and attributes wrap to fit.'),
    background: z.union([Color, z.literal('none')]).optional().describe('Canvas colour, or none for transparent.'),
    road: Color.optional().describe('Draws a winding road behind top-level rows (snake flowcharts), e.g. "#FBF9C9".'),
    nodes: z.array(Node).optional().describe('The diagram content. Required unless `timeline` is given.'),
    timeline: Timeline.optional().describe('Roadmap layout: periods across, lanes down, cards spanning periods.'),
    connections: z.array(Connection).optional(),
  })
  .strict()
  .refine((d) => (d.nodes?.length ?? 0) > 0 || !!d.timeline, { message: 'add `nodes` (or a `timeline` for roadmaps)', path: ['nodes'] });

export type DiagramInput = z.infer<typeof Diagram>;
export type ConnectionInput = z.infer<typeof Connection>;
export type KeyItemInput = z.infer<typeof KeyItem>;

export function jsonSchema(): unknown {
  return z.toJSONSchema(Diagram, { target: 'draft-2020-12' });
}
