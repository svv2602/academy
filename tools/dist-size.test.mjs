// Runs in `npm test`: the size budget of the build (tools/dist-size.mjs), checked on prepared folders.
// The real dist/ is measured by `npm run e2e` (step "dist size") after every build it plays.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MAX_DIST, MAX_DIST_FILE, MAX_VOICE, checkDistSize } from './dist-size.mjs';

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
  it('is the one of docs/15-tech.md: 12 MB for the game, 4 MB for the voice, 1 MB per file', () => {
    expect([MAX_DIST, MAX_VOICE, MAX_DIST_FILE]).toEqual([12_000_000, 4_000_000, 1_000_000]);
  });

  it('counts the voice apart: clips do not use up the game\'s 12 MB, and the voice has its own limit', () => {
    const r = checkDistSize(folder({ 'a.glb': 900, 'voice/x.mp3': 900, 'voice/y.mp3': 900 }), 1000, 1000, 2000);
    expect(r.problems).toEqual([]);
    expect([r.total, r.voice, r.files]).toEqual([900, 1800, 3]);
    const over = checkDistSize(folder({ 'a.glb': 900, 'voice/x.mp3': 900, 'voice/y.mp3': 900, 'voice/z.mp3': 300 }), 1000, 1000, 2000);
    expect(over.problems).toEqual(['dist/voice/: 2100 bytes in 3 files, the limit is 2000']);
    // A file that only has "voice" in its name is the game's.
    expect(checkDistSize(folder({ 'assets/voice.js': 900, 'b': 200 }), 1000, 1000, 2000).problems.join()).toContain('without voice/');
  });

  it('leaves the bank of the old game out of both limits (R37), but holds each of its files to the limit for one', () => {
    const r = checkDistSize(folder({ 'a.glb': 900, 'voice/x.mp3': 900, 'bank/q_add_1_2.mp3': 900, 'bank/cross_2_9.mp3': 900 }), 1000, 1000, 1000);
    expect(r.problems).toEqual([]);
    expect([r.total, r.voice, r.bank, r.files]).toEqual([900, 900, 1800, 4]);
    const big = checkDistSize(folder({ 'a.glb': 900, 'bank/cross_2_9.mp3': 1001 }), 1000, 1000, 1000);
    expect(big.problems).toEqual(['bank/cross_2_9.mp3: 1001 bytes, the limit for one file is 1000']);
    // The bank is out of the limits only as long as the service worker does not download it with the installation.
    const sw = 'define(["./workbox-1"],(function(e){e.precacheAndRoute([{url:"voice/x.mp3",revision:"1"},{url:"bank/q_add_1_2.mp3",revision:"2"}])}));';
    const cached = checkDistSize(folder({ 'a.glb': 900, 'bank/q_add_1_2.mp3': 900 }), 1000, 1000, 1000);
    expect(cached.problems).toEqual([]);
    writeFileSync(join(dirs.at(-1), 'sw.js'), sw);
    expect(checkDistSize(dirs.at(-1), 2000, 1000, 1000).problems).toEqual(['sw.js precaches 1 files of bank/: the bank is not part of the first load (vite.config.ts globIgnores)']);
    // Only the folder bank/ is the bank: a file of the game named so is the game's.
    expect(checkDistSize(folder({ 'assets/bank.js': 900, 'b': 200 }), 1000, 1000, 1000).problems.join()).toContain('without voice/ and bank/');
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
    expect(r.problems).toEqual(['dist/ without voice/ and bank/: 2700 bytes in 3 files, the limit is 2000']);
  });

  it('fails an empty or missing folder: there is nothing to measure', () => {
    expect(checkDistSize(folder({})).problems.join()).toContain('holds no files');
    expect(checkDistSize(join(tmpdir(), 'no-such-dist-folder-at-all')).problems.join()).toContain('cannot read');
  });
});
