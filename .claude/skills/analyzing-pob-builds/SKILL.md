---
name: analyzing-pob-builds
description: Use when analyzing a Path of Exile build through the pob MCP server: evaluating gear, affixes, crafts, anointments, passive nodes, or comparing defensive options. Also use when a pob tool reports success but stats do not move, when recommending a bench craft, or when ranking upgrades by survivability.
allowed-tools: Read, Bash, Grep, Glob
---

# Analyzing PoB Builds

## Overview

The pob MCP server has **silent failure modes**: tools report success for operations that did nothing, and some read paths serve cached values that ignore your last mutation. Separately, Path of Exile's item rules gate which advice is even *possible* (affix slot types, item level, keystone lockouts). Advice that ignores either produces confident, wrong answers.

**Core principle: verify the effect, never the return value.** A tool saying "Item added" or "Added: 1 node(s)" is not evidence anything changed.

## The Read Path Is Not The Write Path

`get_build_stats` and `get_build_issues` read cached values from the build XML. They will happily return stats for a build you never loaded, or return byte-identical output after a mutation that did land.

| Need | Use | Never use |
|---|---|---|
| Stats after any mutation | `lua_get_build_snapshot` or `lua_get_stats` | `get_build_stats` |
| Confirm a build is loaded | `lua_load_build`, read the banner | assume |
| Max hits, attributes, req values | `get_build_stats` **after** `lua_save_build` | mid-session reads |

**Symptom you must not explain away:** two consecutive reads returning identical values to eight decimal places after you changed something. That is a cache, not a null result.

## Before Any Analysis

1. `lua_load_build`, confirm the banner shows the expected name, level and class. An unloaded engine silently serves a level 1 blank character.
2. `lua_reload_build` if the user has touched PoB since you last read. Check the file mtime if unsure.
3. Read the config. Defaults are not user choices, so check `ConfigOptions.lua` before inferring intent.
4. Note allocated **keystones**. A damage-type lockout invalidates entire categories of mod.

## Verifying A Mutation

```
before = lua_get_build_snapshot()
<mutate>
after  = lua_get_build_snapshot()
assert after != before          # or: assert the specific field moved
```

If the field did not move, the mutation failed regardless of what the tool said. Common causes: wrong parameter name, a value the engine rejected, or an operation PoB itself refuses.

**Parameter names are not guessable.** `add_item` takes `slot_name` (not `slot`); `set_gem_level` takes `group_index`/`gem_index`; `set_config` takes `config_name`. Grep `src/server/toolSchemas.ts` when unsure, a wrong name can produce a cheerful success message and no effect.

## Item Analysis Recipe

Do these in order. Skipping a step produces advice the user cannot act on.

**1. Classify every mod as prefix or suffix** against `Data/ModExplicit.lua` (`type = "Prefix"|"Suffix"`) and `Data/ModMaster.lua` for bench crafts.

**2. Reconcile hybrids.** One affix can print several lines. If your count exceeds 3 prefixes or 3 suffixes, you have split a hybrid, find it before continuing.

```
LocalIncreasedEnergyShieldPercentAndStunRecovery  Prefix "Pixie's"
  -> (6-13)% increased Energy Shield
  -> (6-7)% increased Stun and Block Recovery
```

Counting that stun line as a suffix turns "one open suffix" into "full, nothing possible", the exact inversion of the right answer.

**3. Match slot types.** A craft can only occupy a slot of its own type.

| Prefix | Suffix |
|---|---|
| flat life / mana / energy shield | **all resistances** |
| % increased ES / spell damage | attributes (Str/Dex/Int) |
| adds X to Y damage | attack/cast speed, crit chance, crit multi |
| | life/mana regen, suppression |

You cannot recraft a prefix into a resistance. Check the slot type of the mod being *replaced*, not just the one being added.

**4. Gate by item level.** Read `Item Level` off the item and filter `ModMaster.lua` to `level <= ilvl`. An ilvl 45 body armour cannot take the ilvl 50 resistance tier; an ilvl 23 ring is stuck two tiers down.

**5. Check attribute requirements** after any swap: `Str`/`Dex`/`Int` against `ReqStr`/`ReqDex`/`ReqInt`. PoB reports full stats for a character whose gear would be disabled in game.

## Ranking Defensive Options

**`TotalEHP` is the wrong metric for resistance decisions.** It averages across damage types, so patching your strongest element scores about the same as patching your weakest.

Rank by the **weakest elemental max hit** instead:

```
min(FireMaximumHitTaken, ColdMaximumHitTaken, LightningMaximumHitTaken)
```

Measured example: `+28% Lightning Res` beat `+28% Cold Res` on TotalEHP (+293 vs +288) while moving the weak link by **zero**. Cold raised the floor 27%. TotalEHP ranked them backwards.

**Test combinations, not single changes.** Two individually-positive crafts can be jointly negative by creating a new floor. Sweep the combinations and rank on the weakest link.

## Before Recommending A Passive Node

`calc_with` simulates a node **without requiring connectivity**, so a suggestion is not proof of reachability.

- `isBlighted == true` and zero connections → **anoint only**, no path exists at any point cost
- `ascendancyName` set and not the build's own → unreachable
- Otherwise BFS from the allocated set to get the real point cost

Treat upgrade-scan output as *value of the node*, never *value per point*.

Match masteries by **effect ID, not node ID**. The same effect is offered on several nodes, so checking one node ID reports a taken effect as missing.

## Ailments Are Credited At Zero Until You Configure Them

PoB applies a non-damaging ailment to the enemy only when the source is
**guaranteed** or when you have typed its magnitude into the matching
`Effect of X` config. A chance-to-shock skill satisfies neither, so the enemy
is flagged as shocked, every "against shocked enemies" modifier fires, and the
shock itself multiplies damage by **nothing**.

The gap is invisible from the outside. `output.CurrentShock` reads 0, raising
shock effect or the shock cap moves no number, and the DPS figure looks
settled.

```
lua_get_ailments   -> appliedEffect vs calculatedEffect
```

`appliedEffect` is what the calculation credits; `calculatedEffect` is what the
skill would inflict on the configured enemy. When they disagree, set
`conditionShockEffect` (or the chill/scorch/sap/brittle equivalent) before
ranking anything, because every downstream comparison is scaled by it.

Measured example: a shock build read 125,029 DPS with the effect unset. Its
real shock was **6% against the configured Pinnacle boss** (ailment threshold
6,349,995) and reached the 50% cap only at a threshold of **39,743 or below**.
Same build, same gear, an eightfold spread in what the shock is worth.

Ailment magnitude scales with `(damage / enemyThreshold) ^ 0.4`, so it collapses
against anything with real life. **One figure never covers both bosses and
trash.** Quote the value at the threshold you are actually ranking against, and
read the whole table before saying an ailment build "caps".

## Common Mistakes

| Mistake | Consequence | Fix |
|---|---|---|
| Reading `get_build_stats` after a mutation | Stale numbers, invisible | Use `lua_get_build_snapshot` |
| Trusting "Added: 1 node(s)" | Node silently dropped | Diff the node count |
| Counting hybrid lines as separate affixes | Inverts open/full | Reconcile against 3+3 |
| Recrafting a prefix into a resistance | Impossible advice | Match slot types |
| Ignoring item level | Craft tier unavailable | Filter ModMaster by ilvl |
| Ranking by TotalEHP | Patches the wrong element | Rank by weakest max hit |
| Recommending a Blight notable as a passive | No path exists | Check `isBlighted` |
| Ignoring keystone lockouts | Values dead mods | Read allocated keystones first |
| Treating a config default as a user choice | Wrong inference | Check `ConfigOptions.lua` |
| Reading tree data from a different PoB install | Silently wrong data | Resolve the runtime `src` path |
| Reading DPS on a shock or chill build | Ailment credited at 0, damage understated | `lua_get_ailments`, then set the effect config |
| Quoting one ailment magnitude for all content | Bosses and maps differ by an order of magnitude | Read the threshold table |

## Red Flags, Stop And Verify

- A tool returned success but no stat moved
- Two reads identical to many decimal places after a change
- Prefix or suffix count above 3
- Recommending a craft without having read the item's `Item Level`
- Ranking defences on `TotalEHP`
- Recommending a node without having found a path to it
- Saying "you have no room" without having reconciled hybrids
- A build invests in shock or chill and the ailment moves DPS by nothing when toggled

**All of these mean: go back and check the underlying data before answering.**

## Working Safely

Mutations for testing go on a scratch build, never the user's file:

```
lua_save_build("scratch") -> lua_load_build("scratch.xml") -> mutate -> measure
```

Then delete the scratch and reload the user's build. Verify their file is untouched: node count, level, and absence of any test item names.

For multi-variant sweeps, drive `build/pobLuaBridge.js` directly from a Node script rather than one MCP call per variant: one run, one table, and the user's session state is never involved.
