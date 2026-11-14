// Runs in `npm test`: the size budget of the build (tools/dist-size.mjs), checked on prepared folders.
// The real dist/ is measured by `npm run e2e` (step "dist size") after every build it plays.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MAX_DIST, MAX_DIST_FILE, checkDistSize } from './dist-size.mjs';

const dirs = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
/** A folder with files of the given sizes: { 'assets/a.js': 1000, ... }. */
function folder(files) {
  const dir = mkdtempSync(join(tmpdir(), 'dist-size-'));
  dirs.push(dir);
  for (const [path, size] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), Buffer.alloc(size));
  }
  return dir;
}

describe('the size budget of the build', () => {
  it('is the one of docs/15-tech.md: 12 MB in all, 1 MB per file', () => {
    expect([MAX_DIST, MAX_DIST_FILE]).toEqual([12_000_000, 1_000_000]);
  });

  it('passes a build within both limits and names its heaviest file', () => {
    const r = checkDistSize(folder({ 'index.html': 900, 'assets/index.js': 800_000, 'models/hero/a.glb': 600_000 }));
    expect(r.problems).toEqual([]);
    expect(r.total).toBe(1_400_900);
    expect(r.files).toBe(3);
    expect(r.heaviest).toEqual({ path: 'assets/index.js', size: 800_000 });
  });

  it('allows a file of exactly the limit and fails one byte above it, naming the file', () => {
    expect(checkDistSize(folder({ 'a.glb': 1000 }), 10_000, 1000).problems).toEqual([]);
    const r = checkDistSize(folder({ 'a.glb': 1000, 'models/big.glb': 1001 }), 10_000, 1000);
    expect(r.problems).toEqual(['models/big.glb: 1001 bytes, the limit for one file is 1000']);
  });

  it('fails a build above the total, even when every file is within its limit', () => {
    const r = checkDistSize(folder({ 'a': 900, 'b': 900, 'c/d': 900 }), 2000, 1000);
    expect(r.problems).toEqual(['dist/: 2700 bytes in 3 files, the limit is 2000']);
  });

  it('fails an empty or missing folder: there is nothing to measure', () => {
    expect(checkDistSize(folder({})).problems.join()).toContain('holds no files');
    expect(checkDistSize(join(tmpdir(), 'no-such-dist-folder-at-all')).problems.join()).toContain('cannot read');
  });
});
