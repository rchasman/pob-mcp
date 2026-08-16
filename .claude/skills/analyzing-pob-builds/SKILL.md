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

**First ask whether you need one.** To find out what a change is worth, use `lua_simulate`: it swaps an item, flips a flask or allocates nodes for a single calculation and returns before, after and delta without touching the loaded build. Mutate only when the player wants the change kept. Everything below is the cost of mutating, and simulation avoids all of it.

```
before = lua_get_build_snapshot()
<mutate>
after  = lua_get_build_snapshot()
assert after != before          # or: assert the specific field moved
```

If the field did not move, the mutation failed regardless of what the tool said. Common causes: wrong parameter name, a value the engine rejected, or an operation PoB itself refuses.

**Parameter names are not guessable.** `add_item` takes `slot_name` (not `slot`); `set_gem_level` takes `group_index`/`gem_index`; `set_config` takes `config_name`. Grep `src/server/toolSchemas.ts` when unsure, a wrong name can produce a cheerful success message and no effect.

### Three mutations that lie in ways the snapshot will not catch

**`customMods` cannot be read or written through the config API.** It is a multi-line
`<Input string="...">` and both `get_config` and `set_config` drop it silently: every
value you write produces the identical DPS, and the getter returns nothing. Read the
true value straight out of the XML:

```
XML.match(/<Input string="([^"]*)"\s+name="customMods"\s*\/>/)
```

Apply payload modifiers through a **carrier item** instead: append the lines to an
equipped item's raw text and re-add it. Always measure the *unmodified* carrier first
and assert it reproduces the baseline exactly, or you are measuring the carrier.

**`remove_gem` renumbers everything after it.** A `remove(3)` then `remove(6)` pair
removes the wrong second gem, and the DPS still moves, so the result looks plausible.
Look gems up by name each time and read the socket group back afterwards:

```
idx = gems.findIndex(g => g.name === "Innervate") + 1
...mutate...
assert readback contains the gem you expected and not the one you did not
```

Order matters too: level-and-quality passes that address gems by index must run
*before* any swap, or they will level the gem you just inserted. A level 20 Empower
is the tell.

**Animate Guardian gear lives in a second `ItemSet` that is never applied.** PoB
stores it as `<ItemSet id="2" title="Animated Guardian">` while `<Items activeItemSet="1">`.
Nothing from it reaches any figure, on your build or on an imported one. Anyone
comparing DPS against a top build is comparing two numbers that both exclude it.

## Item Analysis Recipe

Do these in order. Skipping a step produces advice the user cannot act on.

**1 and 2. Classify every mod, hybrids included.** Never read the Lua data files by hand.

```
classify_item_affixes(mod_lines: [...])  -> prefix/suffix counts, open slots, tiers
```

One affix can print several lines, and the tool reports the affix rather than the lines.

```
LocalIncreasedEnergyShieldPercentAndStunRecovery  Prefix "Pixie's"
  -> (6-13)% increased Energy Shield
  -> (6-7)% increased Stun and Block Recovery
```

Counting that stun line as a suffix turns "one open suffix" into "full, nothing possible", the exact inversion of the right answer. Two things in the output still need you: lines listed as **unmatched** are implicits, unique mods, corruptions, enchants or Eldritch mods and occupy no slot, and an affix flagged **ambiguous** has two readings the data cannot separate, so say so instead of picking one.

**3. Match slot types.** A craft can only occupy a slot of its own type.

| Prefix | Suffix |
|---|---|
| flat life / mana / energy shield | **all resistances** |
| % increased ES / spell damage | attributes (Str/Dex/Int) |
| adds X to Y damage | attack/cast speed, crit chance, crit multi |
| | life/mana regen, suppression |

You cannot recraft a prefix into a resistance. Check the slot type of the mod being *replaced*, not just the one being added.

**4. Gate by item level.** Read `Item Level` off the item and ask for what the bench can
actually apply to it.

```
list_craftable_mods(item_class: "Body Armour", item_level: 45, affix_type: "Suffix")
```

An ilvl 45 body armour cannot take the ilvl 50 resistance tier; an ilvl 23 ring is stuck
two tiers down. The tool lists what the item level locks out separately, which is the
number that tells the player whether a better base is worth buying.

**5. Check attribute requirements** after any swap: `Str`/`Dex`/`Int` against `ReqStr`/`ReqDex`/`ReqInt`. PoB reports full stats for a character whose gear would be disabled in game.

**6. Price the affix before you price the item.**

```
find_affix_tiers(search: "Chaos Resistance", affix_type: "Suffix", slot_tags: ["ring"])
```

Read the tier, `type`, `level` and the base tags it rolls on. Those tags are PoB's own
vocabulary, not slot names: body armour bases carry `str_armour` / `dex_armour` /
`int_armour` and their hybrids, and influenced variants add a suffix like `_elder`, so
pass several tags rather than guessing one. One T1 suffix routinely matches a
several-hundred-chaos unique built around the same stat:
`of Bameth` is +(31&ndash;35)% chaos resistance at ilvl 81 on rings, amulets, belts and
armour. A recommendation that only ranks uniques has skipped the cheapest answer,
and rares are the only items whose affixes the player chooses.

Two corollaries worth stating in any write-up:

- **A resistance stops paying the moment it is no longer the lowest number.** Sweep it
  in steps and find where the binding constraint changes hands, then recommend
  stopping there. Buying past that point reads as progress and measures as nothing.
- **A one-hander swap is not a dual-wield swap.** Replacing the main hand keeps the
  off-hand's resistances and gem levels; dropping the shield for a second weapon can
  invert the sign. Measure them as separate options, because players conflate them.

## Ranking Defensive Options

**`TotalEHP` is the wrong metric for resistance decisions.** It averages across damage types, so patching your strongest element scores about the same as patching your weakest.

`analyze_defenses` now ranks by binding constraint and prints the per-type max hits, so read that rather than deriving it. Measured on a level 99 Occultist, two options `TotalEHP` cannot tell apart:

| option | TotalEHP | resisted floor |
|---|---|---|
| +20% Fire | 44504.051025416 | 30,236 → **31,297** |
| +20% Lightning | 44504.051025416 | 30,236 → **30,236** |

Identical to nine decimals; only fire moves what actually kills the character.

**Read the binding type before recommending any resistance.** If Physical binds, no resistance purchase changes the floor. On that same fixture Physical binds at 18,642 against 63,711 for the elements, so every resistance recommendation there is noise.

**Capped types tie.** Max hit uses capped resistance, so three elements at 75% report the same number whatever their overcap. That is not a fetch bug, and overcap buys nothing against a hit.

**`analyze_defenses(sweep_resistances: true)` finds where a resistance stops paying**, one real calculation per step. PoB's max hit is not a clean `1/(1-res)` curve, and a fitted model puts the crossover several resistance points off. On that fixture chaos 68→75 gains 11,083 and then flatlines at the cap.

**Test combinations, not single changes.** Two individually-positive crafts can be jointly negative by creating a new floor. Use `lua_simulate` to measure the combination rather than adding the two numbers together.

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

### The value is a fixed point, and it moves with the gear

That exponent makes the magnitude self-reinforcing: raising the hit raises the
ailment, which raises the hit. Solve it rather than reading it once.

```
effect = 23
loop:  set conditionShockEffect(effect)
       hit = LightningHitAverage
       next = round(50 * (hit/threshold)^0.4 * ShockEffectMod)
       stop when next == effect
```

Two consequences for any roadmap you write. **Every damage upgrade raises the
correct value**, so a figure typed in before the shopping list is stale by the end
of it. And **any swap that drops ailment-effect gear lowers it**: trading boots
carrying "increased Effect of Lightning Ailments" moved `ShockEffectMod` 2.97 to
2.50 and the honest field 32 to 28, a 3% damage cut that is invisible because the
field is hand-typed and does not follow the gear. Re-solve after each step, and
say so in the deliverable.

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
| Writing `customMods` through `set_config` | Silently ignored, every value reads the same | Read it from the XML, apply via a carrier item |
| Chained `remove_gem` calls by index | Removes the wrong gem, plausibly | Look up by name, read the group back |
| Comparing your DPS to an imported build's | Both exclude any second `ItemSet` | Say so, or model the guardian on both sides |
| Ranking only uniques | Misses a T1 suffix that costs a fraction | Search `ModExplicit.lua` for the stat first |
| Typing an ailment magnitude once | Stale after every upgrade | Solve the fixed point, re-solve per step |

## Red Flags, Stop And Verify

- A tool returned success but no stat moved
- Two reads identical to many decimal places after a change
- Prefix or suffix count above 3
- Recommending a craft without having read the item's `Item Level`
- Ranking defences on `TotalEHP`
- Recommending a node without having found a path to it
- Saying "you have no room" without having reconciled hybrids
- A build invests in shock or chill and the ailment moves DPS by nothing when toggled
- The same script, run twice, returns a different baseline
- A recommendation list contains no rare and no affix
- A gem swap measured a gain you cannot explain from the gem alone

**All of these mean: go back and check the underlying data before answering.**

## Working Safely

Measure a candidate with `lua_simulate` before mutating anything. It runs one
hypothetical (item swap, flask toggle, passives, masteries) through the calculator
and reports the delta without touching the build, so there is nothing to undo and
no scratch file to clean up. It also names an attribute requirement the swap would
leave unmet, which every other read path will quote full DPS for regardless.

Reach for a mutation only when the change is not one `lua_simulate` can express,
and then it goes on a scratch build, never the user's file:

```
lua_save_build("scratch") -> lua_load_build("scratch.xml") -> mutate -> measure
```

Then delete the scratch and reload the user's build. Verify their file is untouched: node count, level, and absence of any test item names.

For multi-variant sweeps, drive `build/pobLuaBridge.js` directly from a Node script rather than one MCP call per variant: one run, one table, and the user's session state is never involved.
