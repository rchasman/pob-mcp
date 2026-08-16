# Smoke test fixtures

## occ-vortex.xml

A level 99 Occultist with a full set of gear and an allocated tree. The smoke
tests need a geared build: `example-build.xml` in the repo root has no items, so
it cannot exercise `find_best_anointment` or the weighted trade query, both of
which read amulet mods.

Copied verbatim from [Path of Building
Community](https://github.com/PathOfBuildingCommunity/PathOfBuilding)
(`spec/TestBuilds/3.13/OccVortex.xml`, MIT licensed). It lives here so the smoke
tests run against an installed PoB, which ships no `spec/` directory.

Keep it byte-identical to upstream. Do not add an XML comment for attribution:
that is what this file is for.
