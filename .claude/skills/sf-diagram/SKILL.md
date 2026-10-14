---
name: sf-diagram
description: Use when asked to draw, create, update or review a Salesforce architecture diagram (system landscape, solution architecture, integration diagram, org/cloud landscape) — writes sfdiag YAML and renders it in the Salesforce Well-Architected visual style, with optional Lucid export.
---

# Salesforce Well-Architected diagrams with sfdiag

You write a small YAML file; `sfdiag` lays it out and renders it so it matches the
official Salesforce Architects reference diagrams (header with key, cards, containers,
icon circles, pill-labelled elbow connectors). You never position anything by hand.

## Workflow

1. **Pin down the message.** One diagram = one message. Decide the type:
   - *System Landscape*: which products/systems exist and how they connect. Few labels.
   - *Solution Architecture*: how data/requests flow. Label every connector; add
     `step:` numbers when order matters.
   If the description mixes both, make two diagrams.
2. **Write `<name>.yaml`** (format below). Start from the closest file in `examples/`.
3. **Validate** and fix every error (the hints name the fix):
   `npx sfdiag validate <file> --json`
4. **Render** and **look at the PNG** (Read the image):
   `npx sfdiag render <file> --png` (writes `<file>.svg` and `<file>.png` next to the
   YAML; use `-o <path or dir>` to put them elsewhere)
5. **Critique the picture** against the checklist below, adjust the YAML, re-render.
   Typical fixes: reorder siblings so connected things are adjacent, switch a
   container's `layout`, group a column with `frame: none`, pin a connector side with
   `fromSide`/`toSide`.
6. Optional: `npx sfdiag export-lucid <file>` for an editable Lucidchart document.

Inside this repo use `npx tsx src/cli.ts …` instead of `npx sfdiag …`.

## Format

```yaml
title: Short Diagram Title                 # required
description: One to three sentences: purpose, scope and message.
logo: salesforce                           # optional icon above the title
layout: row                                # top level: column (default) | row | grid
gap: 40                                    # optional px between top-level items
keyLabels:                                 # optional: rename key entries
  dashed: Batch (hourly)                   #   line styles: solid | dashed | dotted
  batch: Scheduled job                     #   or icon ids (adds/renames key items)
nodes:
  - id: crm                                # unique across the whole file
    title: CRM Apps                        # required for cards
    icon: crm-apps                         # see `sfdiag catalog`
    attributes: [Lead management, Cases]   # short lines under the title
    footer: Platform Services              # grey band text
    footerIcons: [flow, apex]              # small icons, auto-added to the key
    color: orange                          # border colour (vendor/zone coding)
    layout: column                         # children: row (default) | column | grid
    columns: 3                             # for grid
    children:                              # a node with children is a container
      - { id: flow, title: Flow, icon: flow, attributes: [HTTP Callout] }
  - id: right-column
    frame: none                            # invisible layout group (no title)
    layout: column
    children: [ ... ]
connections:
  - from: flow
    to: api
    label: Request                         # pill on the line
    style: dashed                          # solid (default) | dashed | dotted
    arrow: end                             # end (default) | start | both | none
    step: 1                                # numbered badge
    color: orange                          # optional line colour
    fromSide: right                        # optional: left | right | top | bottom
    toSide: left
```

Other node options:
- `fill` (light background); `border: solid|dashed|dashdot|dotted|none`.
- `width` — exact width for a card (titles and attributes wrap to it); `height` — minimum.
- `grow: 1|2|3…` — width share within a row (e.g. 1 / 3 / 1 makes a wide middle card).
- `gap`; `justify: stretch|start|center|end|space-between` (main axis); `align: stretch|start|center|end` (cross axis).
  Columns keep natural heights unless `justify: stretch`.
- `attributesPosition: top|left` — a container's attributes go above its children
  (default for `layout: column`) or in a column to their left (default otherwise).
- Attributes starting with two spaces are indented one level: `["Leadership", "  Business outcomes"]`.
  Quote attributes that contain commas, or YAML splits them.
- `iconStyle: plain` draws the coloured glyph without its disc (also a top-level default);
  `icon: placeholder` is an empty grey disc.

Top-level options: `cardWidth` (default width for all leaf cards — use it to match a
reference's proportions), `keyRows` / `keyColumns`, `iconStyle`, `background: none`
(transparent), and `key:` as an explicit list whose entries may be `{label, icon}`,
`{label, line: dashed, arrow: both}`, `{label, line: dashed, pill: true}` (label in a pill on
a long line) or `{label, chip: {fill, color}}`. Write links in the description as
`[text](https://…)`.

Connectors: `label` may contain `\n` for multi-line pills (long labels wrap). Unlabelled
connectors fanning out of one node (or into one node) are drawn tree-style with a shared
trunk and bus; set `bundle: false` on a connector to opt out.
Colours: navy, blue, cloud, teal, maroon, orange, green, lightgreen, purple, indigo,
darkpurple, lavender, red, yellow, grey, black — or `#RRGGBB`.

Icons: run `npx sfdiag catalog` (or `--json`). Product ids include salesforce,
sales-cloud, service-cloud, marketing-cloud, commerce-cloud, experience-cloud,
data-cloud, agentforce, einstein, tableau, mulesoft, slack, omnistudio, heroku; capability
ids include flow, apex, database, events, api, integration, identity, security, batch;
external ids include building, cloud, server, storage, user, customer. Any SLDS utility
glyph works as `slds:<name>` or `slds:<name>/<colour>`. Drop official SVGs into an
`icons/` folder next to the YAML to override any id.

## Process flowcharts (interaction / order-of-execution style)

For step-by-step flows use symbols and categories (see `examples/order-of-execution.yaml`):

```yaml
classes:                                   # categories → coloured cards + key chips
  execute: { label: Execute, fill: "#E0F3E0", color: "#67B4A0" }
  validate: { label: Validate, fill: "#D1F6FF", color: "#6FC3D8" }
header:                                    # developer-docs style header
  band: "#413E73"
  color: "#2E2B55"
  eyebrow: Salesforce Platform             # grows with a large titleSize
  bold: true
  logoPosition: side                       # big logo beside the title (default: small, above)
  titleSize: 32                            # default 22
  italicDescription: true
keyTitle: "LEGEND:"                        # heading in the key panel
keyOrder: icons-first                      # default chips-first
lineColor: "#3E3A72"                       # default connector colour
road: "#FBF9C9"                            # winding band behind the rows
nodes:
  - id: row1
    frame: none
    align: center                          # centre cards/diamonds on the row axis
    children:
      - { id: start, shape: pill, title: START }
      - { id: s1, class: execute, title: 1. Loads the record, bullets: true, width: 160,
          attributes: [Long bullet text wraps inside the card] }
      - { id: d1, shape: decision, title: "Did it come from the UI?" }   # quote titles with commas
  - id: row2
    frame: none
    reverse: true                          # right-to-left row: list children in flow order
    children: [ ... ]
connections:
  - { from: d1, to: s2, label: "YES", color: "#2E8B57", fromSide: top }
  - { from: d1, to: s3, label: "NO", color: "#C23934" }
```

- `shape: decision | pill | note` — diamonds/terminals connect at their points. A
  decision branching down to cards on either side automatically leaves from its left
  and right points and turns down into each card; no `fromSide`/`toSide` needed.
- `alignWith: <id>` lines a node's vertical centre up with another node's, e.g. a decision
  level with the card its branch runs into, so the line between them is straight. A node
  inside a column moves its whole column; the row grows if it needs room.
- `badge: <icon>` puts a small icon in a card's corner; badges and `keyLabels`
  icon entries appear in the key.
- Put long-running rows in top-level `frame: none` rows; alternate `reverse: true` for a
  snake layout and add `road:` to draw the band.

## Roadmaps (timeline)

Use `timeline:` instead of `nodes:` — periods across the top, lanes down the side,
cards spanning periods (see `examples/gallery/roadmap-business-capability.yaml`):

```yaml
timeline:
  periods: [January, February, March, April]   # or "Q1: January 1 - March 30", …
  shade: columns          # columns | lanes | none (alternate shading)
  grid: solid             # solid | dashed period dividers
  periodWidth: 200        # optional, px per period
  lanes:
    - title: Sales
      items:
        - { id: cpq, title: CPQ, from: February, to: March, footerIcons: [slds:link/navy] }
        - { id: prm, title: PRM, from: 0.5, to: 2.2 }   # numbers = 0-based positions (0.5 = mid-January)
```

Names snap to period edges (`to` is inclusive); numbers place cards mid-period.
Overlapping cards in a lane stack onto extra rows automatically, in list order.
Items take card options (attributes, icon, footerIcons, class, color…); `connections`
can link items (dependencies). `keyFlow: rows` fills the key row by row.

## Layout model (how to get a good picture)

- Layout is nested boxes: each container arranges its children in a `row`, `column` or
  `grid`; the top level defaults to `column`. Order in the file = order on the page.
- Read left to right, top to bottom: sources on the left, Salesforce in the middle,
  consumers/targets on the right (top-level `layout: row` with three `frame: none`
  columns is the classic solution-architecture shape).
- Connectors are routed automatically with elbows around cards; gaps widen to fit
  pills. Put connected nodes next to each other; if a line detours, reorder siblings
  or move the node into the neighbouring column rather than adding hints.
- Cards in a row get equal widths and heights; columns stretch to equal widths.
- Keep the top level to 3–4 columns (or rows); more makes a very wide image. Put
  related systems in one column instead.
- Containment is nesting, not a connector: put Agentforce *inside* the Service Cloud
  container rather than drawing Service Cloud → Agentforce. A container's
  `attributes` appear as a text column to the left of its children.
- If two lines run on top of each other or a line takes a long detour, pin one end
  with `fromSide`/`toSide` (e.g. `top` to go over a row of cards).
- The key lists footer icons and non-solid line styles automatically; numbered steps
  explain themselves and are not added to the key.

## Style rules from the Salesforce diagram guidance

- Every diagram has a title and a description; the key appears automatically when
  footer icons or non-solid line styles are used — name those meanings with
  `keyLabels` (e.g. `dashed: Asynchronous`).
- Card titles are short nouns (≤ 4 words). Use attributes for detail, max ~6 per card.
- Every property is a card; group related cards in a container instead of drawing
  lines to each one.
- Label connectors in solution architecture diagrams with what moves or how
  (`REST`, `Platform Event`, `Nightly batch`). Keep labels ≤ 4 words.
- Use colour only to encode meaning (vendor, zone, ownership) and explain it in the
  key with an explicit `key:` list if it isn't obvious.

## Review checklist (look at the PNG)

- [ ] Title/description say what the diagram is for; key explains every symbol/style.
- [ ] No connector crosses a card; no pill sits on a corner or overlaps another pill.
- [ ] Flow reads left→right / top→bottom; steps numbered in reading order.
- [ ] Nothing unexplained: every icon is titled or in the key; every colour means something.
- [ ] One message. If you need "and" to describe it, split it.
