// Runs in `npm test`: the build's list of the next worlds (tools/vite-worlds.mjs, TECH-09) on prepared folders and a
// prepared bundle - which worlds a build has, what is left out of the service worker's list, which addresses its
// route takes, and worlds.json itself. The real builds are checked by `npm run e2e` (the step "worlds").
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { WORLDS_CACHE, WORLDS_LIST, buildWorlds, greyWorldFiles, listWorlds, publicWorldFiles, worldGlobs, worldList, worldRoute } from './vite-worlds.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
/** A folder with the given files: { 'models/ocean/a.glb': 'text', ... }. */
function folder(files) {
  const dir = mkdtempSync(join(tmpdir(), 'vite-worlds-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
const sha256 = (text) => createHash('sha256').update(text).digest('hex');
const bytes = (files) => Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.from(text) }));

describe('buildWorlds: the next worlds of a build', () => {
  const src = () => folder({ 'index.ts': "export const DEFAULT_WORLD = 'fairy';", 'fairy/index.ts': '', 'ocean/index.ts': '', 'probe/index.ts': '' });

  it('every world of the sources but the first one; the test world only in the mode named after it', () => {
    expect(buildWorlds('production', 'probe', src())).toEqual(['ocean']);
    expect(buildWorlds('development', 'probe', src())).toEqual(['ocean']);
    expect(buildWorlds('probe', 'probe', src())).toEqual(['ocean', 'probe']);
  });

  it('a world of the installation is no next world: its files are precached with the core', () => {
    const dir = src();
    writeFileSync(join(dir, 'index.ts'), "export const DEFAULT_WORLD = 'fairy';\nexport const INSTALLED: readonly string[] = [DEFAULT_WORLD, 'ocean'];\n");
    expect(buildWorlds('production', 'probe', dir)).toEqual([]);
    expect(buildWorlds('probe', 'probe', dir)).toEqual(['probe']);
  });

  it('the sources as they are: the hub is installed, so the published build has no next world, the probe build the probe world', () => {
    // the worlds of a mode as vite.config.ts names them (the grey forest, sea and Sweet Land have folders of their own too)
    const modes = { probe: 'probe', forest: 'grey', sea: 'grey', sweet: 'grey' };
    expect(buildWorlds('production', modes)).toEqual([]);
    expect(buildWorlds('probe', modes)).toEqual(['probe']);
  });

  it('a map of worlds and modes: each world of it only in its own mode (the grey forest, WORLD-12)', () => {
    const more = () => folder({ 'index.ts': "export const DEFAULT_WORLD = 'fairy';", 'fairy/index.ts': '', 'forest/index.ts': '', 'probe/index.ts': '' });
    const modes = { probe: 'probe', forest: 'grey', sea: 'grey', sweet: 'grey' };
    expect(buildWorlds('production', modes, more())).toEqual([]);
    expect(buildWorlds('grey', modes, more())).toEqual(['forest']);
    expect(buildWorlds('probe', modes, more())).toEqual(['probe']);
    // the sources as they are: the grey build has the forest, the sea and the Sweet Land, the published one nothing
    expect(buildWorlds('production', modes)).toEqual([]);
    expect(buildWorlds('grey', modes)).toEqual(['forest', 'sea', 'sweet']);
  });
});

describe('what the service worker leaves out and what its route takes', () => {
  it('worldGlobs: the three folders of every next world; nothing without next worlds', () => {
    expect(worldGlobs(['ocean', 'space'])).toEqual(['models/ocean/**', 'voice/ocean/**', 'story/ocean/**', 'models/space/**', 'voice/space/**', 'story/space/**']);
    expect(worldGlobs([])).toEqual([]);
  });

  it('worldRoute: no route without next worlds', () => {
    expect(worldRoute([])).toBeNull();
  });

  it('worldRoute: the files inside the folders of the next worlds, wherever the game is served from', () => {
    const route = worldRoute(['ocean', 'space']);
    for (const url of ['https://x.test/models/ocean/reef.glb', 'https://x.test/academy/voice/ocean/hi.mp3', 'http://127.0.0.1:4351/story/space/deep/1.webp']) {
      expect(route.test(url), url).toBe(true);
    }
    for (const url of [
      'https://x.test/models/fairy/tree.glb',        // the first world
      'https://x.test/models/ocean.glb',             // only named after a world
      'https://x.test/assets/ocean/chunk.js',        // not a folder of files
      'https://x.test/models/oceanic/reef.glb',      // another folder
      'https://x.test/bank/ocean/q.mp3',
      'https://x.test/models/ocean/',                // no file
    ]) expect(route.test(url), url).toBe(false);
  });

  it('worldRoute: an address with a query is not the route\'s - the download asks the network past it', () => {
    const route = worldRoute(['ocean']);
    expect(route.test('https://x.test/models/ocean/reef.glb?v=abc')).toBe(false);
    expect(route.test('https://x.test/models/ocean/reef.glb#x')).toBe(false);
  });

  it('worldRoute: an id is taken as text, not as a pattern', () => {
    const route = worldRoute(['a.b']);
    expect(route.test('https://x.test/models/a.b/x.glb')).toBe(true);
    expect(route.test('https://x.test/models/aXb/x.glb')).toBe(false);
  });
});

describe('listWorlds: worlds.json', () => {
  const FILES = {
    'models/ocean/reef.glb': 'reef', 'models/ocean/deep/fish.glb': 'a fish', 'voice/ocean/hi.mp3': 'hi', 'story/ocean/1.webp': 'frame',
    'models/space/s.glb': 'ship', 'models/fairy/tree.glb': 'tree', 'models/ocean.glb': 'not a folder', 'assets/ocean-AbCd.js': 'code',
    'bank/q.mp3': 'bank', 'index.html': 'page',
  };

  it('names the cache and, for every next world, its files with address, size and fingerprint, sorted by address', () => {
    const list = listWorlds(bytes(FILES), ['space', 'ocean']);
    expect(list.cache).toBe(WORLDS_CACHE);
    expect(Object.keys(list.worlds)).toEqual(['ocean', 'space']);
    expect(list.worlds.ocean.files).toEqual([
      { url: 'models/ocean/deep/fish.glb', size: 6, revision: sha256('a fish') },
      { url: 'models/ocean/reef.glb', size: 4, revision: sha256('reef') },
      { url: 'story/ocean/1.webp', size: 5, revision: sha256('frame') },
      { url: 'voice/ocean/hi.mp3', size: 2, revision: sha256('hi') },
    ]);
    expect(list.worlds.ocean.size).toBe(17);
    expect(list.worlds.space).toMatchObject({ size: 4, files: [{ url: 'models/space/s.glb', size: 4, revision: sha256('ship') }] });
  });

  it('the size is counted in bytes, not in characters', () => {
    expect(listWorlds(bytes({ 'voice/ocean/a.mp3': 'привіт' }), ['ocean']).worlds.ocean).toMatchObject({ size: 12, files: [{ size: 12 }] });
  });

  it('the fingerprint of a world changes with the bytes of any file and with the set of files, and with nothing else', () => {
    const of = (files, worlds = ['ocean']) => listWorlds(bytes(files), worlds).worlds.ocean.revision;
    const base = of(FILES);
    expect(base).toMatch(/^[0-9a-f]{64}$/);
    expect(of({ ...FILES, 'index.html': 'another page', 'models/space/s.glb': 'another ship' }, ['ocean', 'space'])).toBe(base);
    expect(of({ ...FILES, 'voice/ocean/hi.mp3': 'ho' })).not.toBe(base);
    expect(of({ ...FILES, 'voice/ocean/bye.mp3': 'bye' })).not.toBe(base);
    const { 'story/ocean/1.webp': _gone, ...less } = FILES;
    expect(of(less)).not.toBe(base);
  });

  it('a world without a file of its own is not listed; without next worlds the list is empty', () => {
    expect(listWorlds(bytes(FILES), ['ocean', 'plain']).worlds).not.toHaveProperty('plain');
    expect(listWorlds(bytes(FILES), [])).toEqual({ cache: WORLDS_CACHE, worlds: {} });
  });
});

describe('publicWorldFiles: the files of the next worlds under public/', () => {
  it('finds the files of the three folders of each world, deep ones too, and nothing else', () => {
    const dir = folder({
      'models/ocean/reef.glb': 'reef', 'models/ocean/deep/fish.glb': 'a fish', 'voice/ocean/hi.mp3': 'hi', 'story/ocean/1.webp': 'frame',
      'models/hero/hero.glb': 'hero', 'voice/play.mp3': 'play', 'bank/ocean/q.mp3': 'bank', 'ocean/x.txt': 'x',
    });
    const found = publicWorldFiles(dir, ['ocean', 'space']);
    expect(found.map((f) => f.path).sort()).toEqual(['models/ocean/deep/fish.glb', 'models/ocean/reef.glb', 'story/ocean/1.webp', 'voice/ocean/hi.mp3']);
    expect(found.find((f) => f.path === 'voice/ocean/hi.mp3').bytes.toString()).toBe('hi');
  });
});

describe('worldList: the plugin that writes worlds.json into the build', () => {
  /** Runs the plugin's hooks as the bundler does; returns what it emitted and its entry for the service worker's list. */
  function build(worlds, bundle, publicDir = '') {
    const plugin = worldList(worlds);
    const emitted = [];
    plugin.configResolved({ publicDir });
    plugin.generateBundle.call({ emitFile: (f) => emitted.push(f) }, {}, bundle);
    return { plugin, emitted, precache: (entries) => plugin.api.precache(entries) };
  }
  const asset = (fileName, source) => ({ type: 'asset', fileName, source });
  const chunk = (fileName) => ({ type: 'chunk', fileName, code: 'x' });

  it('is a plugin of the build only', () => {
    expect(worldList([])).toMatchObject({ name: 'world-list', apply: 'build' });
  });

  it('lists the files another plugin emitted and the ones under public/ together', () => {
    const pub = folder({ 'models/ocean/reef.glb': 'reef', 'models/hero/hero.glb': 'hero' });
    const bundle = {
      'story/ocean/1.webp': asset('story/ocean/1.webp', Buffer.from('frame')), 'voice/ocean/hi.mp3': asset('voice/ocean/hi.mp3', 'hi'),
      'assets/ocean-AbCd.js': chunk('assets/ocean-AbCd.js'), 'assets/index.css': asset('assets/index.css', 'css'),
    };
    const { emitted, precache } = build(['ocean'], bundle, pub);
    expect(emitted.length).toBe(1);
    expect(emitted[0]).toMatchObject({ type: 'asset', fileName: WORLDS_LIST });
    const list = JSON.parse(emitted[0].source);
    expect(list).toEqual(listWorlds(bytes({ 'models/ocean/reef.glb': 'reef', 'story/ocean/1.webp': 'frame', 'voice/ocean/hi.mp3': 'hi' }), ['ocean']));
    expect(list.worlds.ocean.files.map((f) => f.url)).toEqual(['models/ocean/reef.glb', 'story/ocean/1.webp', 'voice/ocean/hi.mp3']);
    // The list joins the service worker's own list: the game reads it without network.
    const md5 = createHash('md5').update(emitted[0].source).digest('hex');
    expect(precache([{ url: 'index.html', revision: '1', size: 4 }])).toEqual({
      manifest: [{ url: 'index.html', revision: '1', size: 4 }, { url: WORLDS_LIST, revision: md5, size: emitted[0].source.length }], warnings: [],
    });
  });

  it('a file emitted under the path of a static one wins, as in the build', () => {
    const pub = folder({ 'models/ocean/reef.glb': 'the static reef' });
    const { emitted } = build(['ocean'], { 'models/ocean/reef.glb': asset('models/ocean/reef.glb', 'the emitted reef') }, pub);
    expect(JSON.parse(emitted[0].source).worlds.ocean.files).toEqual([{ url: 'models/ocean/reef.glb', size: 16, revision: sha256('the emitted reef') }]);
  });

  it('without a file of a next world nothing is written and the service worker\'s list stays as it is', () => {
    const pub = folder({ 'models/hero/hero.glb': 'hero', 'models/ocean/reef.glb': 'reef' });
    const entries = [{ url: 'index.html', revision: '1', size: 4 }];
    for (const run of [build([], { 'a.js': chunk('a.js') }, pub), build(['space'], { 'a.js': chunk('a.js') }, pub), build(['ocean'], {}, '')]) {
      expect(run.emitted).toEqual([]);
      expect(run.precache(entries)).toEqual({ manifest: entries, warnings: [] });
    }
  });
});

describe('vite.config.ts uses all of it', () => {
  const config = readFileSync(join(root, 'vite.config.ts'), 'utf8');

  it('the next worlds are the ones of the sources, the probe world by the mode of the build, the forest in every build', () => {
    expect(config).toMatch(/const next = buildWorlds\(mode, \{ \[PROBE_MODE\]: PROBE_MODE, sea: GREY_MODE, sweet: GREY_MODE \}\);/);
    expect(config).toMatch(/^const GREY_MODE = 'grey';$/m);
  });

  it('a grey world takes its one file from where it lies: the sea swims with the probe world\'s clips, no second copy', () => {
    const files = /const GREY_FILES: Record<string, string> = (\{[^\n]*\});/.exec(config);
    expect(files, 'GREY_FILES in vite.config.ts').not.toBeNull();
    const map = JSON.parse(files[1].replace(/'/g, '"'));
    expect(map).toEqual({ 'models/sea/swim.glb': 'worlds-test/probe/models/probe/swim.glb' });
    for (const from of Object.values(map)) expect(existsSync(join(root, from)), from).toBe(true);
    expect(existsSync(join(root, 'public/models/sea')), 'the published build must not have the sea').toBe(false);
    // every build gets the files of worlds-data/ of its next worlds; GREY_FILES only the grey build
    expect(config).toMatch(/^ {6}worldFiles\(next, mode === GREY_MODE \? GREY_FILES : \{\}\),$/m);
    expect(config).toMatch(/greyWorldFiles\(next, extra, root\)/);
  });

  it('a next world\'s own files (worlds-data/<id>/) are in its builds at their paths: the forest\'s in every build, a grey world\'s in the grey one alone', () => {
    const modes = { probe: 'probe', sea: 'grey', sweet: 'grey' };
    const grey = greyWorldFiles(buildWorlds('grey', modes), {}, root);
    const forest = Object.keys(grey).filter((p) => p.startsWith('models/forest/'));
    // every file of worlds-data/forest, at the path the game asks for (models/forest/…), from where it lies
    expect(forest.length, 'the forest has its own models in worlds-data/forest').toBeGreaterThan(0);
    expect(forest).toContain('models/forest/borovik.glb');
    expect(grey['models/forest/borovik.glb']).toBe('worlds-data/forest/models/forest/borovik.glb');
    for (const from of Object.values(grey)) expect(existsSync(join(root, from)), from).toBe(true);
    // the published build (and the probe one) has the forest (published 2026-11-24), no grey world: none of its files
    for (const mode of ['production', 'probe']) {
      const files = Object.keys(greyWorldFiles(buildWorlds(mode, modes), {}, root));
      expect(files, mode).toEqual(Object.keys(grey).filter((p) => /^(models|voice|story)\/forest\//.test(p)));
      expect(files.filter((p) => /^(models|voice|story)\/(sea|sweet)\//.test(p)), mode).toEqual([]);
    }
    // a next world's files stay in worlds-data/, never under public/ (copied whole into every build, precached)
    expect(existsSync(join(root, 'public/models/forest')), 'the forest\'s files lie in worlds-data/forest').toBe(false);
  });

  it('their folders are left out of the service worker\'s list, next to the bank', () => {
    expect(config).toMatch(/globIgnores: \['bank\/\*\*', \.\.\.worldGlobs\(next\)\]/);
  });

  it('the list is written after the plugin that emits the probe world\'s files, and joins the service worker\'s list', () => {
    expect(config).toMatch(/const list = worldList\(next\);/);
    expect(config.indexOf('[probeFiles()]')).toBeGreaterThan(0);
    expect(config.indexOf('\n      list,\n')).toBeGreaterThan(config.indexOf('[probeFiles()]'));
    expect(config.indexOf('VitePWA(')).toBeGreaterThan(config.indexOf('\n      list,\n'));
    expect(config).toMatch(/manifestTransforms: \[list\.api\.precache\]/);
  });

  it('the files of the next worlds have a route of their own into the cache the list names; the bank keeps its own', () => {
    expect(config).toMatch(/const route = worldRoute\(next\);/);
    expect(config).toMatch(/urlPattern: route, handler: 'CacheFirst' as const,\s+options: \{ cacheName: WORLDS_CACHE, cacheableResponse: \{ statuses: \[200\] \}, rangeRequests: true \}/);
    expect(config).toMatch(/urlPattern: \/\\\/bank\\\/\[\^\/\]\+\\\.mp3\$\/, handler: 'CacheFirst',\s+options: \{ cacheName: 'bank',/);
  });

  it('the update of the game stays as it was (TECH-13)', () => {
    expect(config).toMatch(/registerType: 'prompt'/);
    expect(config).toMatch(/clientsClaim: true, skipWaiting: false,/);
  });
});
