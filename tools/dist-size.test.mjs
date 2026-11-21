// Runs in `npm test`: the size budget of the build (tools/dist-size.mjs), checked on prepared folders.
// The real dist/ is measured by `npm run e2e` (step "dist size") after every build it plays.
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { MAX_DIST, MAX_DIST_FILE, MAX_VOICE, MAX_WORLD, MAX_WORLD_VOICE, checkDistSize, installedWorlds, sizeSummary, sourceWorlds } from './dist-size.mjs';

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
  it('is the one of docs/15-tech.md: 12 MB for the game, 5 MB for the voice, 1 MB per file', () => {
    expect([MAX_DIST, MAX_VOICE, MAX_DIST_FILE]).toEqual([12_000_000, 6_000_000, 1_000_000]);
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

  it('a next world has a budget of its own only while the installation does not download it: its files must not be precached (TECH-09)', () => {
    const layout = { worlds: ['ocean', 'space'], first: 'fairy' };
    const build = { 'a.glb': 900, 'models/ocean/reef.glb': 500, 'voice/ocean/hi.mp3': 300, 'story/ocean/1.webp': 100, 'models/space/s.glb': 200, 'worlds.json': 50 };
    const entries = (urls) => `define(["./workbox-1"],(function(e){e.precacheAndRoute([${urls.map((u) => `{url:"${u}",revision:"1"}`).join(',')}],{})}));`;
    // The list of the core and the first world, with the list of the worlds and code named after a world: nothing of a next world.
    const clean = folder({ ...build, 'sw.js': 0 });
    writeFileSync(join(clean, 'sw.js'), entries(['a.glb', 'worlds.json', 'assets/ocean-AbCd.js', 'models/ocean.glb', 'models/fairy/tree.glb']));
    expect(checkDistSize(clean, 2000, 1000, 1000, layout).problems).toEqual([]);
    // A file of a next world in the list - of its models, its voice or its story frames - is a problem, counted per world.
    const cached = folder({ ...build, 'sw.js': 0 });
    writeFileSync(join(cached, 'sw.js'), entries(['a.glb', 'models/ocean/reef.glb', 'voice/ocean/hi.mp3', 'story/ocean/1.webp', 'models/space/s.glb']));
    expect(checkDistSize(cached, 2000, 1000, 1000, layout).problems).toEqual([
      'sw.js precaches 3 files of the world ocean: a next world is not part of the first load (vite.config.ts globIgnores)',
      'sw.js precaches 1 files of the world space: a next world is not part of the first load (vite.config.ts globIgnores)',
    ]);
    // Without next worlds the same folders are the first load's: nothing to report.
    expect(checkDistSize(cached, 5000, 1000, 1000, { worlds: [] }).problems).toEqual([]);
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

// TECH-09 (decision Q14): the core with the first world is one group, every next world a group of its own. The next
// worlds are named by the fifth argument here; the real build takes them from src/worlds/ (`sourceWorlds`).
describe('the size budget of every world', () => {
  const two = { worlds: ['probe', 'sea'], first: 'fairy', maxWorld: 1000, maxWorldVoice: 500 };

  it('is the one of TECH-09 for a next world: 8 MB of models and story frames, 3 MB of voice', () => {
    expect([MAX_WORLD, MAX_WORLD_VOICE]).toEqual([8_000_000, 3_000_000]);
  });

  it('returns the layout: the core with the first world, and every next world with its models, frames and voice', () => {
    const r = checkDistSize(folder({
      'index.html': 100, 'assets/index.js': 300, 'models/hero/base.glb': 200, 'models/nature2/Fern.glb': 50, 'voice/intro.mp3': 70, 'voice/tap_1.mp3': 30,
      'bank/q_add_1_2.mp3': 40,
      'models/probe/tree.glb': 400, 'models/probe/tex/bark.webp': 100, 'story/probe/01.webp': 250, 'voice/probe/intro.mp3': 60, 'voice/probe/bye.mp3': 20,
      'models/sea/fish.glb': 90,
    }), 1000, 1000, 1000, two);
    expect(r.problems).toEqual([]);
    expect([r.total, r.voice, r.bank, r.files]).toEqual([650, 100, 40, 13]);
    expect(r.first).toBe('fairy');
    expect(r.worlds).toEqual([{ id: 'probe', total: 750, voice: 80, files: 5 }, { id: 'sea', total: 90, voice: 0, files: 1 }]);
    expect(r.heaviest).toEqual({ path: 'models/probe/tree.glb', size: 400 });
  });

  it('lists a next world that has no files yet, and without next worlds the whole build is the first load', () => {
    const files = { 'a.glb': 300, 'models/probe/tree.glb': 400, 'voice/probe/intro.mp3': 60, 'voice/x.mp3': 10 };
    expect(checkDistSize(folder(files), 1000, 1000, 1000, two).worlds).toEqual([{ id: 'probe', total: 400, voice: 60, files: 2 }, { id: 'sea', total: 0, voice: 0, files: 0 }]);
    const none = checkDistSize(folder(files), 1000, 1000, 1000, { worlds: [] });
    expect([none.total, none.voice, none.worlds, none.first]).toEqual([700, 70, [], null]);
  });

  it('fails a next world above its limit of models and story frames together, naming the world', () => {
    // exactly the limit fits; the models and the frames are within it each and over it together
    expect(checkDistSize(folder({ 'a.glb': 900, 'models/probe/tree.glb': 600, 'story/probe/01.webp': 400 }), 1000, 1000, 1000, two).problems).toEqual([]);
    const r = checkDistSize(folder({ 'a.glb': 900, 'models/probe/tree.glb': 600, 'story/probe/01.webp': 401, 'models/sea/fish.glb': 1000 }), 1000, 1000, 1000, two);
    expect(r.problems).toEqual(['the world probe (models/probe/ and story/probe/): 1001 bytes in 2 files, the limit is 1000']);
    // each world against its own limit: two worlds within it are not one world above it
    const both = checkDistSize(folder({ 'models/probe/tree.glb': 700, 'models/sea/fish.glb': 700 }), 1000, 1000, 1000, two);
    expect(both.problems).toEqual([]);
    const sea = checkDistSize(folder({ 'models/probe/tree.glb': 700, 'models/sea/fish.glb': 700, 'story/sea/01.webp': 301 }), 1000, 1000, 1000, two);
    expect(sea.problems).toEqual(['the world sea (models/sea/ and story/sea/): 1001 bytes in 2 files, the limit is 1000']);
  });

  it('fails a next world above its limit of voice, naming the world; its voice does not use up its models', () => {
    // exactly the limit fits; the clips are not the models: 1000 of models and 500 of voice fit together
    expect(checkDistSize(folder({ 'models/probe/tree.glb': 1000, 'voice/probe/a.mp3': 300, 'voice/probe/b.mp3': 200 }), 1000, 1000, 1000, two).problems).toEqual([]);
    const r = checkDistSize(folder({ 'models/probe/tree.glb': 1000, 'voice/probe/a.mp3': 300, 'voice/probe/b.mp3': 201, 'voice/sea/a.mp3': 500 }), 1000, 1000, 1000, two);
    expect(r.problems).toEqual(['the voice of the world probe (voice/probe/): 501 bytes in 2 files, the limit is 500']);
    // both limits of one world at once: two problems
    const twice = checkDistSize(folder({ 'models/sea/fish.glb': 1000, 'story/sea/01.webp': 1, 'voice/sea/a.mp3': 501 }), 1000, 1000, 1000, two);
    expect(twice.problems).toEqual([
      'the world sea (models/sea/ and story/sea/): 1001 bytes in 2 files, the limit is 1000',
      'the voice of the world sea (voice/sea/): 501 bytes in 1 files, the limit is 500',
    ]);
  });

  it('fails the core with the first world above 12 MB without voice, naming the group; a next world does not use it up', () => {
    // 1000 of the first load and 1000 of a next world: each within its own limit
    const fits = checkDistSize(folder({ 'assets/index.js': 600, 'models/nature2/Fern.glb': 400, 'models/probe/tree.glb': 900, 'story/probe/01.webp': 100 }), 1000, 1000, 1000, two);
    expect(fits.problems).toEqual([]);
    expect([fits.total, fits.worlds[0].total]).toEqual([1000, 1000]);
    const r = checkDistSize(folder({ 'assets/index.js': 600, 'models/nature2/Fern.glb': 401, 'models/probe/tree.glb': 900, 'models/sea/fish.glb': 10 }), 1000, 1000, 1000, two);
    expect(r.problems).toEqual(['the core and the first world (dist/ without voice/, bank/ and the worlds probe, sea): 1001 bytes in 2 files, the limit is 1000']);
    // a listed world without files is not named: nothing of it was left out
    const one = checkDistSize(folder({ 'assets/index.js': 600, 'models/nature2/Fern.glb': 401, 'story/sea/01.webp': 10 }), 1000, 1000, 1000, two);
    expect(one.problems).toEqual(['the core and the first world (dist/ without voice/, bank/ and the worlds sea): 1001 bytes in 2 files, the limit is 1000']);
  });

  it('fails the core with the first world above 4 MB of voice, naming the group; the voice of the first world counts in it', () => {
    // the first world's clips lie among the shared ones, and would count from a folder of its own as well
    const fits = checkDistSize(folder({ 'a.glb': 10, 'voice/tap_1.mp3': 400, 'voice/intro.mp3': 300, 'voice/fairy/queen.mp3': 300, 'voice/probe/a.mp3': 500 }), 1000, 1000, 1000, two);
    expect(fits.problems).toEqual([]);
    expect([fits.voice, fits.worlds[0].voice]).toEqual([1000, 500]);
    const r = checkDistSize(folder({ 'a.glb': 10, 'voice/tap_1.mp3': 400, 'voice/intro.mp3': 300, 'voice/fairy/queen.mp3': 301, 'voice/probe/a.mp3': 500 }), 1000, 1000, 1000, two);
    expect(r.problems).toEqual(['the voice of the core and the first world (dist/voice/ without the worlds probe): 1001 bytes in 3 files, the limit is 1000']);
    // the first world is never a next one, even when the list of worlds names it; a world named twice is one world
    const listed = checkDistSize(folder({ 'a.glb': 10, 'voice/tap_1.mp3': 700, 'voice/fairy/queen.mp3': 301, 'models/fairy/castle.glb': 20 }), 1000, 1000, 1000, { ...two, worlds: ['fairy', 'probe', 'probe'] });
    expect(listed.problems).toEqual(['dist/voice/: 1001 bytes in 2 files, the limit is 1000']);
    expect([listed.total, listed.worlds]).toEqual([30, [{ id: 'probe', total: 0, voice: 0, files: 0 }]]);
  });

  it('words the problems of the first load as before while the build holds no files of a next world', () => {
    const r = checkDistSize(folder({ 'a': 900, 'b': 900, 'c/d': 900, 'voice/x.mp3': 600, 'voice/y.mp3': 600 }), 2000, 1000, 1000, two);
    expect(r.problems).toEqual(['dist/ without voice/ and bank/: 2700 bytes in 3 files, the limit is 2000', 'dist/voice/: 1200 bytes in 2 files, the limit is 1000']);
  });

  it('holds a file of a next world to the limit for one file, and keeps the bank out of every world', () => {
    const r = checkDistSize(folder({ 'a.glb': 10, 'models/probe/tree.glb': 301, 'voice/probe/a.mp3': 300, 'bank/probe/q.mp3': 300, 'bank/q.mp3': 200 }), 1000, 300, 1000, two);
    expect(r.problems).toEqual(['models/probe/tree.glb: 301 bytes, the limit for one file is 300']);
    expect([r.bank, r.worlds[0]]).toEqual([500, { id: 'probe', total: 301, voice: 300, files: 2 }]);
  });

  it('applies the limits of TECH-09 when none are given', () => {
    const each = (dir, n, size) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`${dir}/${i}.bin`, size]));
    const layout = { worlds: ['probe'], first: 'fairy' };
    const fits = checkDistSize(folder({ 'a.glb': 10, ...each('models/probe', 5, 1_000_000), ...each('story/probe', 3, 1_000_000), ...each('voice/probe', 3, 1_000_000) }), undefined, undefined, undefined, layout);
    expect(fits.problems).toEqual([]);
    expect(fits.worlds).toEqual([{ id: 'probe', total: 8_000_000, voice: 3_000_000, files: 11 }]);
    writeFileSync(join(dirs.at(-1), 'story/probe/last.bin'), Buffer.alloc(1));
    writeFileSync(join(dirs.at(-1), 'voice/probe/last.bin'), Buffer.alloc(1));
    expect(checkDistSize(dirs.at(-1), undefined, undefined, undefined, layout).problems).toEqual([
      'the world probe (models/probe/ and story/probe/): 8000001 bytes in 9 files, the limit is 8000000',
      'the voice of the world probe (voice/probe/): 3000001 bytes in 4 files, the limit is 3000000',
    ]);
  });

  it('reads the worlds from the sources: the first one is DEFAULT_WORLD, the next ones are the other folders', () => {
    const src = folder({ 'index.ts': 0, 'sea/index.ts': 1, 'fairy/index.ts': 1, 'probe/load.ts': 1, 'notes.md': 1 });
    writeFileSync(join(src, 'index.ts'), "import { fairy } from './fairy';\nexport const WORLDS = [fairy];\n/** The id. */\nexport const DEFAULT_WORLD = 'fairy';\n");
    expect(sourceWorlds(src)).toEqual({ first: 'fairy', worlds: ['probe', 'sea'] });
    writeFileSync(join(src, 'index.ts'), 'export const DEFAULT_WORLD: WorldId = "sea";\n');
    expect(sourceWorlds(src)).toEqual({ first: 'sea', worlds: ['fairy', 'probe'] });
    // No first world named: every folder would be a next world, and the first load would be measured without its own files.
    writeFileSync(join(src, 'index.ts'), 'export const WORLDS = [fairy];\n');
    expect(() => sourceWorlds(src)).toThrow('does not name the first world');
  });

  it('reads the worlds of the installation: the ids listed in INSTALLED, none when it is missing', () => {
    const src = folder({ 'index.ts': 0 });
    writeFileSync(join(src, 'index.ts'), "export const DEFAULT_WORLD = 'fairy';\nexport const INSTALLED: readonly string[] = [DEFAULT_WORLD, 'hub', \"sky\"];\n");
    expect(installedWorlds(src)).toEqual(['hub', 'sky']);
    writeFileSync(join(src, 'index.ts'), "export const DEFAULT_WORLD = 'fairy';\n");
    expect(installedWorlds(src)).toEqual([]);
    expect(installedWorlds()).toContain('hub');
  });

  it('measures the real build by the worlds of src/worlds/ when the worlds are not given', () => {
    const real = sourceWorlds();
    expect(real.first).toMatch(/^[a-z][a-z0-9_]*$/);
    expect(existsSync(new URL(`../src/worlds/${real.first}/index.ts`, import.meta.url))).toBe(true);
    expect(real.worlds).not.toContain(real.first);
    const r = checkDistSize(folder({ 'a.glb': 10 }));
    expect(r.first).toBe(real.first);
    expect(r.worlds.map((w) => w.id)).toEqual(real.worlds.filter((id) => !installedWorlds().includes(id)));   // the hub is the core's
    // limits alone do not name the worlds
    expect(checkDistSize(folder({ 'a.glb': 10 }), 1000, 1000, 1000, { maxWorld: 1 }).first).toBe(real.first);
    // an unreadable folder still tells the first world; there is nothing to lay out
    const missing = checkDistSize(join(tmpdir(), 'no-such-dist-folder-at-all'), 1000, 1000, 1000, two);
    expect([missing.first, missing.worlds]).toEqual(['fairy', []]);
  });

  it('sums the result up in one line for the step "dist size": the first load and every next world', () => {
    const r = checkDistSize(folder({ 'assets/index.js': 915_028, 'models/hero/base.glb': 500_000, 'voice/intro.mp3': 120_000, 'models/probe/tree.glb': 250_000, 'story/probe/01.webp': 40_000, 'voice/probe/a.mp3': 30_000 }), undefined, undefined, undefined, { worlds: ['probe', 'sea'], first: 'fairy' });
    expect(r.problems).toEqual([]);
    expect(sizeSummary(r)).toBe('the core and the first world (fairy): 1.42 MB of the game and 0.12 MB of voice; the world probe: 0.29 MB of models and frames and 0.03 MB of voice; '
      + 'the world sea: 0.00 MB of models and frames and 0.00 MB of voice; 6 files; the heaviest: assets/index.js, 0.92 MB');
    const alone = checkDistSize(folder({ 'assets/index.js': 915_028, 'voice/intro.mp3': 120_000 }), undefined, undefined, undefined, { worlds: [] });
    expect(sizeSummary(alone)).toBe('the core and the first world: 0.92 MB of the game and 0.12 MB of voice; 2 files; the heaviest: assets/index.js, 0.92 MB');
    // a result of before the worlds, and one with nothing measured
    expect(sizeSummary({ total: 10_458_229, voice: 2_895_344, bank: 0, files: 573, heaviest: null, problems: [] })).toBe('the core and the first world: 10.46 MB of the game and 2.90 MB of voice; 573 files');
  });
});
