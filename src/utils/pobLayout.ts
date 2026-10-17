import childProcess from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

/** Where the Lua engine lives and how to reach its modules. */
export interface PoBLayout {
  kind: "checkout" | "macos-app" | "windows-app";
  /** Directory holding Launch.lua; the cwd for the Lua process. */
  src: string;
  luaPath: string[];
  luaCPath: string[];
}

const exists = (p: string): boolean => {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
};

function appBundleCandidates(): string[] {
  const home = os.homedir();
  return [
    "/Applications/Path of Building.app",
    "/Applications/PathOfBuilding.app",
    path.join(home, "Applications", "Path of Building.app"),
    path.join(home, "Applications", "PathOfBuilding.app"),
  ];
}

/** A bundle only counts if it carries the pure-Lua modules. */
function findAppBundle(): string | null {
  return appBundleCandidates().find((b) => exists(path.join(b, "Contents", "Resources", "lua"))) ?? null;
}

/** The launcher's updater keeps the Application Support copy current, so prefer it. */
function macAppSrcCandidates(bundle: string): string[] {
  return [
    path.join(os.homedir(), "Library", "Application Support", "PathOfBuildingMac", "src"),
    path.join(bundle, "Contents", "Resources", "src"),
  ];
}

/**
 * The installer's default is %APPDATA%; ProgramData and Program Files are where older
 * installers and hand-picked locations put it. A portable unzip can be anywhere, so it
 * needs POB_PATH.
 */
function windowsInstallCandidates(): string[] {
  const env = process.env;
  const roots = [
    env.APPDATA,
    env.ProgramData,
    env["ProgramFiles(x86)"],
    env.ProgramFiles,
    env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, "Programs"),
  ];
  return roots.filter((r): r is string => !!r).map((r) => path.join(r, "Path of Building Community"));
}

/** A Windows PoB is flat: the program's Launch.lua sits beside the runtime's lua51.dll. */
const isWindowsApp = (dir: string): boolean =>
  exists(path.join(dir, "Launch.lua")) && exists(path.join(dir, "lua51.dll"));

function findWindowsApp(): string | null {
  return windowsInstallCandidates().find(isWindowsApp) ?? null;
}

const stripSrc = (p: string): string =>
  p.endsWith(`${path.sep}src`) || p.endsWith("/src") ? p.slice(0, -4) : p;

function checkoutLayout(src: string): PoBLayout {
  const base = stripSrc(src);
  const runtime = path.join(base, "runtime");
  const runtimeLua = path.join(runtime, "lua");
  const luaRocks = path.join(os.homedir(), ".luarocks", "lib", "lua", "5.1");
  const ext = process.platform === "win32" ? "dll" : "so";

  return {
    kind: "checkout",
    src,
    luaPath: [path.join(runtimeLua, "?.lua"), path.join(runtimeLua, "?", "init.lua")],
    // runtime/ first so a checkout's own modules win over luarocks
    luaCPath: [path.join(runtime, `?.${ext}`), path.join(luaRocks, `?.${ext}`)],
  };
}

function macAppLayout(bundle: string, src: string): PoBLayout {
  const lua = path.join(bundle, "Contents", "Resources", "lua");
  const macos = path.join(bundle, "Contents", "MacOS");

  return {
    kind: "macos-app",
    src,
    // sha1 is a directory module, hence the ?/init.lua entry
    luaPath: [path.join(lua, "?.lua"), path.join(lua, "?", "init.lua")],
    // the bundle ships .dylib rather than .so
    luaCPath: [path.join(macos, "?.dylib")],
  };
}

/**
 * The manifest puts the runtime's pure-Lua modules under lua/ and its C modules as
 * DLLs next to the program files. It lists no headless files, so the adapter supplies
 * HeadlessWrapper.lua and _SimpleGraphic.def.lua itself (see lua/vendor/).
 */
function windowsAppLayout(root: string): PoBLayout {
  const lua = path.join(root, "lua");

  return {
    kind: "windows-app",
    src: root,
    luaPath: [path.join(lua, "?.lua"), path.join(lua, "?", "init.lua")],
    luaCPath: [path.join(root, "?.dll")],
  };
}

/**
 * An explicit src wins. It is a checkout when runtime/ sits beside it, a Windows app
 * when it is flat, and otherwise an installed macOS app's src if there is one.
 * Without one, prefer an installed app: no setup, and always the same PoB the user runs.
 */
export function resolvePoBLayout(explicitSrc?: string): PoBLayout {
  if (explicitSrc) {
    if (exists(path.join(stripSrc(explicitSrc), "runtime"))) return checkoutLayout(explicitSrc);
    if (isWindowsApp(explicitSrc)) return windowsAppLayout(explicitSrc);
    const bundle = process.platform === "darwin" ? findAppBundle() : null;
    return bundle ? macAppLayout(bundle, explicitSrc) : checkoutLayout(explicitSrc);
  }

  if (process.platform === "win32") {
    const app = findWindowsApp();
    if (app) return windowsAppLayout(app);
  }

  if (process.platform === "darwin") {
    const bundle = findAppBundle();
    const src = bundle && macAppSrcCandidates(bundle).find((s) => exists(path.join(s, "HeadlessWrapper.lua")));
    if (bundle && src) return macAppLayout(bundle, src);
  }

  return checkoutLayout(path.join(os.homedir(), "Projects", "PathOfBuilding", "src"));
}

/**
 * Documents as Windows resolves it: OneDrive and folder redirection move it away from
 * ~/Documents, and PoB follows the shell folder, not the home directory.
 */
function windowsDocuments(): string {
  try {
    const out = childProcess.execFileSync(
      "powershell.exe",
      [
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "[Console]::OutputEncoding = [Text.Encoding]::UTF8; [Environment]::GetFolderPath('MyDocuments')",
      ],
      { encoding: "utf8", windowsHide: true, timeout: 10_000, stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (out) return out;
  } catch {
    // no PowerShell, or it was blocked: fall back to the conventional location
  }
  return path.join(os.homedir(), "Documents");
}

/**
 * PoB keeps its user data beside Launch.lua when run standalone and under Documents
 * when the installer left installed.cfg behind.
 */
function windowsUserPath(app: string | null): string {
  if (app && !exists(path.join(app, "installed.cfg"))) return app;
  return path.join(windowsDocuments(), "Path of Building");
}

const XML_ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&apos;": "'",
};

/** The "Build save path" from PoB's own Settings.xml, written only when it differs from the default. */
function settingsBuildPath(settingsXml: string): string | null {
  let text: string;
  try {
    text = fs.readFileSync(settingsXml, "utf8");
  } catch {
    return null;
  }
  const value = text.match(/\bbuildPath="([^"]*)"/)?.[1];
  if (!value) return null;
  const decoded = value.replace(/&(?:amp|lt|gt|quot|apos);/g, (entity) => XML_ENTITIES[entity]);
  const trimmed = decoded.replace(/[\\/]+$/, "");
  return trimmed || decoded;
}

function buildsDirectoryUnder(userPath: string): string {
  return settingsBuildPath(path.join(userPath, "Settings.xml")) ?? path.join(userPath, "Builds");
}

/** Where the installed PoB actually writes builds. */
export function defaultBuildsDirectory(): string {
  const home = os.homedir();
  if (process.platform === "win32") {
    return buildsDirectoryUnder(windowsUserPath(findWindowsApp()));
  }
  if (process.platform !== "darwin") {
    return path.join(home, "Documents", "Path of Building", "Builds");
  }
  // current port uses Application Support; the older Qt port used ~/Path of Building
  const appSupport = path.join(home, "Library", "Application Support", "Path of Building", "Builds");
  const legacy = path.join(home, "Path of Building", "Builds");
  if (exists(appSupport)) return appSupport;
  return exists(legacy) ? legacy : appSupport;
}
