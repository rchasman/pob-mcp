# Vendored headless files

`HeadlessWrapper.lua` and `_SimpleGraphic.def.lua` are what let Path of Building run
under a plain LuaJIT instead of inside `SimpleGraphic.dll`. A git checkout has them in
`src/`, and the macOS port keeps them in its `src/` copy, but PoB's `manifest.xml`
lists neither, so an installed or portable Windows PoB ships without them.

`vanilla_stdio_bridge.lua` uses the engine directory's own copy of each file when it
has one and falls back to these otherwise. They are copied verbatim from
[Path of Building Community](https://github.com/PathOfBuildingCommunity/PathOfBuilding)
(`src/`, MIT licensed).

Keep them byte-identical to the revision they came from, so a drift from upstream is a
deliberate refresh and not an accident. `tests/unit/vendoredHeadless.test.ts` checks
these digests (taken over LF line endings, which is how the repository stores them):

- upstream commit `274d129cc1f9ebad68d319e2e3117c9e948f5e10` (2026-10-17, `dev`)
- `HeadlessWrapper.lua` last changed upstream in `bcbca9b60b04abc17935c84ff3589342193bd758`
  `sha256 a9baa73128e54a6781d795d50add3f17d956a011fc1daaf97134b071eef40238`
- `_SimpleGraphic.def.lua` last changed upstream in `81dbae8465d1c5a17e7494333c2e2da3052cbcf9`
  `sha256 2f6b31b71ee2e474daed9a5d70c156a480675eeea126ff3c19edf41583a73e67`

To refresh after a PoB release that changes either file:

```bash
node scripts/vendor-headless.mjs            # from the dev branch
node scripts/vendor-headless.mjs <git ref>  # from a tag or commit
```

The stub API only needs to cover what PoB calls while loading and calculating, so an
older copy keeps working until upstream starts calling a SimpleGraphic function the
stubs do not define; the symptom is `attempt to call global '<name>'` at startup.
