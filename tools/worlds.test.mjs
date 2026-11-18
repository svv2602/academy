// Runs in `npm test`: the checks of tools/worlds.mjs (the step "worlds" of npm run e2e) on prepared folders - the
// published build must hold nothing of the probe world (TECH-15), the probe build must hold all of it. The real
// builds are checked, and the probe world played, by `npm run e2e`.
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:net';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { MAX_VOICE, checkDistSize } from './dist-size.mjs';
import { listWorlds } from './vite-worlds.mjs';
import {
  FIRST_WORLD, OFFLINE_MARK, PARTS, PROBE, PROBE_DIST, PROBE_FILES, ROUNDS, ROUND_GROWTH, ROUND_KEYS, ROUND_KINDS, WALKS, askedOffline, askedOfWorld, askedWithoutNetwork, buildCommit, closedProblems, coreVoiceBytes, irisProblems, layerCallsProblems, layerDifference, listProblems, notAskedByPage, notDownloaded,
  playRound, probeBuildProblems, probeFiles, probeLeft, publishedProblems, readArgs, readList, readRound, ringPixels, roundLine, roundProblems, watchPrograms, travelFramesProblems, walkEnv, worldVoiceProblems,
} from './worlds.mjs';
import { PHONE_CDP, PHONE_PORT, SAVE_KEYS, phoneHelp, phoneProblem, readPhoneArgs } from './worlds-phone.mjs';

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

// TECH-09, R64/R79: the voice of a next world is a part of the world - listed for its download, out of the
// installation, counted apart from the voice of the core.
describe('the voice of the probe world in the probe build (worlds.json, sw.js, the size)', () => {
  const CLIP = 'voice/probe/probe_hi.mp3';
  const CORE = { 'voice/hello.mp3': 'a clip of the core', 'voice/bye@Leda.mp3': 'another one' };
  const WORLD_FILES = { 'models/probe/stump.glb': 'a stump', [CLIP]: 'the clip of the world' };
  const files = Object.keys(WORLD_FILES).sort();
  const core = Object.values(CORE).join('').length;
  const listOf = (entries) => JSON.stringify({ cache: 'worlds', worlds: { probe: { revision: 'r', size: 0, files: entries.map(([url, text]) => ({ url, size: text.length, revision: 'x' })) } } });
  const SW = 'precacheAndRoute([{url:"index.html",revision:"1"},{url:"voice/hello.mp3",revision:"2"},{url:"voice/bye@Leda.mp3",revision:"3"},{url:"worlds.json",revision:"4"}])';
  const build = (more = {}) => folder({ 'index.html': '<!doctype html>', ...CORE, ...WORLD_FILES, 'worlds.json': listOf(Object.entries(WORLD_FILES)), 'sw.js': SW, ...more });
  /** The size of a build as tools/dist-size.mjs counts it, with "probe" as its one next world. */
  const sizeOf = (dir, worlds = [PROBE]) => checkDistSize(dir, undefined, undefined, undefined, { worlds, first: 'fairy' });
  const problems = (dir, o = {}) => worldVoiceProblems(dir, PROBE, o.files ?? files, o.size ?? sizeOf(dir), o.core ?? core);

  it('a clip in voice/<id>/, listed with its size, not precached, counted as the world\'s voice, the core\'s voice untouched: no problems', () => {
    const dir = build();
    expect(problems(dir)).toEqual([]);
    expect(sizeOf(dir).worlds).toEqual([{ id: PROBE, total: 'a stump'.length, voice: 'the clip of the world'.length, files: 2 }]);
    expect(sizeOf(dir).voice).toBe(core);
  });

  it('a world without a clip of its own: its voice is tried on nothing', () => {
    expect(problems(build(), { files: ['models/probe/stump.glb'] })).toEqual(['the world "probe" has no clip of its own in voice/probe/: the voice of a next world is tried on nothing']);
    // a clip of the core, or of another world, is not this world's
    expect(problems(build(), { files: ['voice/hello.mp3', 'voice/lake/x.mp3'] })).toHaveLength(1);
  });

  it('a clip of the world in the list of the installation', () => {
    const dir = build({ 'sw.js': SW.replace('{url:"worlds.json"', `{url:"${CLIP}",revision:"5"},{url:"worlds.json"`) });
    expect(problems(dir)).toEqual([`sw.js precaches ${CLIP}: the voice of a next world is not part of the installation`]);
  });

  it('a clip worlds.json does not list, or lists with a size that is not the file\'s', () => {
    const noClip = build({ 'worlds.json': listOf([['models/probe/stump.glb', 'a stump']]) });
    expect(problems(noClip)).toEqual([`worlds.json does not list the clip ${CLIP}: the game would not download it with the world "probe"`]);
    const wrongSize = build({ 'worlds.json': listOf([['models/probe/stump.glb', 'a stump'], [CLIP, 'x']]) });
    expect(problems(wrongSize)).toEqual([`worlds.json says the clip ${CLIP} is 1 bytes, in the build it is ${'the clip of the world'.length}`]);
    const empty = build({ [CLIP]: '', 'worlds.json': listOf([['models/probe/stump.glb', 'a stump'], [CLIP, '']]) });
    expect(problems(empty)).toContain(`worlds.json says the clip ${CLIP} is 0 bytes, in the build it is 0`);
    expect(problems(build({ 'worlds.json': 'not json' }))).toHaveLength(1);
  });

  it('a clip of the world counted with the voice of the core: the world is not a next world for the size', () => {
    const dir = build();
    const out = problems(dir, { size: sizeOf(dir, []) });
    expect(out).toEqual([
      `the voice of the world "probe" is counted as 0 bytes, its 1 clip(s) are ${'the clip of the world'.length}: the clips of voice/probe/ are not counted apart from the core`,
      `the voice of the core is ${core + 'the clip of the world'.length} bytes in the build, the clips of public/voice are ${core}: a clip of the world "probe" is counted with the core, or a clip of the core is not in the build`,
    ]);
  });

  it('the voice of the core must be the clips of public/voice, byte for byte: one clip less, or one more, is seen', () => {
    const dir = build();
    expect(problems(dir, { core: core + 1 })).toHaveLength(1);
    expect(problems(dir, { core: core - 1 })[0]).toMatch(/^the voice of the core is \d+ bytes in the build, the clips of public\/voice are \d+/);
  });

  it('a file in the folder of the voice that is not a clip', () => {
    const dir = build({ 'voice/probe/notes.txt': 'x', 'worlds.json': listOf([...Object.entries(WORLD_FILES), ['voice/probe/notes.txt', 'x']]) });
    expect(problems(dir, { files: [...files, 'voice/probe/notes.txt'] })).toEqual(['voice/probe/notes.txt is in the folder of the voice of the world "probe" and is not a clip (.mp3)']);
  });

  it('the clip is one of the files the world is downloaded with: in its list and in its size (R69: "ready" waits for the voice too)', () => {
    // src/core/worldcache.ts calls a world ready when every file of its list is in the cache; the list is made here.
    const bytes = (files) => Object.entries(files).map(([path, text]) => ({ path, bytes: Buffer.from(text) }));
    const list = listWorlds(bytes({ ...CORE, ...WORLD_FILES }), [PROBE]);
    expect(list.worlds.probe.files.map((f) => f.url)).toEqual(['models/probe/stump.glb', CLIP]);
    expect(list.worlds.probe.files.find((f) => f.url === CLIP).size).toBe('the clip of the world'.length);
    expect(list.worlds.probe.size).toBe('a stump'.length + 'the clip of the world'.length);
    // the clips of the core are in no world's list
    expect(JSON.stringify(list)).not.toContain('voice/hello.mp3');
  });

  it('coreVoiceBytes: the clips of the folder itself, not of the folders of the worlds inside it', () => {
    const dir = folder({ 'a.mp3': '12345', 'b@Leda.mp3': '123', 'lake/c.mp3': '1234567', 'notes.txt': '12' });
    expect(coreVoiceBytes(dir)).toBe(8);
    // the sources: what docs/15-tech.md budgets as the voice of the first load, under its limit
    expect(coreVoiceBytes()).toBeGreaterThan(1_000_000);
    expect(coreVoiceBytes()).toBeLessThanOrEqual(MAX_VOICE);   // the limit of tools/dist-size.mjs, not a copy of it
  });

  it('the run checks the voice of the probe build, and the scenarios check the clip where it is asked for', () => {
    const src = readFileSync(join(root, 'tools/worlds.mjs'), 'utf8');
    expect(src).toContain('...worldVoiceProblems(probeDist, PROBE, files, size, core).map((p) => `the voice of the probe world: ${p}`)');
    // the cache: the clip is answered by the service worker, and the line is not left to the synthesizer
    expect(src).toContain('for (const f of clips) if (!served.has(f)) fail(`offline: ${f} was not answered by the service worker');
    expect(src).toContain('if (synth.includes(hi.key)) fail(');
    // the change of world: the clip only while the world plays
    for (const check of ['if (home.ownClip !== null) fail(', 'if (away.ownClip !== HI_CLIP) fail(', 'if (back.ownClip !== null) fail(', 'if (greeting.synth) fail(']) expect(src.split(check), check).toHaveLength(2);
  });
});

describe('the probe world in the sources', () => {
  it('its files lie outside public/, in folders of their world, with a note where they come from', () => {
    const files = probeFiles();
    expect(files).toEqual(['models/probe/stump.glb', 'story/probe/sign.webp', 'voice/probe/probe_hi.mp3']);
    expect(existsSync(join(root, PROBE_FILES, 'README.md'))).toBe(true);
    for (const f of files) expect(existsSync(join(root, 'public', f)), `public/${f}`).toBe(false);
    expect(existsSync(join(root, 'public/models', PROBE))).toBe(false);
    expect(existsSync(join(root, 'public/voice', PROBE))).toBe(false);
    // the note says where each file comes from
    const note = readFileSync(join(root, PROBE_FILES, 'README.md'), 'utf8');
    for (const f of files) expect(note, f).toContain(`\`${f}\``);
  });

  it('the world asks for exactly these files, and git ignores the folder of its build', () => {
    const src = readFileSync(join(root, 'src/worlds/probe/index.ts'), 'utf8');
    expect(src).toContain("model: 'probe/stump'");            // src/core/assets.ts: models/<path>.glb
    expect(src).toContain("picture: 'story/probe/sign.webp'");
    // its clip: the greeting of its character is the world's own line, and the world hands the list of its clips to
    // the voice for as long as it plays (src/core/voice.ts asks for voice/<id>/<name>.mp3)
    expect(src).toContain("hi: 'probe_hi'");
    expect(src).toContain('scope.own(worldClips(probe.id, CLIPS));');
    expect(JSON.parse(readFileSync(join(root, 'src/worlds/probe/clips.json'), 'utf8'))).toEqual(['probe_hi']);
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
      E2E_OFFLINE_MARK: '', E2E_COMMIT: 'abc1234', E2E_VOICE_OUT: 'v.json', E2E_MODELS_OUT: 'm.json', E2E_LEVEL: '3',
    });
    const desk = walkEnv({ E2E_OFFLINE: '0' }, WALKS[1], o);
    expect(desk.E2E_OFFLINE).toBe('1');
    // only the walkthrough without network tells the server when the network goes; a mark of the caller is not kept
    expect(desk.E2E_OFFLINE_MARK).toBe(OFFLINE_MARK);
    expect(walkEnv({ E2E_OFFLINE_MARK: '/other' }, WALKS[0], o).E2E_OFFLINE_MARK).toBe('');
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
    // with the network every file of the world, its clip too; without it the clip is said from the cache, unheard by the server
    expect(walk).toContain('const due = walk.offline ? files.filter((f) => !isVoice(f)) : files;');
    expect(walk).toContain('const missed = notAskedByPage(due, mine);');
    // without network: nothing of the world is asked of the server after the mark, and the mark must have come
    expect(walk).toContain('const off = walk.offline ? askedOffline(mine, PROBE) : { marked: true, late: [] };');
    expect(walk).toMatch(/if \(!off\.marked\) fail\(`\$\{name\}: the walkthrough never said it switched the network off/);
    expect(walk).toMatch(/for \(const f of off\.late\) fail\(`\$\{name\}: with the network switched off the server was still asked for \$\{f\}/);
    expect(walk).toContain('if (voice && !wrong.length && !missed.length && off.marked && !off.late.length) {');
    // the server of this script answers the mark itself and notes it among the requests
    expect(src).toContain("if (path === OFFLINE_MARK) { asked.push({ path, referer: req.headers.referer ?? '', search: '' }); res.writeHead(204, { 'Cache-Control': 'no-store' }).end(); return; }");
  });

  it('what was asked without network: the requests for a file of the world after the mark', () => {
    const r = (path, referer = 'http://localhost:4350/?debug&world=probe') => ({ path, referer, search: '' });
    const sw = 'http://localhost:4350/sw.js';
    expect(OFFLINE_MARK).toBe('/offline-mark');
    // the world came from the cache: the page and the download asked before the mark, nobody after it
    const fromCache = [r('/index.html'), r(`/models/${PROBE}/stump.glb`), r(`/story/${PROBE}/sign.webp`), r(`/models/${PROBE}/stump.glb`, sw), r(OFFLINE_MARK), r('/sw.js'), r('/voice/go_next.mp3', sw)];
    expect(askedOffline(fromCache, PROBE)).toEqual({ marked: true, late: [] });
    // the world was never in the cache: the worker went to the server for it with the network switched off
    const leaked = [r(`/models/${PROBE}/stump.glb`), r(OFFLINE_MARK), r(`/models/${PROBE}/stump.glb`, sw), r(`/story/${PROBE}/sign.webp`, sw)];
    expect(askedOffline(leaked, PROBE)).toEqual({ marked: true, late: [`/models/${PROBE}/stump.glb`, `/story/${PROBE}/sign.webp`] });
    // no mark: nothing can be said, and that is told apart from "nothing late"
    expect(askedOffline([r(`/models/${PROBE}/stump.glb`)], PROBE)).toEqual({ marked: false, late: [] });
    // a file merely named after the world, or of another world, is not the world's
    expect(askedOffline([r(OFFLINE_MARK), r(`/models/${PROBE}.glb`, sw), r('/models/forest/tree.glb', sw)], PROBE).late).toEqual([]);
    // a second walkthrough in the same list: its own mark counts
    expect(askedOffline([r(OFFLINE_MARK), r(`/models/${PROBE}/stump.glb`, sw), r(OFFLINE_MARK)], PROBE).late).toEqual([]);
  });

  it('tools/shot.mjs: before the network is switched off the world is brought into the cache "worlds", and the server is told', () => {
    const shot = readFileSync(join(root, 'tools/shot.mjs'), 'utf8');
    const block = /\n {4}if \(offline\) \{\n((?: {6}.*\n)+?) {4}\}\n/.exec(shot)[1];
    const order = ['cachedFiles = await waitForOfflineCache();', 'if (worldId) worldFiles = await cacheWorld(worldId);', 'if (offlineMark) await g((path) => fetch(path', 'await ctx.setOffline(true);', 'await page.reload();'];
    const at = order.map((line) => block.indexOf(line));
    expect(at.every((n) => n >= 0), JSON.stringify(at)).toBe(true);
    expect([...at].sort((a, b) => a - b)).toEqual(at);
    // the world's own download and its end, not the clock; a world that is not ready fails by its name
    const fn = shot.slice(shot.indexOf('const cacheWorld = async (id) => {'), shot.indexOf('\n  try {', shot.indexOf('const cacheWorld = async (id) => {')));
    expect(fn).toContain("if (await cache.status(w) === 'core') return { status: 'core', files: 0 };");
    expect(fn).toContain('const d = await cache.download(w);');
    expect(fn).toContain("if (st.status !== 'core' && st.status !== 'ready') {");
    expect(fn).toContain('without network it cannot be entered - its files are not in the cache "worlds"');
    expect(fn).not.toMatch(/\bT\(|waitForTimeout|Date\.now/);
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

describe('the rounds "first world -> probe world -> back" (TECH-15, R10, R19)', () => {
  const MB = 1048576;
  const KINDS = Array.from({ length: 20 }, (_, i) => `prog${i}:k${i}`);
  const round = (n, o = {}) => ({ round: n, heap: 40 * MB, geometries: 300, textures: 120, programs: 60, kinds: KINDS, ...o });
  const five = (last = {}) => [1, 2, 3, 4].map((n) => round(n)).concat(round(5, last));

  it('five rounds, the numbers of the requirement: the heap, the geometries, the textures, at most 10 % over; the programs by their kinds', () => {
    expect(ROUNDS).toBe(5);
    expect(ROUND_GROWTH).toBe(0.1);
    expect(ROUND_KEYS).toEqual(['heap', 'geometries', 'textures']);
    expect(ROUND_KINDS).toBe('kinds');
    expect(FIRST_WORLD).toBe('fairy');
  });

  it('the last round within 10 % of the first, each number: no problem - exactly 10 % over is still within', () => {
    expect(roundProblems(five())).toEqual([]);
    expect(roundProblems(five({ heap: 44 * MB, geometries: 330, textures: 132 }))).toEqual([]);
    // the rule is the last against the first: a round in the middle that held more and let it go is no problem
    const mid = five(); mid[2] = round(3, { heap: 60 * MB });
    expect(roundProblems(mid)).toEqual([]);
  });

  it.each(ROUND_KEYS)('"%s" more than 10 % over after the last round is a problem that names it', (k) => {
    const first = round(1)[k];
    const left = roundProblems(five({ [k]: Math.ceil(first * 1.1) + 1 }));
    expect(left).toHaveLength(1);
    expect(left[0]).toContain(`after round 5 "${k}" is`);
    expect(left[0]).toContain('at most 10 % is allowed');
  });

  it('a number not read after a round, or not five rounds, is a problem: never a quiet pass', () => {
    expect(roundProblems(five().slice(0, 4))).toEqual(['4 round(s) were read, expected 5']);
    expect(roundProblems([])).toEqual(['0 round(s) were read, expected 5']);
    const lost = five(); lost[1] = round(2, { textures: undefined });
    expect(roundProblems(lost)).toEqual(['"textures" was not read after round 2 (undefined): nothing to compare']);
    const blind = five(); blind[2] = round(3, { kinds: null });
    expect(roundProblems(blind)).toEqual(['the kinds of the shader programs were not read after round 3: nothing to compare']);
    expect(roundProblems(five({ kinds: [] }))).toEqual(['the kinds of the shader programs were not read after round 5: nothing to compare']);
    expect(roundProblems(five({ heap: 0 }))[0]).toContain('"heap" was not read after round 5');
  });

  it('a line of the log for each round: the heap in MB and the three counts of the renderer', () => {
    expect(roundLine(round(3, { heap: 41.5 * MB }))).toBe('round 3: heap 41.50 MB, geometries 300, textures 120, programs 60 (20 kinds in the round)');
  });

  it('the programs: a count that swings while the kinds stay is no problem; new kinds over 10 % are, each named (CI 44287659093)', () => {
    // seen on the runner: 47 or 58 programs after a round, the same kinds - the count is no longer judged
    const swing = five({ programs: 58 }); swing[0] = round(1, { programs: 47 });
    expect(roundProblems(swing)).toEqual([]);
    // two new kinds of twenty: exactly 10 % - within
    expect(roundProblems(five({ kinds: [...KINDS, 'leak:a', 'leak:b'] }))).toEqual([]);
    // three new kinds: a problem that says how many, of how many, and which
    const left = roundProblems(five({ kinds: [...KINDS, 'leak:a', 'leak:b', 'leak:c'] }));
    expect(left).toEqual(['after round 5 the renderer holds 3 kind(s) of shader program it did not hold in rounds 1 and 2 (20 kinds then; at most 10 % new is allowed): leak:a, leak:b, leak:c']);
    // the second round renumbers the sources of the materials of their own once: its kinds are known, not new (CI 44287659093)
    const renumbered = KINDS.slice(0, 12).concat(['32:x', '34:y', '36:z', '39:w', '41:v', '43:u', '4:t', '4:s']);
    const settled = [1, 2, 3, 4, 5].map((n) => round(n, n === 1 ? {} : { kinds: renumbered }));
    expect(roundProblems(settled)).toEqual([]);
    // what the second round knows counts: a kind first seen in round 3 and kept is new
    const late = [1, 2, 3, 4, 5].map((n) => round(n, n < 3 ? {} : { kinds: [...KINDS, 'a:1', 'b:2', 'c:3'] }));
    expect(roundProblems(late)).toHaveLength(1);
    // kinds the first round held and the last did not are no growth
    expect(roundProblems(five({ kinds: KINDS.slice(5) }))).toEqual([]);
  });

  it('readRound: the garbage is collected (twice) before the heap is read, then the renderer is read', async () => {
    const calls = [];
    const cdp = { send: async (m) => { calls.push(m); return m === 'Runtime.getHeapUsage' ? { usedSize: 1234, totalSize: 9999 } : {}; } };
    const was = globalThis.window;
    globalThis.window = { __game: { renderer: { info: { memory: { geometries: 7, textures: 3 }, programs: [1, 2] } } } };
    try {
      const page = { evaluate: async (fn, arg) => { calls.push('renderer'); return fn(arg); } };
      expect(await readRound(page, cdp, 2)).toEqual({ round: 2, heap: 1234, geometries: 7, textures: 3, programs: 2, kinds: null });
      // with the watch on: the kinds noted since the read before, sorted, and the noting starts anew
      globalThis.window.__programKinds = new Set(['b:2', 'a:1']);
      expect((await readRound(page, cdp, 3)).kinds).toEqual(['a:1', 'b:2']);
      expect([...globalThis.window.__programKinds]).toEqual([]);
    } finally { globalThis.window = was; }
    expect(calls.slice(0, 4)).toEqual(['HeapProfiler.collectGarbage', 'HeapProfiler.collectGarbage', 'Runtime.getHeapUsage', 'renderer']);
  });

  it('watchPrograms: every frame notes the kind of each program - its name and a hash of its key - once installed', async () => {
    const was = { window: globalThis.window, raf: globalThis.requestAnimationFrame };
    const frames = [];
    globalThis.requestAnimationFrame = (f) => { frames.push(f); };
    const programs = [{ name: 'MeshStandardMaterial', cacheKey: 'physical,a,b' }, { name: '', cacheKey: 'basic,x' }];
    globalThis.window = { __game: { renderer: { info: { programs } } } };
    try {
      const page = { evaluate: async (fn, arg) => fn(arg) };
      await watchPrograms(page);
      const first = [...globalThis.window.__programKinds];
      expect(first).toHaveLength(2);
      expect(first[0]).toMatch(/^MeshStandardMaterial:[0-9a-z]+$/);
      expect(first[1]).toMatch(/^basic:[0-9a-z]+$/);
      // a program with another key is another kind; the same key is the same kind, frame after frame
      programs.push({ name: 'MeshStandardMaterial', cacheKey: 'physical,a,c' });
      frames.shift()();
      expect(globalThis.window.__programKinds.size).toBe(3);
      // a material of its own compiled again under new numbers of its shaders is the same kind; other defines are another
      programs.push({ name: '', cacheKey: '32,33,FOG,x' });
      frames.shift()();
      programs.push({ name: '', cacheKey: '57,58,FOG,x' });
      frames.shift()();
      expect(globalThis.window.__programKinds.size).toBe(4);
      expect([...globalThis.window.__programKinds].filter((k) => k.startsWith('own:'))).toHaveLength(1);
      programs.push({ name: '', cacheKey: '57,58,NOFOG,x' });
      frames.shift()();
      expect(globalThis.window.__programKinds.size).toBe(5);
      // installed once: a second call starts the noting anew, it does not add a second watch
      await watchPrograms(page);
      expect(globalThis.window.__programKinds.size).toBe(0);
      expect(frames).toHaveLength(1);   // the one watch, waiting for its next frame
    } finally { globalThis.window = was.window; globalThis.requestAnimationFrame = was.raf; }
  });

  it('playRound: to the probe world and back by __game.travel, the game settled after each; a change that is not true stops the round', async () => {
    const went = [], waited = [];
    const page = (answers) => ({ evaluate: async (fn, id) => { went.push(id); return answers.shift(); } });
    const until = async (_fn, _arg, what) => { waited.push(what); };
    expect(await playRound(page([true, true]), until)).toEqual([]);
    expect(went).toEqual([PROBE, FIRST_WORLD]);
    expect(waited).toEqual([`the game stayed busy after the change to "${PROBE}"`, `the game stayed busy after the change to "${FIRST_WORLD}"`]);
    went.length = 0;
    expect(await playRound(page([false, true]), until)).toEqual([`__game.travel('${PROBE}') answered false, expected true`]);
    expect(went).toEqual([PROBE]);
  });
});

describe('the scenarios of the gate in the part "travel" (R07, R12, README of checklist K)', () => {
  const src = readFileSync(join(root, 'tools/worlds.mjs'), 'utf8');
  const travel = src.slice(src.indexOf('async function travelScenarios('), src.indexOf('async function transitionScenarios('));
  const block = (start) => travel.slice(travel.indexOf(start), travel.indexOf('\n    }\n', travel.indexOf(start)));

  it('the cat\'s line is checked by its recorded clip: on, a clip started, not left to the synthesizer, the clip of the core', () => {
    const said = travel.slice(travel.indexOf('const saidNeedNet = async'), travel.indexOf('const offline = async'));
    expect(said).toContain('__game.line === k && __game.voice.clips > n');
    expect(said).toContain('if (v.synth) fail(');
    expect(said).toContain('__game.voice.synth.includes(k)');
    expect(said).toContain('if (v.clip !== NEED_NET) fail(');
    expect(travel).toContain("const NEED_NET = 'need_net';");
  });

  it('"without network" is the server\'s count after the mark, in every scenario that goes offline', () => {
    const off = travel.slice(travel.indexOf('const offline = async'), travel.indexOf('const noneAsked = '));
    const told = off.indexOf("await p.g((path) => fetch(path, { cache: 'no-store' }).then(() => true), OFFLINE_MARK);");
    expect(told).toBeGreaterThanOrEqual(0);
    expect(told).toBeLessThan(off.indexOf('await p.ctx.setOffline(true);'));
    expect(travel).toContain('const off = askedOffline(asked, PROBE);');
    expect(travel.split('setOffline(true)')).toHaveLength(2);   // the switch only in `offline`, never without the mark
    for (const what of ["noneAsked(name, 'the closed portal');", "noneAsked(name2, 'the probe world entered from the cache');", "noneAsked(name, 'the probe world entered again after the reload');"]) {
      expect(travel.split(what), what).toHaveLength(2);
    }
  });

  it('the closed portal: a browser that saves data, a world not in the cache, refused without a frame of the layer, the cat, the heroine walks, a task', () => {
    const closed = block("const name = 'the closed portal';");
    expect(closed).toContain('const p = await open(name, false, true);');
    expect(closed).toContain("if (before !== 'none') fail(");
    expect(closed.indexOf('await offline(p);')).toBeLessThan(closed.indexOf('const refused = await p.travel(PROBE);'));
    expect(closed).toContain('if (refused.ok !== false) fail(');
    expect(closed).toContain('if (after.frames !== layer.frames || after.phase !== \'idle\' || after.going) fail(');
    expect(closed).toContain('await saidNeedNet(p, name, layer.clips);');
    expect(closed).toContain('if (!(await p.walks())) fail(');
    expect(closed).toContain("await p.solveWith('fox', FIRST);");
    expect(closed).toContain('if (there.ok !== true) fail(');
  });

  it('the rounds: by the network first, ready with its voice, five rounds read and compared, the progress after a reload without network, entered from the cache', () => {
    const rounds = block("const name = 'rounds';");
    expect(rounds).toContain('const p = await open(name, false, true);');
    expect(rounds).toContain("if (kept.status !== 'ready' || !same(kept.cached, files)) fail(");
    expect(rounds).toContain('rounds.push(await readRound(p.page, cdp, 1));');
    // the kinds of the first round are watched from its very first change, before the picture of the middle of it
    expect(rounds.indexOf('await watchPrograms(p.page);')).toBeGreaterThanOrEqual(0);
    expect(rounds.indexOf('await watchPrograms(p.page);')).toBeLessThan(rounds.indexOf('window.__roundGoing = __game.travel(to);'));
    expect(rounds).toContain('for (const x of await playRound(p.page, p.until)) fail(');
    expect(rounds).toContain('for (const x of roundProblems(rounds)) fail(');
    expect(rounds).toContain('if (now !== was) fail(');
    expect(rounds.indexOf('await offline(p);')).toBeLessThan(rounds.indexOf('await p.page.reload();'));
    expect(rounds).toContain('if (again.ok !== true) fail(');
    // the picture of the middle of a real change: the game's clock stopped, not the debug stop of the layer
    expect(rounds).toContain("await p.page.screenshot({ path: join(root, shots, 'travel-mid.png') });");
    expect(rounds).toContain('__game.still(true)');
    expect(rounds).not.toContain('__game.transition(');
    // the voice of the world is among the files the cache must hold
    expect(travel).toContain('if (!files.some(isVoice)) throw new Error(');
  });

  it('the files gone: the download fails, the cat says the network is needed by its clip', () => {
    const gone = block("const name = 'the files are gone';");
    expect(gone).toContain('await saidNeedNet(p, name, clipsBefore);');
    expect(gone).toContain('for (const x of travelFramesProblems(refused.frames, FIRST, FIRST)) fail(');
  });
});

describe('node tools/worlds-phone.mjs: the same rounds on the phone (R21)', () => {
  const phone = readFileSync(join(root, 'tools/worlds-phone.mjs'), 'utf8');

  it('plays the rounds and reads the numbers with the functions of the scenario "rounds", and compares them the same way', () => {
    expect(phone).toContain("import { FIRST_WORLD, PROBE, PROBE_DIST, ROUNDS, playRound, readRound, roundLine, roundProblems, watchPrograms } from './worlds.mjs';");
    expect(phone.indexOf('await watchPrograms(page);')).toBeLessThan(phone.indexOf('const wrong = await playRound(page, until);'));
    expect(phone).toContain('const wrong = await playRound(page, until);');
    expect(phone).toContain('rounds.push(await readRound(page, cdp, n));');
    expect(phone).toContain('problems.push(...roundProblems(rounds));');
  });

  it('touches only a tab of its own, keeps it in front, and puts the storage back; the copy never goes to a file', () => {
    expect(phone).toContain('const page = await ctx.newPage();');
    expect(phone).toContain('await page.bringToFront();');
    expect(phone).toContain('await page.close().catch(() => {});');
    expect(phone).not.toMatch(/writeFileSync|appendFileSync|createWriteStream/);
    expect('amw-save').toMatch(SAVE_KEYS); expect('amw-save-prev').toMatch(SAVE_KEYS); expect('amw-save-v3').toMatch(SAVE_KEYS);
    expect('other').not.toMatch(SAVE_KEYS);
  });

  it('readPhoneArgs: the address of the phone, the port and the build, each once; a mistake is said', () => {
    expect(readPhoneArgs([])).toEqual({ cdp: PHONE_CDP, port: PHONE_PORT, dist: PROBE_DIST });
    expect(PHONE_PORT).toBe(4373);
    expect(readPhoneArgs(['--cdp', 'http://127.0.0.1:9444/x', '--port', '4380', '--dist', 'other'])).toEqual({ cdp: 'http://127.0.0.1:9444', port: 4380, dist: 'other' });
    expect(readPhoneArgs(['--port', '0']).error).toBe('bad --port "0"');
    expect(readPhoneArgs(['--port']).error).toBe('--port needs a value');
    expect(readPhoneArgs(['--cdp', 'ws://x']).error).toContain('bad --cdp');
    expect(readPhoneArgs(['--port', '1', '--port', '2']).error).toBe('--port is given twice');
    expect(readPhoneArgs(['phone']).error).toBe('unknown argument "phone"');
  });

  it('phoneProblem: only Chrome on a phone is driven - a Chrome of this machine is refused', () => {
    const android = { Browser: 'Chrome/131.0', 'Android-Package': 'com.android.chrome', 'User-Agent': 'Mozilla/5.0 (Linux; Android 14; SM-S901B) Chrome/131.0 Mobile', webSocketDebuggerUrl: 'ws://127.0.0.1:9333/devtools/browser' };
    expect(phoneProblem(android)).toBeNull();
    expect(phoneProblem({ ...android, 'Android-Package': undefined })).toBeNull();
    expect(phoneProblem({ Browser: 'Chrome/131.0', 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) Chrome/131.0', webSocketDebuggerUrl: 'ws://x' })).toContain('not Chrome on a phone');
    expect(phoneProblem(null)).toContain('did not answer');
    expect(phoneProblem({ ...android, webSocketDebuggerUrl: undefined })).toContain('webSocketDebuggerUrl');
    expect(phoneHelp('http://127.0.0.1:9333', 4373)).toContain('adb forward tcp:9333 localabstract:chrome_devtools_remote');
    expect(phoneHelp('http://127.0.0.1:9333', 4373)).toContain('adb reverse tcp:4373 tcp:4373');
  });

  it('without a phone: exit code 3 and how to connect it, nothing served or opened', async () => {
    // A port nothing listens on: taken and given back, so no phone (and no Chrome) can be at it.
    const port = await new Promise((ok) => { const s = createServer().listen(0, '127.0.0.1', () => { const n = s.address().port; s.close(() => ok(n)); }); });
    const r = spawnSync(process.execPath, [join(root, 'tools/worlds-phone.mjs'), '--cdp', `http://127.0.0.1:${port}`, '--port', '1'], { cwd: root, encoding: 'utf8', timeout: 30000 });
    expect(r.status).toBe(3);
    expect(r.stderr).toContain(`no phone: nothing answers as Chrome on a phone at http://127.0.0.1:${port}.`);
    expect(r.stderr).toContain('adb reverse tcp:1 tcp:1');
    expect(r.stdout).not.toContain('served on');
  }, 30000);

  it('a bad argument: exit code 2 and the usage', () => {
    const r = spawnSync(process.execPath, [join(root, 'tools/worlds-phone.mjs'), '--frobnicate'], { cwd: root, encoding: 'utf8', timeout: 30000 });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('Usage: node tools/worlds-phone.mjs');
  }, 30000);
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
