// Refresh lua/vendor/ from Path of Building Community and record where it came from.
// Usage: node scripts/vendor-headless.mjs [git ref]   (default: dev)
//
// The two files let PoB run under a plain LuaJIT. A Windows install ships neither, so
// the adapter falls back to these copies; see lua/vendor/README.md.
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = "PathOfBuildingCommunity/PathOfBuilding";
const FILES = ["HeadlessWrapper.lua", "_SimpleGraphic.def.lua"];
const ref = process.argv[2] || "dev";
const vendorDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "lua", "vendor");

async function github(route) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/${route}`, {
    headers: { accept: "application/vnd.github+json", "user-agent": "pob-mcp vendor-headless" },
  });
  if (!res.ok) throw new Error(`GitHub ${route}: ${res.status} ${res.statusText}`);
  return res.json();
}

async function raw(commit, file) {
  const res = await fetch(`https://raw.githubusercontent.com/${REPO}/${commit}/src/${file}`);
  if (!res.ok) throw new Error(`${file}@${commit}: ${res.status} ${res.statusText}`);
  return Buffer.from(await res.arrayBuffer());
}

const head = await github(`commits/${encodeURIComponent(ref)}`);
const commit = head.sha;
const date = head.commit.committer.date.slice(0, 10);

const lines = [];
for (const file of FILES) {
  const body = await raw(commit, file);
  fs.writeFileSync(path.join(vendorDir, file), body);
  const sha256 = createHash("sha256").update(body).digest("hex");
  const [last] = await github(`commits?path=src/${file}&sha=${commit}&per_page=1`);
  lines.push(`- \`${file}\` last changed upstream in \`${last.sha}\`\n  \`sha256 ${sha256}\``);
  console.log(`${file}: ${body.length} bytes, sha256 ${sha256}`);
}

// The provenance block runs from "- upstream commit" to the next blank line. The
// README may be checked out with CRLF, so match and write whichever ending it uses.
const readmePath = path.join(vendorDir, "README.md");
const readme = fs.readFileSync(readmePath, "utf8");
const eol = readme.includes("\r\n") ? "\r\n" : "\n";
const provenance =
  [`- upstream commit \`${commit}\` (${date}, \`${ref}\`)`, ...lines].join(eol).replace(/\n/g, eol) + eol;
const updated = readme.replace(/^- upstream commit `[\s\S]*?\r?\n(?=\r?\n)/m, provenance);
if (updated === readme) throw new Error("README.md: provenance block not found");
fs.writeFileSync(readmePath, updated);
console.log(`lua/vendor/ now matches ${REPO}@${commit.slice(0, 9)} (${date})`);
