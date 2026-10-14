# sfdiag — Salesforce Well-Architected diagrams as code

## Goal

Write Salesforce architecture diagrams as text (YAML) and render them so they are
visually indistinguishable from the official Salesforce Architects reference
diagrams (architect.salesforce.com/diagrams), which are hand-built in Lucidchart.

Success: a rendered diagram placed beside an official gallery diagram cannot be
reliably told apart by someone familiar with the style.

## Decisions (from brainstorming)

- Source of truth is code (YAML in git). Primary output SVG (+ PNG); optional export
  to Lucid Standard Import (`.lucid`) for people who want to keep editing in Lucid.
- Authors are mostly LLMs (Claude) driven by a human description, so the format
  must be easy to generate and strictly validated with machine-readable errors.
- v1 diagram types: **System Landscape** and **Solution Architecture** (they share
  one visual vocabulary: header, cards, containers, connectors, pills, icons).

## Visual language (measured from official assets)

| Token | Value |
|---|---|
| Header band / title rule / footer band | `#E5E5E5` |
| Header title & description text | `#032D60` (navy) |
| Card border | `#747474`, ~1.5px, radius ~10px, soft shadow `#D3D3D3` below |
| Card title | bold, `#000`; grey rule under title runs to the card's right edge |
| Connector line & pill border | `#3A414A`, elbow routed, filled arrowheads |
| Pill | white, fully rounded, bold label |
| Icons | white SLDS glyph on a filled circle; product colours e.g. Sales `#18827C`, Service `#89093F`, Marketing `#DD7A01`, Commerce `#3B6548`, Tableau/MuleSoft/Slack `#032D60`, Data Cloud `#200E37`, platform `#321D71`, generic purple `#5A25A6` |
| Font | Salesforce Sans is not redistributable → bundled **Nunito Sans** (OFL), overridable with local font files |

Header: full width, grey band, white disc-shaped area on the left holding title +
description, white rounded "Key" panel on the right. Key auto-generated from icons
and connector styles used.

## Architecture

TypeScript, Node ≥ 20, CLI `sfdiag`.

```
YAML ─► parse+validate (zod schema, JSON Schema export) ─► normalise model
     ─► measure text (opentype.js on the actual font files)
     ─► layout (deterministic nested row/column/grid boxes, bottom-up sizing)
     ─► route connectors (own orthogonal router: visibility graph + A*, bend
        penalty, obstacle avoidance, parallel-segment nudging)
     ─► render SVG (theme tokens) ─► PNG via resvg-js (same fonts)
     └► export .lucid (same geometry)
```

Units:
- `src/schema.ts` — zod schema; `sfdiag schema` emits JSON Schema.
- `src/validate.ts` — semantic checks (unique ids, dangling refs, unknown icons with
  "did you mean" suggestions); errors as `{path, message, hint}` JSON.
- `src/catalog.ts` — closed icon catalog: id → {glyph (SLDS utility svg), colour,
  label}. Local overrides: `icons/<id>.svg` in the diagram's directory.
- `src/text.ts` — font loading, text measurement, wrapping.
- `src/layout.ts` — sizes and positions cards/containers.
- `src/route.ts` — orthogonal connector routing and label (pill) placement.
- `src/render.ts` — SVG generation.
- `src/lucid.ts` — Lucid Standard Import exporter.
- `src/cli.ts` — `validate | render | export-lucid | catalog | schema`.

## Format (summary)

```yaml
title: External Integrations via HTTP
description: …
layout: row            # row | column | grid (top level)
nodes:
  - id: crm
    title: CRM Apps
    icon: crm-apps
    layout: column
    children:
      - id: flow
        title: Flow
        icon: flow
        attributes: [HTTP Callout]
        footerIcons: [form]
  - id: ext
    title: External Data Source
    icon: building
    children: [{ id: api, title: API }]
connections:
  - { from: flow, to: api, label: Request }
  - { from: api, to: flow, label: Response }
```

Ids are globally unique. Nodes without `children` are cards; with children they are
containers (cards that hold cards). `frame: none` gives an invisible layout group.
Connections support `label`, `style: solid|dashed`, `arrow: end|start|both|none`,
`step` (numbered badge), `color`, and port hints `fromSide/toSide`.

## Testing

- vitest unit tests: schema/validation errors, text measurement, layout invariants
  (no overlaps, children inside parents), router invariants (orthogonal, no
  obstacle crossings), Lucid export structure.
- Fidelity: recreate official gallery diagrams in `examples/` and compare PNGs
  side by side with the originals.

## Out of scope (v1)

Capability maps, roadmaps, sequence/swimlane flows, data models, interactive editor.

## Addendum (2026-10-14): built since this spec

- **Flowcharts:** decision, pill and note shapes; categories (`classes`) with key chips;
  `reverse` rows and the winding `road` for snake layouts; badges; decisions branch to
  side cards from their left/right points.
- **Alignment:** `alignWith` levels a node (or the column holding it) with another node;
  a second layout pass grows rows that need room for the move.
- **Roadmaps:** `timeline:` with periods, lanes and spanning, auto-stacked cards.
- **Swimlanes:** `swimlanes:` with lanes per actor, steps at sequence positions that line
  up across lanes, horizontal or vertical orientation.
- **Layout controls:** `grow`, `cardWidth`, `justify`, `attributesPosition`, indented
  attributes; explicit row gaps are honoured down to line clearance.
- **Routing:** org-chart bundles (`bundle: true`), perpendicular entries leave from beyond
  the target's edge for a clean L, connections never cross their own end cards.
- **Header and key:** eyebrow, bold and large titles, side logo, italic description, key
  title and order, key packing options (`keyRows`, `keyColumns`, `keyFlow`).
- **Examples:** 20 Architects-gallery recreations in `examples/gallery/`, plus the order
  of execution and approval workflow flowcharts.
