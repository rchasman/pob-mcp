import fs from "fs";
import os from "os";
import path from "path";

/**
 * Where the Lua engine lives and how to reach its modules.
 *
 * A PathOfBuilding git checkout and an installed PoB.app hold the same engine in
 * different shapes, so the search paths cannot be derived from one hardcoded layout.
 */
export interface PoBLayout {
  kind: "checkout" | "macos-app";
  /** Directory containing HeadlessWrapper.lua; the cwd for the Lua process. */
  src: string;
  /** package.path entries, in order. */
  luaPath: string[];
  /** package.cpath entries, in order. */
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

/** Installed PoB.app locations, most likely first. */
function appBundleCandidates(): string[] {
  const home = os.homedir();
  return [
    "/Applications/Path of Building.app",
    "/Applications/PathOfBuilding.app",
    path.join(home, "Applications", "Path of Building.app"),
    path.join(home, "Applications", "PathOfBuilding.app"),
  ];
}

/** A bundle counts only if it carries the pure-Lua modules the engine needs. */
function findAppBundle(): string | null {
  return appBundleCandidates().find((b) => exists(path.join(b, "Contents", "Resources", "lua"))) ?? null;
}

/**
 * The launcher relocates a writable copy of src/ here and its updater keeps that copy
 * current, so it is preferred over the read-only copy inside the bundle.
 */
function macAppSrcCandidates(bundle: string): string[] {
  return [
    path.join(os.homedir(), "Library", "Application Support", "PathOfBuildingMac", "src"),
    path.join(bundle, "Contents", "Resources", "src"),
  ];
}

function checkoutLayout(src: string): PoBLayout {
  // A checkout keeps runtime/ beside src/
  const base = src.endsWith(`${path.sep}src`) || src.endsWith("/src") ? src.slice(0, -4) : src;
  const runtime = path.join(base, "runtime");
  const runtimeLua = path.join(runtime, "lua");
  const luaRocks = path.join(os.homedir(), ".luarocks", "lib", "lua", "5.1");
  const ext = process.platform === "win32" ? "dll" : "so";

  return {
    kind: "checkout",
    src,
    luaPath: [path.join(runtimeLua, "?.lua"), path.join(runtimeLua, "?", "init.lua")],
    // runtime/ first so a checkout's own modules win, then luarocks for the
    // platforms PoB ships no build for.
    luaCPath: [path.join(runtime, `?.${ext}`), path.join(luaRocks, `?.${ext}`)],
  };
}

function macAppLayout(bundle: string, src: string): PoBLayout {
  const resources = path.join(bundle, "Contents", "Resources");
  const macos = path.join(bundle, "Contents", "MacOS");

  return {
    kind: "macos-app",
    src,
    // sha1 is a directory module, so the ?/init.lua entry is required
    luaPath: [path.join(resources, "lua", "?.lua"), path.join(resources, "lua", "?", "init.lua")],
    // The bundle ships its C modules as .dylib rather than .so
    luaCPath: [path.join(macos, "?.dylib")],
  };
}

/**
 * Resolve the engine layout.
 *
 * An explicit src wins, and is treated as a checkout unless it has no sibling
 * runtime/ and an installed PoB.app is present. With no explicit src, an installed
 * app is preferred over the legacy checkout default, since it needs no setup and
 * always matches the PoB the user actually runs.
 */
export function resolvePoBLayout(explicitSrc?: string): PoBLayout {
  const bundle = process.platform === "darwin" ? findAppBundle() : null;

  if (explicitSrc) {
    const base = explicitSrc.endsWith(`${path.sep}src`) || explicitSrc.endsWith("/src")
      ? explicitSrc.slice(0, -4)
      : explicitSrc;
    if (!exists(path.join(base, "runtime")) && bundle) {
      return macAppLayout(bundle, explicitSrc);
    }
    return checkoutLayout(explicitSrc);
  }

  if (bundle) {
    const src = macAppSrcCandidates(bundle).find((s) => exists(path.join(s, "HeadlessWrapper.lua")));
    if (src) return macAppLayout(bundle, src);
  }

  return checkoutLayout(path.join(os.homedir(), "Projects", "PathOfBuilding", "src"));
}

/** Default builds directory, matching where the installed PoB actually writes. */
export function defaultBuildsDirectory(): string {
  const home = os.homedir();
  if (process.platform === "darwin") {
    // The current macOS port writes here; the older Qt port used ~/Path of Building
    const appSupport = path.join(home, "Library", "Application Support", "Path of Building", "Builds");
    const legacy = path.join(home, "Path of Building", "Builds");
    if (exists(appSupport)) return appSupport;
    if (exists(legacy)) return legacy;
    return appSupport;
  }
  return path.join(home, "Documents", "Path of Building", "Builds");
}
