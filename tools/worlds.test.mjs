// Runs in `npm test`: the checks of tools/worlds.mjs (the step "worlds" of npm run e2e) on prepared folders - the
// published build must hold nothing of the probe world (TECH-15), the probe build must hold all of it. The real
// builds are checked, and the probe world played, by `npm run e2e`.
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { PROBE, PROBE_DIST, PROBE_FILES, buildCommit, notAskedByPage, probeBuildProblems, probeFiles, probeLeft, publishedProblems } from './worlds.mjs';

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

describe('node tools/worlds.mjs', () => {
  const run = (...args) => spawnSync(process.execPath, [join(root, 'tools/worlds.mjs'), ...args], { cwd: root, encoding: 'utf8', timeout: 30000 });

  it('refuses a folder that is not a build, a flag and a second argument: exit code 2, nothing built', () => {
    for (const args of [[folder({ 'a.txt': 'x' })], ['--frobnicate'], ['dist', 'more']]) {
      const r = run(...args);
      expect({ args, status: r.status }).toEqual({ args, status: 2 });
      expect(r.stderr).toMatch(/Usage: node tools\/worlds\.mjs \[distDir\]/);
    }
  });

  it('tools/e2e.mjs runs it as the step "worlds", after "update", on the dist/ it built', () => {
    const e2e = readFileSync(join(root, 'tools/e2e.mjs'), 'utf8');
    expect(e2e).toContain("run(process.execPath, [join(root, 'tools/worlds.mjs'), join(root, 'dist')]");
    expect(e2e).toMatch(/await step\('update', update\);\n\s+if \(opts\.bail && failed\(\)\) skip\('worlds', '--bail'\);\n\s+else await step\('worlds', worlds\);/);
  });
});
