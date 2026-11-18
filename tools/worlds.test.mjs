// Runs in `npm test`: the checks of tools/worlds.mjs (the step "worlds" of npm run e2e) on prepared folders - the
// published build must hold nothing of the probe world (TECH-15), the probe build must hold all of it. The real
// builds are checked, and the probe world played, by `npm run e2e`.
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import {
  PARTS, PROBE, PROBE_DIST, PROBE_FILES, WALKS, askedOfWorld, askedWithoutNetwork, buildCommit, closedProblems, irisProblems, layerCallsProblems, layerDifference, listProblems, notAskedByPage, notDownloaded,
  probeBuildProblems, probeFiles, probeLeft, publishedProblems, readArgs, readList, ringPixels, travelFramesProblems, walkEnv,
} from './worlds.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dirs = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
/** A folder with the given files: { 'assets/a.js': 'text', ... }. */
function folder(files) {
  const dir = mkdtempSync(join(tmpdir(), 'worlds-'));
  dirs.push(dir);
  for (const [path, text] of Object.entries(files)) {
    mkdirSync(join(dir, path, '..'), { recursive: true });
    writeFileSync(join(dir, path), text);
  }
  return dir;
}
// A published build as the bundler leaves it. Three.js has a property named like the world (light probes): not a mark.
const VERSION = '<span id="pCommit">abc1234</span>';
const CLEAN = {
  'index.html': '<!doctype html><script src="./assets/index-AbCd.js"></script>',
  'assets/index-AbCd.js': `const s={probe:[],lightProbe:1};s.probe.push(0);r.probe[e].set(0);const w=[{id:"fairy"}];x.innerHTML=\`${VERSION}\`;`,
  'models/nature_pack/TreeStump_Moss.glb': 'glb',
  'sw.js': 'precache([{url:"models/nature_pack/TreeStump_Moss.glb"}])',
};
// What the probe world adds to a build: its files, its chunk, the list of the service worker.
const WORLD = { 'models/probe/stump.glb': 'the model', 'story/probe/sign.webp': 'the picture' };
const WITH_WORLD = {
  ...CLEAN, ...WORLD,
  'assets/probe-XyZ1.js': 'const p={id:`probe`,strings:{probe_part:"x"}};load("probe/stump");img(`story/probe/sign.webp`);',
  'sw.js': 'precache([{url:"models/probe/stump.glb"},{url:"story/probe/sign.webp"}])',
};

describe('the published build holds nothing of the probe world (TECH-15)', () => {
  it('a build without the world is clean: a property of that name in the code is not the world', () => {
    expect(probeLeft(folder(CLEAN))).toEqual({ files: [], code: [] });
    expect(publishedProblems(folder(CLEAN))).toEqual([]);
  });

  it.each([
    ['its model', 'models/probe/stump.glb'], ['its picture', 'story/probe/sign.webp'], ['its chunk', 'assets/probe-XyZ1.js'],
    ['its voice folder', 'voice/probe/line.mp3'],
  ])('finds %s among the files', (_, path) => {
    const dir = folder({ ...CLEAN, [path]: 'x' });
    expect(probeLeft(dir).files).toEqual([path]);
    expect(publishedProblems(dir)).toEqual([`the published build holds a file of the probe world: ${path}`]);
  });

  it.each([
    ['its id', 'const w=[{id:"fairy"},{id:"probe"}];', '"probe" x1'],
    ['its id in a template', 'const w={id:`probe`};', '`probe` x1'],
    ['a key of its strings', 'const t={probe_part:"x",probe_count:"y"};', 'probe_p x1, probe_c x1'],
    ['the path of its model', 'load("probe/stump");', 'probe/ x1'],
    ['the path of its picture', 'img("story/probe/sign.webp");', '/probe x1'],
  ])('finds %s in the code', (_, code, marks) => {
    const dir = folder({ ...CLEAN, 'assets/index-AbCd.js': CLEAN['assets/index-AbCd.js'] + code });
    expect(probeLeft(dir)).toEqual({ files: [], code: [`assets/index-AbCd.js: ${marks}`] });
    expect(publishedProblems(dir)).toEqual([`the published build holds the probe world in its code: assets/index-AbCd.js: ${marks}`]);
  });

  it('finds the world in the list of the service worker and in a page, not only in the scripts', () => {
    expect(probeLeft(folder({ ...CLEAN, 'sw.js': WITH_WORLD['sw.js'] })).code).toEqual(['sw.js: /probe x2']);
    expect(probeLeft(folder({ ...CLEAN, 'index.html': '<link rel="preload" href="./models/probe/stump.glb">' })).code).toEqual(['index.html: /probe x1']);
  });

  it('a whole probe build is not a published one: every file and every mark of it is listed', () => {
    const p = publishedProblems(folder(WITH_WORLD));
    expect(p.filter((x) => x.includes('a file of the probe world'))).toHaveLength(3);
    expect(p.filter((x) => x.includes('in its code')).map((x) => x.split(': ')[1])).toEqual(['assets/probe-XyZ1.js', 'sw.js']);
  });
});

describe('the probe build holds the whole probe world (TECH-09, TECH-15)', () => {
  const files = Object.keys(WORLD).sort();
  const from = () => folder({ ...WORLD, 'README.md': 'where the files come from' });

  it('lists the files of the world without its README', () => {
    expect(probeFiles(from())).toEqual(files);
  });

  it('is right when every file is there as it is, the world is in the code and the commit is the one of the sources', () => {
    expect(probeBuildProblems(folder(WITH_WORLD), from(), files, 'abc1234')).toEqual([]);
  });

  it('a file of the world missing from the build, or changed on the way, is a problem', () => {
    const { 'story/probe/sign.webp': _, ...rest } = WITH_WORLD;
    expect(probeBuildProblems(folder(rest), from(), files, 'abc1234')).toEqual([`the probe build has no story/probe/sign.webp (${PROBE_FILES}/story/probe/sign.webp)`]);
    expect(probeBuildProblems(folder({ ...WITH_WORLD, 'models/probe/stump.glb': 'another model' }), from(), files, 'abc1234'))
      .toEqual([`models/probe/stump.glb of the probe build is not ${PROBE_FILES}/models/probe/stump.glb`]);
  });

  it('a world without files of its own, or with a file outside a folder of its world, is a problem', () => {
    expect(probeBuildProblems(folder(WITH_WORLD), from(), [], 'abc1234')).toEqual([`${PROBE_FILES}/ has no files: the probe world has nothing of its own to load`]);
    const stray = folder({ ...WORLD, 'models/stump.glb': 'x' });
    expect(probeBuildProblems(folder({ ...WITH_WORLD, 'models/stump.glb': 'x' }), stray, [...files, 'models/stump.glb'], 'abc1234'))
      .toEqual([`${PROBE_FILES}/models/stump.glb is not in a folder of its world (…/probe/…)`]);
  });

  it('a build whose registry did not list the world is a problem, even with its files in place', () => {
    const p = probeBuildProblems(folder({ ...CLEAN, ...WORLD }), from(), files, 'abc1234');
    expect(p).toHaveLength(1);
    expect(p[0]).toMatch(/does not hold the probe world in its code/);
  });

  it('a build of another commit, or one that shows no commit, is a problem', () => {
    expect(probeBuildProblems(folder(WITH_WORLD), from(), files, 'def5678'))
      .toEqual(['version: the probe build shows commit "abc1234", but the sources are at "def5678" (git rev-parse --short HEAD)']);
    const none = { ...WITH_WORLD, 'assets/index-AbCd.js': 'const w=[];' };
    expect(probeBuildProblems(folder(none), from(), files, 'abc1234')[0]).toMatch(/shows commit "null"/);
  });

  it('reads the commit the parents\' section shows, folded into the text or left as a placeholder', () => {
    expect(buildCommit(folder(CLEAN))).toBe('abc1234');
    expect(buildCommit(folder({ 'a.js': 'x.innerHTML=`<span id="pCommit">${"no-git"}</span>`' }))).toBe('no-git');
    expect(buildCommit(folder({ 'a.js': 'nothing' }))).toBe(null);
  });
});

describe('the page itself asks for the files of the probe world', () => {
  const files = ['models/probe/stump.glb', 'story/probe/sign.webp'];
  const page = 'http://127.0.0.1:4361/?debug&world=probe', worker = 'http://127.0.0.1:4361/sw.js';

  it('every file asked for by the page: nothing is missed', () => {
    expect(notAskedByPage(files, [{ path: '/models/probe/stump.glb', referer: page }, { path: '/story/probe/sign.webp', referer: page }])).toEqual([]);
  });

  it('a file only the service worker fetched for its cache was not loaded by the world', () => {
    expect(notAskedByPage(files, [{ path: '/models/probe/stump.glb', referer: page }, { path: '/story/probe/sign.webp', referer: worker }])).toEqual(['story/probe/sign.webp']);
  });

  it('a file nobody asked for, or asked for by nobody known, is missed', () => {
    expect(notAskedByPage(files, [])).toEqual(files);
    expect(notAskedByPage(files, [{ path: '/models/probe/stump.glb', referer: '' }, { path: '/story/probe/sign.webp', referer: 'not a url' }])).toEqual(files);
  });

  it('a file only the download in the background asked for (by its fingerprint) was not loaded by the world', () => {
    const asked = [{ path: '/models/probe/stump.glb', referer: page, search: '' }, { path: '/story/probe/sign.webp', referer: page, search: '?v=2115f5' }];
    expect(notAskedByPage(files, asked)).toEqual(['story/probe/sign.webp']);
    expect(notAskedByPage(files, [...asked, { path: '/story/probe/sign.webp', referer: page, search: '' }])).toEqual([]);
  });
});

describe('the cache of the next world: what the server was asked for (TECH-09)', () => {
  const page = 'http://127.0.0.1:4361/?debug', worker = 'http://127.0.0.1:4361/sw.js';

  it('askedOfWorld: the requests for a file inside a folder of the world, by the page or the service worker, with or without a query', () => {
    const own = [
      { path: '/models/probe/stump.glb', referer: page, search: '' }, { path: '/story/probe/sign.webp', referer: worker, search: '' },
      { path: '/voice/probe/hi.mp3', referer: page, search: '?v=1' },
    ];
    const other = [
      { path: '/assets/probe-AbCd.js', referer: page, search: '' },      // the code of the world: every world's code is loaded with the registry
      { path: '/models/probe.glb', referer: page, search: '' }, { path: '/models/hero/hero.glb', referer: page, search: '' },
      { path: '/worlds.json', referer: page, search: '' }, { path: '/index.html', referer: '', search: '?debug&world=probe' },
    ];
    expect(askedOfWorld([...other, ...own], PROBE)).toEqual(own);
    expect(askedOfWorld(other, PROBE)).toEqual([]);
    expect(askedOfWorld(own, 'ocean')).toEqual([]);
  });

  it('askedWithoutNetwork: the browser\'s check for a new service worker is not a request of the game; everything else is', () => {
    const origin = 'http://127.0.0.1:4183', sw = `${origin}/sw.js`, page = `${origin}/?debug&world=probe`;
    // What the CI runner showed with the network switched off (CI 44055935550): the worker's script and the script it imports.
    const check = [{ path: '/sw.js', referer: sw, search: '' }, { path: '/workbox-0ab24316.js', referer: sw, search: '' }, { path: '/sw.js', referer: '', search: '' }];
    expect(askedWithoutNetwork(check)).toEqual([]);
    expect(askedWithoutNetwork([])).toEqual([]);
    const leaks = [
      { path: '/models/probe/stump.glb', referer: sw, search: '' },        // the worker's route went to the network for a file of the world
      { path: '/models/probe/stump.glb', referer: page, search: '' },      // the page reached the server
      { path: '/worlds.json', referer: sw, search: '' },                   // the list, asked by the worker
      { path: '/assets/index-abc123.js', referer: sw, search: '' },        // a script of the game, asked by the worker
      { path: '/workbox-0ab24316.js', referer: page, search: '' },         // the worker's library, but asked by the page
      { path: '/workbox-0ab24316.js', referer: '', search: '' },           // ... or by nobody known
      { path: '/models/workbox-0ab24316.js', referer: sw, search: '' },    // not at the root
      { path: '/index.html', referer: '', search: '' },
    ];
    expect(askedWithoutNetwork(leaks)).toEqual(leaks);
    expect(askedWithoutNetwork([...check, ...leaks])).toEqual(leaks);
  });

  it('the scenario "offline" counts what the server was asked for through askedWithoutNetwork, and fails on anything left', () => {
    const src = readFileSync(new URL('./worlds.mjs', import.meta.url), 'utf8');
    expect(src).toContain('const leaked = askedWithoutNetwork(asked.slice(off));');
    expect(src).toMatch(/if \(leaked\.length\) fail\(`offline: the server was asked for \$\{leaked\.length\} file\(s\) with the network switched off/);
  });

  it('notDownloaded: the files of the list never asked for by their fingerprint', () => {
    const listed = [{ url: 'models/probe/stump.glb', size: 1, revision: 'aa' }, { url: 'story/probe/sign.webp', size: 1, revision: 'bb' }];
    const asked = [{ path: '/models/probe/stump.glb', referer: page, search: '?v=aa' }, { path: '/story/probe/sign.webp', referer: page, search: '?v=bb' }];
    expect(notDownloaded(listed, asked)).toEqual([]);
    // Asked for plainly (the world loading its file), by another fingerprint, or not at all: not the download of this list.
    expect(notDownloaded(listed, [asked[0], { path: '/story/probe/sign.webp', referer: page, search: '' }])).toEqual(['story/probe/sign.webp']);
    expect(notDownloaded(listed, [asked[0], { path: '/story/probe/sign.webp', referer: page, search: '?v=aa' }])).toEqual(['story/probe/sign.webp']);
    expect(notDownloaded(listed, [])).toEqual(['models/probe/stump.glb', 'story/probe/sign.webp']);
  });
});

describe('the probe build lists the world for the game (worlds.json, TECH-09)', () => {
  const FILES = { 'models/probe/stump.glb': 'a stump', 'story/probe/sign.webp': 'a sign' };
  const files = Object.keys(FILES);
  const sha256 = (text) => createHash('sha256').update(text).digest('hex');
  const listOf = (entries) => JSON.stringify({ cache: 'worlds', worlds: { probe: { revision: 'r', size: 0, files: entries.map(([url, text]) => ({ url, size: text.length, revision: sha256(text) })) } } });
  const SW = 'define(["./workbox-1"],(function(e){e.precacheAndRoute([{url:"index.html",revision:"1"},{url:"worlds.json",revision:"2"}],{}),'
    + 'e.registerRoute(/\\/(?:models|voice|story)\\/(?:probe)\\/[^?#]+$/,new e.CacheFirst({cacheName:"worlds",plugins:[]}),"GET")}));';
  const build = (more = {}) => folder({ ...FILES, 'worlds.json': listOf(Object.entries(FILES)), 'sw.js': SW, ...more });

  it('a build that lists every file with its size and fingerprint, precaches the list and has the route: no problems', () => {
    expect(listProblems(build(), PROBE, files)).toEqual([]);
    expect(readList(build()).worlds.probe.files.map((f) => f.url)).toEqual(files);
  });

  it('no list, or a list that is not JSON', () => {
    const { 'worlds.json': _list, ...rest } = { ...FILES, 'worlds.json': '', 'sw.js': SW };
    expect(readList(folder(rest))).toBeNull();
    expect(listProblems(folder(rest), PROBE, files)).toEqual(['the build has no worlds.json to read: the game cannot tell which files the world "probe" has']);
    expect(listProblems(build({ 'worlds.json': '<!doctype html>' }), PROBE, files).join()).toContain('has no worlds.json to read');
  });

  it('a list without the world', () => {
    expect(listProblems(build({ 'worlds.json': '{"cache":"worlds","worlds":{}}' }), PROBE, files)).toEqual(['worlds.json does not list the world "probe"']);
    expect(listProblems(build(), 'ocean', files)).toEqual(['worlds.json does not list the world "ocean"']);
  });

  it('a file of the world the list misses, and a listed one that is not the world\'s', () => {
    const missed = listProblems(build({ 'worlds.json': listOf([['models/probe/stump.glb', 'a stump']]) }), PROBE, files);
    expect(missed).toEqual(['worlds.json does not list story/probe/sign.webp of the world "probe"']);
    const extra = listProblems(build({ 'models/probe/extra.glb': 'x', 'worlds.json': listOf([...Object.entries(FILES), ['models/probe/extra.glb', 'x']]) }), PROBE, files);
    expect(extra).toEqual(['worlds.json lists models/probe/extra.glb, which is not a file of the world "probe"']);
  });

  it('a listed file the build does not have', () => {
    const { 'story/probe/sign.webp': _gone, ...rest } = { ...FILES, 'worlds.json': listOf(Object.entries(FILES)), 'sw.js': SW };
    expect(listProblems(folder(rest), PROBE, files)).toEqual(['worlds.json lists story/probe/sign.webp, but the build has no such file']);
  });

  it('a size or a fingerprint that is not the file\'s', () => {
    const wrong = listProblems(build({ 'models/probe/stump.glb': 'another stump' }), PROBE, files);
    expect(wrong).toEqual([
      'worlds.json: models/probe/stump.glb is 13 bytes, the list says 7',
      'worlds.json: the fingerprint of models/probe/stump.glb is not the SHA-256 of the file in the build',
    ]);
    // The same size, other bytes: only the fingerprint tells.
    expect(listProblems(build({ 'story/probe/sign.webp': 'a SIGN' }), PROBE, files)).toEqual(['worlds.json: the fingerprint of story/probe/sign.webp is not the SHA-256 of the file in the build']);
  });

  it('a service worker that does not precache the list, or has no route into the cache the list names', () => {
    const noList = SW.replace(',{url:"worlds.json",revision:"2"}', '');
    expect(listProblems(build({ 'sw.js': noList }), PROBE, files)).toEqual(['sw.js does not precache worlds.json: the game could not read the list without network']);
    expect(listProblems(build({ 'sw.js': SW.replace('cacheName:"worlds"', 'cacheName:"bank"') }), PROBE, files)).toEqual(['sw.js has no route into the cache "worlds" that worlds.json names']);
    const { 'sw.js': _sw, ...rest } = { ...FILES, 'worlds.json': listOf(Object.entries(FILES)), 'sw.js': SW };
    expect(listProblems(folder(rest), PROBE, files).length).toBe(2);
  });
});

describe('the probe world in the sources', () => {
  it('its files lie outside public/, in folders of their world, with a note where they come from', () => {
    const files = probeFiles();
    expect(files).toEqual(['models/probe/stump.glb', 'story/probe/sign.webp']);
    expect(existsSync(join(root, PROBE_FILES, 'README.md'))).toBe(true);
    for (const f of files) expect(existsSync(join(root, 'public', f)), `public/${f}`).toBe(false);
    expect(existsSync(join(root, 'public/models', PROBE))).toBe(false);
  });

  it('the world asks for exactly these files, and git ignores the folder of its build', () => {
    const src = readFileSync(join(root, 'src/worlds/probe/index.ts'), 'utf8');
    expect(src).toContain("model: 'probe/stump'");            // src/core/assets.ts: models/<path>.glb
    expect(src).toContain("picture: 'story/probe/sign.webp'");
    expect(readFileSync(join(root, '.gitignore'), 'utf8').split('\n')).toContain(PROBE_DIST);
  });

  it('vite.config.ts gives the build the files of the world only in the mode of the probe build', () => {
    const cfg = readFileSync(join(root, 'vite.config.ts'), 'utf8');
    expect(cfg).toContain(`const PROBE_MODE = '${PROBE}';`);
    expect(cfg).toContain(`const PROBE_FILES = '${PROBE_FILES}';`);
    expect(cfg).toContain('...(mode === PROBE_MODE ? [probeFiles()] : []),');
  });
});

describe('the pictures of the transition (TECH-15)', () => {
  /** A picture w x h, as the step reads a screenshot: `paint(x, y)` gives the colour of a pixel. */
  const picture = (w, h, paint) => {
    const data = Buffer.alloc(w * h * 4, 255);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) data.set(paint(x, y), (y * w + x) * 4);
    return { data, width: w, height: h };
  };
  const layer = (y, h) => [184 + Math.round(35 * y / h), 199 - Math.round(5 * y / h), 250];   // blue at the top, lilac at the bottom
  const scene = (x, y) => [90 + (x * 7 + y * 3) % 60, 170, 80];
  const closed = (w, h) => picture(w, h, (x, y) => layer(y, h));
  /** The layer with a hole: half-axes rx and ry around cx, cy. */
  const iris = (w, h, rx, ry = rx, cx = w / 2, cy = h / 2) => picture(w, h, (x, y) => (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 < 1 ? scene(x, y) : layer(y, h)));
  const W = 422, H = 195;

  it('the closed frame: one calm colour from side to side', () => {
    expect(closedProblems(closed(W, H))).toEqual([]);
    expect(closedProblems(closed(H, W))).toEqual([]);
    expect(closedProblems(picture(W, H, scene))[0]).toMatch(/the closed frame is not one colour across the row 6: .* the layer does not cover the frame/);
    expect(closedProblems(picture(W, H, () => [10, 10, 30]))[0]).toMatch(/the closed frame is dark in the row 6: 10,10,30/);
    // covered on the left only: the layer stops half-way
    expect(closedProblems(picture(W, H, (x, y) => (x < W / 2 ? layer(y, H) : scene(x, y)))).length).toBe(5);
  });

  it('the middle of the closing: a round hole around the middle, on a screen lying and upright', () => {
    expect(irisProblems(iris(W, H, 120), closed(W, H))).toEqual([]);
    expect(irisProblems(iris(H, W, 120), closed(H, W))).toEqual([]);
    expect(irisProblems(iris(W, H, 90), closed(W, H))).toEqual([]);
  });

  it('the middle of the closing: what is not a layer with a round hole in the middle is a problem', () => {
    const one = (mid, back = closed(W, H)) => irisProblems(mid, back).join(' | ');
    expect(one(picture(W, H, scene))).toMatch(/the corner 2,2 is not covered by the layer: .* the corner 419,192 is not covered/);   // no layer at all
    expect(one(closed(W, H))).toMatch(/^the middle of the frame is covered \(\d+,\d+,250\): the iris has no hole$/);            // closed too early
    expect(one(iris(W, H, 120, 200))).toMatch(/^the hole is not a circle: 120 px from the middle to its edge, and .* px at 68 px aside, where a circle has 98\.9 px$/);
    expect(one(iris(W, H, 200, 92))).toMatch(/the hole is not a circle/);                                                          // stretched along the screen
    expect(one(iris(H, W, 92, 200), closed(H, W))).toMatch(/the hole is not a circle/);
    expect(one(iris(W, H, 100, 100, W / 2 + 40))).toMatch(/^the hole is not around the middle: 1\d\d px to one side, \d\d px to the other/);
    expect(one(iris(W, H, 400, 80))).toBe('the hole of the iris has no edge inside the frame along its longer side');
    expect(one(iris(W, H, 120), closed(H, W))).toBe('the pictures are not of one size: 422x195 and 195x422');
    // a frame wiped by the layer: the hole is there and round, but nothing of the world is in it
    const wiped = picture(W, H, (x, y) => ((x - W / 2) ** 2 + (y - H / 2) ** 2 < 120 ** 2 ? [0, 0, 0] : layer(y, H)));
    expect(one(wiped)).toBe('the hole is one flat colour (0,0,0): the layer is drawn instead of the frame, not over it');
  });

  it('the cost of the layer: one draw call in a frame between two frames of one count', () => {
    expect(layerCallsProblems([283, 284, 283, 284, 283, 284, 283, 284, 283])).toEqual([]);
    expect(layerCallsProblems([283, 284, 283, 283, 282, 283, 282, 283, 282])).toEqual([]);            // the world dropped a call on the way
    expect(layerCallsProblems([283, 283, 283, 283, 283])[0]).toMatch(/^the layer costs 0 draw call\(s\) a frame, it must cost exactly one and none outside a transition \(.*: 283, 283, 283, 283, 283\)$/);
    expect(layerCallsProblems([283, 285, 283, 284, 283])[0]).toMatch(/^the layer costs 2 and 1 draw call/);
    expect(layerCallsProblems([283, 284, 282, 283, 281])[0]).toMatch(/^the count of draw calls never stood still around a frame with the layer \(283, 284, 282, 283, 281\)/);
  });

  it('the ring: only its filled part is counted, not the layer, the track or the star', () => {
    const quiet = [[205, 196, 250], [236, 226, 251], [255, 235, 158], [255, 255, 255], [90, 170, 80]];
    const filled = [[255, 155, 208], [209, 131, 232], [165, 107, 255]];
    expect(ringPixels(picture(10, 5, (x) => quiet[x % quiet.length]))).toBe(0);
    expect(ringPixels(picture(10, 6, (x, y) => (y < 3 ? filled[y] : quiet[x % quiet.length])))).toBe(30);
  });

  it('two closed frames: the same colours whatever the size of the picture, a shifted colour is seen', () => {
    expect(layerDifference(closed(W, H), closed(W, H))).toBe(0);
    expect(layerDifference(closed(W, H), closed(W * 2, H * 2))).toBeLessThanOrEqual(1);
    expect(layerDifference(closed(W, H), picture(W, H, (x, y) => layer(y, H).map((v, i) => (i === 1 ? v - 12 : v))))).toBe(12);
    // a glow near the ring only is not looked at; a glow that reaches the edge is
    expect(layerDifference(closed(W, H), picture(W, H, (x, y) => (x > W * 0.9 ? [255, 255, 255] : layer(y, H))))).toBeGreaterThan(30);
  });
});

describe('the frames of a change of world (TECH-15)', () => {
  const frame = (o) => ({ phase: 'hold', closed: false, world: 'fairy', busy: true, going: true, speaking: false, line: null, music: null, shown: [], ...o });
  /** A change as it must go: the world left while the frame closes, silence behind the closed frame, the new world as it opens. */
  const good = (to = 'probe') => [
    frame({ phase: 'closing', speaking: true, line: 'unicorn_hi', music: 261.6 }),
    frame({ phase: 'closing', speaking: true, line: 'unicorn_hi', music: 261.6 }),
    frame({ closed: true }), frame({ closed: true }), frame({ closed: true, world: to }), frame({ closed: true, world: to }),
    frame({ phase: 'opening', world: to, music: 293.7, shown: ['hud', 'joy'] }),
    frame({ phase: 'opening', world: to, music: 293.7, shown: ['hud', 'joy'] }),
  ];
  const change = (at, o) => good().map((f, i) => (i === at ? { ...f, ...o } : f));

  it('a change that went as it must has no problem - to the world asked for, or back to the world left when the load failed', () => {
    expect(travelFramesProblems(good(), 'fairy', 'probe')).toEqual([]);
    expect(travelFramesProblems(good('fairy'), 'fairy', 'fairy')).toEqual([]);
  });

  it('the frame never closed: nothing else is read', () => {
    expect(travelFramesProblems(good().map((f) => ({ ...f, closed: false })), 'fairy', 'probe')).toEqual([
      'the frame was never closed in 8 frame(s) of the change: the world changed in sight, or did not change',
    ]);
    expect(travelFramesProblems([], 'fairy', 'probe')[0]).toMatch(/^the frame was never closed in 0 frame/);
  });

  it.each([
    ['a line that still sounds', { speaking: true }, /^a line still sounds behind the closed frame \(in 1 frame\(s\), the first: \{/],
    ['a line left in the bubble', { line: 'unicorn_hi' }, /^the bubble still holds a line behind the closed frame/],
    ['the music of the world left', { music: 261.6 }, /^music plays behind the closed frame/],
    ['a counter over the closed frame', { shown: ['hud'] }, /^the interface is on the screen over the closed frame/],
    ['the controls given back too early', { busy: false }, /^the controls are free during the change/],
  ])('behind the closed frame: %s is a problem', (_what, o, said) => {
    const got = travelFramesProblems(change(3, o), 'fairy', 'probe');
    expect(got).toHaveLength(1);
    expect(got[0]).toMatch(said);
  });

  it('the same before the frame has closed is not: the line and the music of the world left sound until then', () => {
    expect(travelFramesProblems(change(0, { speaking: true, line: 'unicorn_hi', music: 261.6, shown: ['bubble'] }), 'fairy', 'probe')).toEqual([]);
  });

  it('the world changes only behind the closed frame', () => {
    expect(travelFramesProblems(change(1, { world: 'probe' }), 'fairy', 'probe')[0]).toMatch(/^the world played is not "fairy" before the frame has closed/);
    expect(travelFramesProblems(change(6, { world: 'fairy' }), 'fairy', 'probe')[0]).toMatch(/^the world played is not "probe" once the frame opens/);
    // a change that had to fail and did not: the game is in the world asked for
    expect(travelFramesProblems(good(), 'fairy', 'fairy')[0]).toMatch(/^the world played is not "fairy" once the frame opens \(in 2 frame/);
  });

  it('the frame closes once and then opens', () => {
    expect(travelFramesProblems(change(3, { closed: false }), 'fairy', 'probe')).toEqual([expect.stringMatching(/^the frame opened and closed again during one change/)]);
    expect(travelFramesProblems(good().slice(0, 6), 'fairy', 'probe')).toEqual(['the frame did not open after it had closed: no frame of the opening was drawn']);
  });
});

describe('the walkthroughs of the part "walk": the probe world by its description (ARCH-16)', () => {
  const src = readFileSync(join(root, 'tools/worlds.mjs'), 'utf8');

  it('two sizes: the phone with the network, the computer without it', () => {
    expect(WALKS).toEqual([{ size: 'mobile', offline: false, level: '3' }, { size: 'desktop', offline: true, level: '' }]);
  });

  it('the environment of a walkthrough: the probe world, one item of every kind needed, the network as the size says, a report of the pass', () => {
    const o = { commit: 'abc1234', voiceOut: 'v.json', modelsOut: 'm.json', passOut: 'p.json' };
    const phone = walkEnv({ PATH: '/bin', E2E_GL: 'swiftshader', E2E_ONLY: 'shop', E2E_OFFLINE: '1', E2E_MUTE: '1' }, WALKS[0], o);
    expect(phone).toEqual({
      PATH: '/bin', E2E_GL: 'swiftshader', E2E_WORLD: PROBE, E2E_WORLD_NEED: 'one', E2E_WORLD_OUT: 'p.json', E2E_ONLY: '', E2E_OFFLINE: '0', E2E_MUTE: '0',
      E2E_COMMIT: 'abc1234', E2E_VOICE_OUT: 'v.json', E2E_MODELS_OUT: 'm.json', E2E_LEVEL: '3',
    });
    const desk = walkEnv({ E2E_OFFLINE: '0' }, WALKS[1], o);
    expect(desk.E2E_OFFLINE).toBe('1');
    expect(desk.E2E_LEVEL, 'the computer plays the adaptive level, as in the first world').toBe('');
    // E2E_LEVEL of the caller sets one level for both
    expect(WALKS.map((w) => walkEnv({ E2E_LEVEL: '5' }, w, o).E2E_LEVEL)).toEqual(['5', '5']);
  });

  it('the part "walk" plays tools/shot.mjs once for each of them and reads the report of each pass', () => {
    const walk = src.slice(src.indexOf("if (play('walk')) try {"), src.indexOf('// ---- 5. the cache of the next world ----'));
    expect(walk).toMatch(/^if \(play\('walk'\)\) try \{\n {4}for \(const walk of WALKS\) \{\n/);
    expect(walk).toContain("const env = walkEnv(process.env, walk, { commit, voiceOut, passOut, modelsOut: ");
    expect(walk).toContain("await run(process.execPath, [join(root, 'tools/shot.mjs'), url, shots, walk.size], runTimeoutMs, env);");
    expect(walk).toContain('const wrong = reportProblems(pass, { world: PROBE, size: walk.size, offline: walk.offline, kinds: ITEM_KINDS });');
    expect(walk).toContain('for (const p of wrong) fail(`${name}: ${p}`);');
    // the page asked for the files of the world in this very run, not in the one before it
    expect(walk).toContain('const from = asked.length, t0 = Date.now();');
    expect(walk).toContain('const mine = asked.slice(from);');
    expect(walk).toContain('const missed = notAskedByPage(files, mine);');
  });

  it('the description is played by the shared walkthrough alone: no scenario of its own is left here', () => {
    expect(src).not.toContain('describedScenario');
    expect(src).not.toContain('export function nextItem');
    expect(src).toContain("import { ITEM_KINDS, reportProblems } from './world-pass.mjs';");
    expect(src.split("join(root, 'tools/shot.mjs')")).toHaveLength(2);
  });

  it('the change of world reads the description of the world played', () => {
    const travel = src.slice(src.indexOf('async function travelScenarios('), src.indexOf('async function transitionScenarios('));
    expect(travel).toContain("described: Array.isArray(__game.items)");
    expect(travel).toContain('if (home.described !== null) fail(');
    expect(travel).toContain("for (const k of ['npcs', 'names', 'described', ");
    expect(travel).toMatch(/if \(!same\(kinds, \[\.\.\.ITEM_KINDS\]\.sort\(\)\) \|\| !away\.described\.includes\('chain friend'\)\) fail\(/);
  });
});

describe('node tools/worlds.mjs', () => {
  const run =(...args) => spawnSync(process.execPath, [join(root, 'tools/worlds.mjs'), ...args], { cwd: root, encoding: 'utf8', timeout: 30000 });

  it('refuses a folder that is not a build, a flag and a second argument: exit code 2, nothing built', () => {
    for (const args of [[folder({ 'a.txt': 'x' })], ['--frobnicate'], ['dist', 'more']]) {
      const r = run(...args);
      expect({ args, status: r.status }).toEqual({ args, status: 2 });
      expect(r.stderr).toMatch(/Usage: node tools\/worlds\.mjs \[distDir\]/);
    }
  });

  it('refuses --only without a part, with an unknown part, given twice: exit code 2, the parts are named, nothing built', () => {
    for (const args of [['--only'], ['dist', '--only'], ['--only', 'walks'], ['--only', 'cache,rounds'], ['--only', ''], ['--only', 'cache', '--only', 'walk'], ['--only', '--bail']]) {
      const r = run(...args);
      expect({ args, status: r.status }).toEqual({ args, status: 2 });
      expect(r.stderr).toContain(`parts: ${PARTS.join(', ')}`);
      expect(r.stdout).not.toContain('[worlds] parts:');
    }
  }, 60000);   // seven starts of node: seconds on a busy machine

  it('readArgs: without --only every part is played, in the order of the run', () => {
    expect(PARTS).toEqual(['walk', 'cache', 'transition', 'travel']);
    expect(readArgs([])).toEqual({ dist: null, parts: PARTS });
    expect(readArgs(['dist'])).toEqual({ dist: 'dist', parts: PARTS });
  });

  it('readArgs: --only plays the parts named and no other, before or after the folder, in the order of the run', () => {
    for (const part of PARTS) expect(readArgs(['dist', '--only', part])).toEqual({ dist: 'dist', parts: [part] });
    expect(readArgs(['--only', 'cache', 'dist'])).toEqual({ dist: 'dist', parts: ['cache'] });
    expect(readArgs(['--only', 'transition,walk'])).toEqual({ dist: null, parts: ['walk', 'transition'] });
    expect(readArgs(['--only', 'cache,cache'])).toEqual({ dist: null, parts: ['cache'] });
    expect(readArgs(['dist', '--only', 'travel,cache'])).toEqual({ dist: 'dist', parts: ['cache', 'travel'] });
  });

  it('readArgs: a mistake is said, never guessed around - no part is played by a mistyped name', () => {
    expect(readArgs(['--only']).error).toContain('--only needs a part');
    expect(readArgs(['--only', '--x']).error).toContain('--only needs a part');
    expect(readArgs(['--only', 'walk,rounds']).error).toBe('unknown part "rounds" of --only: use walk, cache, transition, travel');
    expect(readArgs(['--only', '']).error).toContain('unknown part ""');
    expect(readArgs(['--only', 'walk', '--only', 'cache']).error).toBe('--only is given twice');
    expect(readArgs(['--frobnicate']).error).toBe('unknown flag "--frobnicate"');
    expect(readArgs(['--only=walk']).error).toBe('unknown flag "--only=walk"');
    expect(readArgs(['dist', 'more']).error).toBe('a second folder "more"');
    for (const bad of [['--only'], ['--only', 'x'], ['a', 'b'], ['-x']]) expect(readArgs(bad).parts).toBeUndefined();
  });

  it('each part is played only when it is named: the walkthrough, the cache, the transition and the change of world are behind play(<part>)', () => {
    const src = readFileSync(join(root, 'tools/worlds.mjs'), 'utf8');
    expect(src).toContain("const play = (part) => read.parts.includes(part);");
    expect(src).toMatch(/if \(play\('walk'\)\) try \{\n {4}for \(const walk of WALKS\) \{\n(?:(?!\n {2}\}).*\n)*? {6}const \{ code, signal, timedOut \} = await run\(process\.execPath, \[join\(root, 'tools\/shot\.mjs'\)/);
    expect(src).toMatch(/if \(play\('cache'\)\) try \{\n\s+const summary = await cacheScenarios\(/);
    expect(src).toMatch(/if \(play\('transition'\)\) try \{\n\s+const summary = await transitionScenarios\(/);
    expect(src).toMatch(/if \(play\('travel'\)\) try \{\n\s+const summary = await travelScenarios\(/);
    // every part of PARTS is played somewhere: a part nobody plays would be a green job that checks nothing
    for (const part of PARTS) expect(src.split(`if (play('${part}')) try {`), part).toHaveLength(2);
    expect(src).toMatch(/if \(!play\('walk'\)\) console\.log\([^\n]*\n\s+else try \{\n\s+if \(!args\[0\]\) await vite\('the published build'\);/);
    // the probe build is made for every part
    expect(src).toMatch(/\n {2}try \{\n\s+rmSync\(probeDist, [^\n]*\n\s+await vite\('the probe build'/);
    for (const call of ['await cacheScenarios(', 'await transitionScenarios(', 'await travelScenarios(', "join(root, 'tools/shot.mjs')"]) expect(src.split(call)).toHaveLength(2);
  });

  it('tools/e2e.mjs runs it as the step "worlds", after "update", on the dist/ it built', () => {
    const e2e = readFileSync(join(root, 'tools/e2e.mjs'), 'utf8');
    expect(e2e).toContain("run(process.execPath, [join(root, 'tools/worlds.mjs'), join(root, 'dist')]");
    expect(e2e).toMatch(/await step\('update', update\);\n\s+if \(opts\.bail && failed\(\)\) skip\('worlds', '--bail'\);\n\s+else await step\('worlds', worlds\);/);
  });
});
