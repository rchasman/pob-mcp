import { describe, it, expect, jest, beforeEach, afterAll } from '@jest/globals';
import path from 'path';
import os from 'os';

// The resolver decides purely on which paths exist, so drive it with a fake fs
const present = new Set<string>();
jest.mock('fs', () => ({
  __esModule: true,
  default: {
    accessSync: (p: string) => {
      if (!present.has(p)) throw new Error(`ENOENT: ${p}`);
    },
  },
}));

import { resolvePoBLayout, defaultBuildsDirectory } from '../../src/utils/pobLayout.js';

const realPlatform = process.platform;
function setPlatform(value: string): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

beforeEach(() => {
  present.clear();
  setPlatform(realPlatform);
});

afterAll(() => {
  setPlatform(realPlatform);
});

const BUNDLE = '/Applications/Path of Building.app';
const BUNDLE_LUA = path.join(BUNDLE, 'Contents', 'Resources', 'lua');
const APP_SRC = path.join(os.homedir(), 'Library', 'Application Support', 'PathOfBuildingMac', 'src');

describe('resolvePoBLayout', () => {
  it('should treat an explicit src with a sibling runtime as a checkout', () => {
    present.add('/repo/runtime');

    const layout = resolvePoBLayout('/repo/src');

    expect(layout.kind).toBe('checkout');
    expect(layout.src).toBe('/repo/src');
    expect(layout.luaPath[0]).toBe(path.join('/repo', 'runtime', 'lua', '?.lua'));
  });

  it('should search the checkout runtime before luarocks', () => {
    present.add('/repo/runtime');

    const layout = resolvePoBLayout('/repo/src');

    expect(layout.luaCPath[0]).toContain(path.join('/repo', 'runtime'));
    expect(layout.luaCPath[1]).toContain('.luarocks');
  });

  it('should use an installed app when no path is configured', () => {
    setPlatform('darwin');
    present.add(BUNDLE_LUA);
    present.add(path.join(APP_SRC, 'HeadlessWrapper.lua'));

    const layout = resolvePoBLayout();

    expect(layout.kind).toBe('macos-app');
    expect(layout.src).toBe(APP_SRC);
    // the bundle ships .dylib, not .so
    expect(layout.luaCPath[0]).toBe(path.join(BUNDLE, 'Contents', 'MacOS', '?.dylib'));
    // sha1 ships as a directory module. Dropping this entry breaks build loading
    // *after* the bridge has already emitted its ready banner, so the failure
    // surfaces as "build not initialized" on the first real request.
    expect(layout.luaPath).toContain(path.join(BUNDLE_LUA, '?', 'init.lua'));
  });

  it('should fall back to the bundled src when the app has never been launched', () => {
    setPlatform('darwin');
    present.add(BUNDLE_LUA);
    present.add(path.join(BUNDLE, 'Contents', 'Resources', 'src', 'HeadlessWrapper.lua'));

    const layout = resolvePoBLayout();

    expect(layout.src).toBe(path.join(BUNDLE, 'Contents', 'Resources', 'src'));
  });

  it('should adopt an installed app for an explicit src that has no runtime beside it', () => {
    setPlatform('darwin');
    present.add(BUNDLE_LUA);

    const layout = resolvePoBLayout(APP_SRC);

    expect(layout.kind).toBe('macos-app');
    expect(layout.src).toBe(APP_SRC);
  });

  it('should stay a checkout when nothing is installed', () => {
    setPlatform('linux');

    const layout = resolvePoBLayout('/repo/src');

    expect(layout.kind).toBe('checkout');
  });
});

describe('defaultBuildsDirectory', () => {
  // Both exist on a machine that used the old Qt port and then the current one,
  // which is the only case where the preference is observable
  it('should prefer the current port when both locations exist', () => {
    setPlatform('darwin');
    const appSupport = path.join(os.homedir(), 'Library', 'Application Support', 'Path of Building', 'Builds');
    present.add(appSupport);
    present.add(path.join(os.homedir(), 'Path of Building', 'Builds'));

    expect(defaultBuildsDirectory()).toBe(appSupport);
  });

  it('should use the older port location when only that exists', () => {
    setPlatform('darwin');
    const legacy = path.join(os.homedir(), 'Path of Building', 'Builds');
    present.add(legacy);

    expect(defaultBuildsDirectory()).toBe(legacy);
  });
});
