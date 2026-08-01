---
name: building-character-dossiers
description: Use when producing or refreshing a visual HTML build report for a Path of Exile character, when asked to visualise a passive tree, gear, gems or an anointment ladder, or when a dossier's numbers have gone stale after the player changed their build.
allowed-tools: Read, Write, Edit, Bash, Grep, Glob, WebFetch
---

# Building Character Dossiers

## Overview

A dossier is a single self-contained HTML file that shows a character's state and the decisions in front of them. Everything renders offline: the passive tree, gear and gem art all come from the local Path of Building install, not a CDN.

**Core principle: generate from the build file, never transcribe.** Anything typed by hand goes stale the moment the player saves, and stale numbers are worse than no numbers.

**REQUIRED BACKGROUND:** Use the `analyzing-pob-builds` skill for the analysis itself. This skill only covers turning findings into a document.

## Before Writing Anything

1. `lua_load_build`, then `lua_reload_build` if the player has touched PoB. Check the file mtime.
2. Pull authoritative stats. Max hits and attribute requirements need `get_build_stats` **after** a save; everything else comes from the live engine.
3. Re-derive every figure you are about to print. A dossier that disagrees with PoB is worthless.

## What Renders Offline

Path of Building ships the data. `TreeData/<version>/`:

| File | Gives you |
|---|---|
| `tree.lua` | node positions, connections, names, `isNotable` / `isKeystone` / `isBlighted` |
| `sprites.lua` | icon coordinates keyed by `node.icon` |
| `skills-3.jpg` | the passive icon sprite sheet |

Node position uses PoB's own formula (`Classes/PassiveTree.lua:843`):

```lua
node.angle = orbitAnglesByOrbit[node.o + 1][node.oidx + 1]
node.x = node.group.x + sin(node.angle) * orbitRadii[node.o + 1]
node.y = node.group.y - cos(node.angle) * orbitRadii[node.o + 1]
```

**Orbit angles are not evenly spaced.** 16-slot orbits step by 30 and 45 degrees, 40-slot orbits by 10 and 45 (`CalcOrbitAngles`). Using `360 * i / n` puts nodes in visibly wrong places. Copy the tables.

## Generators

`scripts/` holds working generators. Each takes the build's allocated node list or the build XML and emits a fragment to inline.

| Script | Emits |
|---|---|
| `gen_tree.lua` | passive tree SVG, `ICON:` placeholders for art |
| `icons.py` | crops sprite icons to base64 data URIs |
| `gen_asc.lua` | ascendancy inset, allocated vs planned route |
| `items.py` | PoE-style item tooltips from the build XML |
| `gems.py` | socket groups with levels and quality |

Crop the tree to the bounding box of allocated **non-ascendancy** nodes. Ascendancy nodes sit far off the main tree and will blow the viewBox out to nothing-but-whitespace.

## Sizing Icons For Display Width

Node art is sized in tree coordinates but read at page width. A viewBox around 9000 units wide displayed at 700 px is a **13:1** reduction, so a 60-unit icon renders at 4 px.

Work backwards from the rendered size you want, and **rasterise and look at it** before shipping:

```bash
rsvg-convert -w 1000 preview.svg -o preview.png   # then Read the png
```

rsvg does not resolve CSS custom properties, so substitute concrete colours into the preview copy only.

## Prices

poe.ninja gives live costs, which turns "that oil is expensive" into a decision.

```
GET https://poe.ninja/poe1/api/economy/leagues
    -> first entry is the current temp league

GET https://poe.ninja/poe1/api/economy/exchange/current/overview?league=<id>&type=Oil
    -> { lines: [{id, primaryValue}], items: [{id, name}] }
```

The older `/api/data/currencyoverview` paths are dead and return 404. The `stash/current/item/overview` path also 404s for oils; **`exchange/current/overview` is the one that works.**

Rank by **value per chaos**, not raw value. The best anointment in the game measured 43 DPS per chaos while the third-cheapest measured 1,041. Always stamp the league and fetch date next to any price.

## Page Contract

Build the page from these parts, in order:

1. **Masthead** with level, act, point count, and a stat strip
2. **Framing line** stating what the DPS number is measured against, since a pinnacle-boss figure is not a mapping figure
3. **Tree and gear**: tree SVG with legend, then item tooltips, then socket groups
4. **Findings**, each carrying its measurement
5. **Decisions**, each priced in points or currency
6. **Checklist**, cheapest-first, with a separate already-handled list

Label every claim with how it was obtained. A `Measured` badge on a simulated figure and a `Verdict` badge on a judgement call keeps the two from blurring.

## Updating An Existing Dossier

Edit surgically; do not regenerate prose that is still true.

1. Reload the build and diff against the numbers in the page.
2. Regenerate the fragments (tree, items, gems) wholesale. They are cheap and always drift.
3. Move completed items into an **already handled** list rather than deleting them. Showing a prediction that landed is the strongest evidence the analysis is sound.
4. Rewrite any section whose recommendation the player has acted on. A section still saying "take these two nodes" after they took them reads as broken.

## Common Mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Evenly spaced orbit angles | Nodes visibly misplaced | Copy `CalcOrbitAngles` tables |
| Ascendancy nodes in the tree bbox | Mostly empty canvas | Exclude them, draw an inset |
| Icons sized in tree units | 4 px unreadable blobs | Work back from display width |
| Shipping SVG unrendered | Silent layout breakage | `rsvg-convert`, then look |
| Hand-typed stats | Stale within one save | Generate from the build file |
| Ranking anoints by raw DPS | Recommends a 218c oil | Rank by value per chaos |
| Undated prices | Silently wrong later | Stamp league and date |
| `&mdash;` in markup | Renders an em dash | Check entities, not just literals |

## Verify Before Deploying

```bash
# structure, CSS balance, dead anchors, external refs
python3 - <<'EOF'
# parse with html.parser, treat SVG shapes as void
# assert: no unclosed tags, { == }, every href="#x" has id="x",
#         zero src|href="http (the page must be self-contained)
EOF
```

Then copy next to the build file so it lives with what it describes.
