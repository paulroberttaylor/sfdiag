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
  justify?: 'stretch' | 'start' | 'center' | 'space-between';
  width?: number;
  height?: number;
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
    justify: z.enum(['stretch', 'start', 'center', 'space-between']).optional(),
    width: z.number().min(40).max(4000).optional().describe('Minimum width in px.'),
    height: z.number().min(30).max(4000).optional().describe('Minimum height in px.'),
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
  })
  .strict();

export const KeyItem = z
  .object({
    label: z.string(),
    icon: z.string().optional(),
    line: z.enum(['solid', 'dashed', 'dotted']).optional(),
    color: Color.optional(),
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
    nodes: z.array(Node).min(1),
    connections: z.array(Connection).optional(),
  })
  .strict();

export type DiagramInput = z.infer<typeof Diagram>;
export type ConnectionInput = z.infer<typeof Connection>;
export type KeyItemInput = z.infer<typeof KeyItem>;

export function jsonSchema(): unknown {
  return z.toJSONSchema(Diagram, { target: 'draft-2020-12' });
}
