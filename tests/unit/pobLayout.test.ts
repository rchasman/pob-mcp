import { describe, it, expect, jest, beforeEach, afterEach, afterAll } from '@jest/globals';
import path from 'path';
import os from 'os';

// The resolver decides on which paths exist, so drive it with a fake fs
const present = new Set<string>();
const contents = new Map<string, string>();
jest.mock('fs', () => ({
  __esModule: true,
  default: {
    accessSync: (p: string) => {
      if (!present.has(p)) throw new Error(`ENOENT: ${p}`);
    },
    readFileSync: (p: string) => {
      const text = contents.get(p);
      if (text === undefined) throw new Error(`ENOENT: ${p}`);
      return text;
    },
  },
}));

// Windows answers two questions through PowerShell: where the installer put PoB, and
// where Documents is. Stand in for both, keyed on what the script asks.
let powershellAvailable = true;
let documents = 'C:\\Users\\me\\Documents';
let registryInstall: string | null = null;
const execFileSync = jest.fn<(cmd: string, args: string[]) => string>((_cmd, args) => {
  if (!powershellAvailable) throw new Error('powershell.exe: not found');
  const script = args[args.length - 1];
  if (script.includes('Uninstall')) return registryInstall === null ? '' : `"${registryInstall}"\r\n`;
  return `${documents}\r\n`;
});
jest.mock('child_process', () => ({
  __esModule: true,
  default: { execFileSync: (cmd: string, args: string[]) => execFileSync(cmd, args) },
}));
const powershellCalls = (asking: string): number =>
  execFileSync.mock.calls.filter(([, args]) => args[args.length - 1].includes(asking)).length;

import { resolvePoBLayout, defaultBuildsDirectory, forgetPlatformLookups } from '../../src/utils/pobLayout.js';

const realPlatform = process.platform;
function setPlatform(value: string): void {
  Object.defineProperty(process, 'platform', { value, configurable: true });
}

// Fixed Windows roots, so the tests mean the same thing on every CI platform
const WIN_ENV: Record<string, string> = {
  APPDATA: 'C:\\Users\\me\\AppData\\Roaming',
  ProgramData: 'C:\\ProgramData',
  ProgramFiles: 'C:\\Program Files',
  'ProgramFiles(x86)': 'C:\\Program Files (x86)',
  LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
};
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  present.clear();
  contents.clear();
  powershellAvailable = true;
  documents = 'C:\\Users\\me\\Documents';
  registryInstall = null;
  execFileSync.mockClear();
  forgetPlatformLookups();
  setPlatform(realPlatform);
  for (const [key, value] of Object.entries(WIN_ENV)) {
    savedEnv[key] = process.env[key];
    process.env[key] = value;
  }
});

afterEach(() => {
  for (const key of Object.keys(WIN_ENV)) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

afterAll(() => {
  setPlatform(realPlatform);
});

const BUNDLE = '/Applications/Path of Building.app';
const BUNDLE_LUA = path.join(BUNDLE, 'Contents', 'Resources', 'lua');
const APP_SRC = path.join(os.homedir(), 'Library', 'Application Support', 'PathOfBuildingMac', 'src');

const WIN_APP = path.join(WIN_ENV.APPDATA, 'Path of Building Community');

/** A Windows PoB is flat: program files beside the runtime. The installer adds installed.cfg. */
function installWindowsApp(root: string, { installed = true } = {}): void {
  present.add(path.join(root, 'Launch.lua'));
  present.add(path.join(root, 'lua51.dll'));
  if (installed) present.add(path.join(root, 'installed.cfg'));
}

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
    // sha1 is a directory module; dropping this breaks loading only *after* the
    // ready banner, surfacing as "build not initialized" on the first request
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

  describe('on Windows', () => {
    beforeEach(() => setPlatform('win32'));

    it('should use the app the installer put under APPDATA when no path is configured', () => {
      installWindowsApp(WIN_APP);

      const layout = resolvePoBLayout();

      expect(layout.kind).toBe('windows-app');
      expect(layout.src).toBe(WIN_APP);
      // the runtime's C modules are DLLs beside Launch.lua, its pure-Lua modules under lua/
      expect(layout.luaCPath).toEqual([path.join(WIN_APP, '?.dll')]);
      expect(layout.luaPath).toContain(path.join(WIN_APP, 'lua', '?', 'init.lua'));
    });

    it('should use the location the installer recorded in the registry', () => {
      // a hand-picked install folder shows up nowhere else
      const chosen = 'D:\\Programs\\Path of Building Community';
      registryInstall = chosen;
      installWindowsApp(chosen);
      installWindowsApp(WIN_APP);

      const layout = resolvePoBLayout();

      expect(layout.kind).toBe('windows-app');
      expect(layout.src).toBe(chosen);
    });

    it('should pass over a recorded location whose folder is gone', () => {
      registryInstall = 'E:\\old\\Path of Building Community';
      installWindowsApp(WIN_APP);

      expect(resolvePoBLayout().src).toBe(WIN_APP);
    });

    it('should ask the registry once per process', () => {
      registryInstall = 'D:\\Programs\\Path of Building Community';
      installWindowsApp(registryInstall);

      resolvePoBLayout();
      resolvePoBLayout();
      defaultBuildsDirectory();

      expect(powershellCalls('Uninstall')).toBe(1);
    });

    it('should look in ProgramData and Program Files after APPDATA', () => {
      const older = path.join(WIN_ENV.ProgramData, 'Path of Building Community');
      installWindowsApp(older);

      expect(resolvePoBLayout().src).toBe(older);

      installWindowsApp(WIN_APP);

      expect(resolvePoBLayout().src).toBe(WIN_APP);
    });

    it('should not take a directory for an app without the runtime beside it', () => {
      // program files alone, as in a stray copy of src/
      present.add(path.join(WIN_APP, 'Launch.lua'));

      expect(resolvePoBLayout().kind).toBe('checkout');
    });

    it('should treat an explicit flat directory as a Windows app', () => {
      // a portable unzip can live anywhere, so it arrives through POB_PATH
      const portable = 'D:\\Games\\PathOfBuilding';
      installWindowsApp(portable, { installed: false });

      const layout = resolvePoBLayout(portable);

      expect(layout.kind).toBe('windows-app');
      expect(layout.src).toBe(portable);
    });

    it('should keep an explicit checkout a checkout even when an app is installed', () => {
      installWindowsApp(WIN_APP);
      present.add('/repo/runtime');

      const layout = resolvePoBLayout('/repo/src');

      expect(layout.kind).toBe('checkout');
      expect(layout.luaCPath[0]).toBe(path.join('/repo', 'runtime', '?.dll'));
    });
  });

  it('should ignore a Windows install on other platforms', () => {
    setPlatform('linux');
    installWindowsApp(WIN_APP);

    expect(resolvePoBLayout().kind).toBe('checkout');
  });
});

describe('defaultBuildsDirectory', () => {
  // Only observable when both exist, as on a machine that used the old port first
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

  describe('on Windows', () => {
    const DOCUMENTS = 'C:\\Users\\me\\OneDrive\\Documents';
    const USER_PATH = path.join(DOCUMENTS, 'Path of Building');

    beforeEach(() => {
      setPlatform('win32');
      documents = DOCUMENTS;
    });

    it('should follow the Documents folder Windows reports, not the home directory', () => {
      installWindowsApp(WIN_APP);

      // OneDrive and folder redirection move Documents; PoB follows the shell folder
      expect(defaultBuildsDirectory()).toBe(path.join(USER_PATH, 'Builds'));
    });

    it('should use Documents when no app is installed at all', () => {
      expect(defaultBuildsDirectory()).toBe(path.join(USER_PATH, 'Builds'));
    });

    it('should keep a portable app\'s builds beside it', () => {
      // without installed.cfg PoB runs standalone and writes its user data next to Launch.lua
      installWindowsApp(WIN_APP, { installed: false });

      expect(defaultBuildsDirectory()).toBe(path.join(WIN_APP, 'Builds'));
      expect(powershellCalls('GetFolderPath')).toBe(0);
    });

    it('should honour a custom build save path from Settings.xml', () => {
      installWindowsApp(WIN_APP);
      contents.set(
        path.join(USER_PATH, 'Settings.xml'),
        '<?xml version="1.0" encoding="UTF-8"?>\n<PathOfBuilding>\n' +
          '\t<Misc buildSortMode="NAME" buildPath="E:\\PoE &amp; builds\\" nodePowerTheme="RED/BLUE"/>\n' +
          '</PathOfBuilding>\n',
      );

      expect(defaultBuildsDirectory()).toBe('E:\\PoE & builds');
    });

    it('should ignore a Settings.xml that keeps the default build path', () => {
      installWindowsApp(WIN_APP);
      contents.set(path.join(USER_PATH, 'Settings.xml'), '<PathOfBuilding><Misc buildSortMode="NAME"/></PathOfBuilding>');

      expect(defaultBuildsDirectory()).toBe(path.join(USER_PATH, 'Builds'));
    });

    it('should fall back to ~/Documents when PowerShell cannot be asked', () => {
      powershellAvailable = false;
      installWindowsApp(WIN_APP);

      expect(defaultBuildsDirectory()).toBe(path.join(os.homedir(), 'Documents', 'Path of Building', 'Builds'));
    });
  });
});
