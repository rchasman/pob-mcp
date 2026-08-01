// Regression smoke test: the adapter must report PoB's real state, and must not
// die on a response it cannot serialise.
// Usage: POB_PATH=/path/to/PathOfBuilding/src node tests/smoke/state-truthfulness.mjs
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { PoBLuaApiClient } from '../../build/pobLuaBridge.js';

const cwd = process.env.POB_PATH || process.env.POB_FORK_PATH;
if (!cwd) throw new Error('POB_PATH must point to a stock PoB src directory.');

// A stock fork checkout ships runtime/ next to src/, and the bridge derives the
// Lua search paths from cwd on that assumption. An installed PoB app keeps them
// elsewhere, so allow both to be supplied explicitly.
const env = { POB_API_STDIO: '0' };
if (process.env.POB_LUA_PATH) env.LUA_PATH = process.env.POB_LUA_PATH;
if (process.env.POB_LUA_CPATH) env.LUA_CPATH = process.env.POB_LUA_CPATH;

const client = new PoBLuaApiClient({
  cwd,
  cmd: process.env.POB_CMD,
  args: [resolve('lua/vanilla_stdio_bridge.lua')],
  env,
  timeoutMs: 60_000,
});

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures.push(name);
};

try {
  await client.start();
  await client.loadBuildXml(await readFile(resolve('example-build.xml'), 'utf8'), 'truthfulness-smoke');

  // calc_with returns PoB's live object graph, which contains reference cycles.
  // Before the sanitiser this killed the process on the first call, taking the
  // caller's loaded build with it.
  const out = await client.calcWith({});
  check('calc_with returns a serialisable result', typeof out?.TotalDPS === 'number' || typeof out?.Life === 'number');
  check('bridge survives calc_with', client.isAlive());

  // set_config drives off PoB's own ConfigOptions rather than a hardcoded
  // allowlist, so options outside the old list must now apply...
  const applied = await client.setConfig({ enemyIsBoss: 'Pinnacle' });
  check('known config option applies', applied.applied.enemyIsBoss === 'Pinnacle', JSON.stringify(applied.applied));

  // ...and anything PoB does not recognise must be reported, not silently swallowed.
  const bogus = await client.setConfig({ definitelyNotAConfigOption: 1 });
  check('unknown config option is rejected', Boolean(bogus.rejected.definitelyNotAConfigOption));

  const badValue = await client.setConfig({ bandit: 'NotABandit' });
  check('invalid dropdown value is rejected', Boolean(badValue.rejected.bandit));

  // Dropdowns store a val that differs from the UI label; callers need the label.
  await client.setConfig({ bandit: 'None' });
  const labels = await client.getConfigLabels();
  check('dropdown label is exposed', labels.bandit === 'Kill all', `bandit=${labels.bandit}`);

  // PassiveSpec:ImportFromNodeList silently refuses a Mastery with no effect
  // chosen, so update_tree_delta must both report the drop and offer a way to
  // supply the effect.
  const tree = await client.getTree();
  const masteryId = await findAllocatableMastery(client, tree);
  if (masteryId == null) {
    console.log('skip  mastery checks (no adjacent mastery node in example build)');
  } else {
    const withoutEffect = await client.updateTreeDelta({ addNodes: [masteryId] });
    check('mastery without an effect is reported as dropped',
      (withoutEffect.droppedNodes ?? []).includes(masteryId),
      `dropped=${JSON.stringify(withoutEffect.droppedNodes)}`);
  }
  if (failures.length) throw new Error(`${failures.length} check(s) failed: ${failures.join(', ')}`);
  console.log('\nstate-truthfulness smoke passed');
} finally {
  await client.stop?.();
}

// The example build's tree differs from any given user's, so discover a mastery
// node adjacent to it rather than hardcoding an ID.
async function findAllocatableMastery(c, tree) {
  const allocated = new Set(tree.nodes);
  for (const keyword of ['mastery']) {
    try {
      const res = await c.searchNodes({ keyword, nodeType: 'mastery', maxResults: 30, includeAllocated: false });
      for (const node of res?.nodes ?? []) {
        if (!allocated.has(Number(node.id))) return Number(node.id);
      }
    } catch { /* search unavailable; skip the mastery checks */ }
  }
  return null;
}
