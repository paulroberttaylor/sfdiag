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

Other node options: `fill` (light background), `width`/`height` (minimum px),
`gap`, `justify: stretch|start|center|space-between`.
Colours: navy, blue, cloud, teal, maroon, orange, green, lightgreen, purple, indigo,
darkpurple, lavender, red, yellow, grey, black — or `#RRGGBB`.

Icons: run `npx sfdiag catalog` (or `--json`). Product ids include salesforce,
sales-cloud, service-cloud, marketing-cloud, commerce-cloud, experience-cloud,
data-cloud, agentforce, einstein, tableau, mulesoft, slack, omnistudio, heroku; capability
ids include flow, apex, database, events, api, integration, identity, security, batch;
external ids include building, cloud, server, storage, user, customer. Any SLDS utility
glyph works as `slds:<name>` or `slds:<name>/<colour>`. Drop official SVGs into an
`icons/` folder next to the YAML to override any id.

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
