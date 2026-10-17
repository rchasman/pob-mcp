import { describe, it, expect } from '@jest/globals';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';

// The adapter runs these in place of the headless files a Windows PoB does not ship.
// Their README records the upstream digest, so a drift from upstream is a deliberate
// refresh (node scripts/vendor-headless.mjs) and not an accident.
const VENDOR_DIR = path.resolve(__dirname, '..', '..', 'lua', 'vendor');

function recordedDigests(): Map<string, string> {
  const readme = readFileSync(path.join(VENDOR_DIR, 'README.md'), 'utf8');
  const digests = new Map<string, string>();
  for (const match of readme.matchAll(/^- `([^`]+\.lua)`[^\n]*\n\s+`sha256 ([0-9a-f]{64})`/gm)) {
    digests.set(match[1], match[2]);
  }
  return digests;
}

describe('vendored headless files', () => {
  const digests = recordedDigests();

  it('should record a digest for both files', () => {
    expect([...digests.keys()].sort()).toEqual(['HeadlessWrapper.lua', '_SimpleGraphic.def.lua']);
  });

  it.each([...digests.entries()])('should keep %s byte-identical to upstream', (file, sha256) => {
    // git may check the file out with CRLF on Windows; the digest is over what the repository stores
    const stored = readFileSync(path.join(VENDOR_DIR, file), 'utf8').replace(/\r\n/g, '\n');
    const actual = createHash('sha256').update(stored).digest('hex');

    expect(actual).toBe(sha256);
  });
});
