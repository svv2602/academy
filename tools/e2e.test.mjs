// Runs in `npm test`. CI plays each screen size in a job of its own and then runs `tools/e2e.mjs --combine` over what
// the four walkthroughs left behind; the job "check" that runs it is the one status the protection of main requires.
// So --combine must fail whenever one size is missing, is of another commit or did not pass, when no size was played
// without the voice, and when the requested models differ from tools/models-used.json - checked here on prepared files.
// Plain .mjs on purpose: the project has no @types/node and tsconfig.json type-checks everything under src/.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { outputs, pick } from './ci-pieces.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SIZES = ['mobile', 'desktop', 'desktop-tall', 'mobile-portrait'];
const models = JSON.parse(readFileSync(join(root, 'tools/models-used.json'), 'utf8'));
// The commit tools/e2e.mjs works out for these sources, the same way.
const commit = (() => {
  try {
    const out = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return /^[0-9a-f]{4,40}$/.test(out) ? out : 'no-git';
  } catch { return 'no-git'; }
})();
const dirs = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });

/** What four green walkthroughs leave behind, with `change` applied: { file name: content, or null to leave it out }. */
function results(change = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-combine-'));
  dirs.push(dir);
  const files = {};
  for (const mode of SIZES) {
    const mute = mode === 'desktop-tall';
    files[`summary-${mode}.json`] = { mode, commit, walkthrough: 'ok', note: '', passed: true, ...(mode === 'mobile' ? { failureScreens: 'ok' } : {}) };
    files[`voice-${mode}.json`] = { mute, clips: 110, loud: mute ? 0 : 110 };
    // as in a real run, one size alone does not request every model: the phone gets one half, the desktop the rest
    files[`models-requested-${mode}.json`] = mode === 'mobile' ? models.slice(0, 40) : mode === 'desktop' ? models.slice(30) : models.slice(0, 10);
  }
  Object.assign(files, change);
  for (const [name, content] of Object.entries(files)) if (content !== null) writeFileSync(join(dir, name), JSON.stringify(content));
  return dir;
}
function combine(dir, ...extra) {
  const env = { ...process.env };
  delete env.E2E_MUTE;
  delete env.E2E_NET;
  const r = spawnSync(process.execPath, [join(root, 'tools/e2e.mjs'), '--combine', dir, ...extra], { cwd: root, encoding: 'utf8', env, timeout: 30000 });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('tools/e2e.mjs E2E_NET: the network of a walkthrough chosen by hand (a trial of one piece, try.yml)', () => {
  const src = readFileSync(join(root, 'tools/e2e.mjs'), 'utf8');
  it('anything but "net" and "offline" is refused before anything is played: exit code 2', () => {
    for (const value of ['wifi', '1', 'OFFLINE', 'net,offline']) {
      const r = spawnSync(process.execPath, [join(root, 'tools/e2e.mjs'), '--skip-build', '--mode', 'mobile'], { cwd: root, encoding: 'utf8', env: { ...process.env, E2E_NET: value }, timeout: 30000 });
      expect({ value, code: r.status }).toEqual({ value, code: 2 });
      expect(r.stderr).toContain(`bad E2E_NET "${value}": expected net or offline`);
    }
  });

  it('without it the size decides, as always: only the desktop is played without the network', () => {
    expect(src).toContain("const OFFLINE_MODES = ['desktop'];");
    expect(src).toContain("const offline = (mode) => (process.env.E2E_NET ? process.env.E2E_NET === 'offline' : OFFLINE_MODES.includes(mode));");
  });

  it('the walkthrough is told, and named, by the one answer: nothing else reads the list of sizes', () => {
    expect(src).toContain("E2E_OFFLINE: offline(mode) ? '1' : '0'");
    expect(src).toContain("${offline(mode) ? ' (offline)' : ''}");
    expect(src.match(/OFFLINE_MODES/g)).toHaveLength(2);   // the list and the default of offline()
  });
});
const summary = (mode, change) => ({ [`summary-${mode}.json`]: { mode, commit, walkthrough: 'ok', note: '', passed: true, ...(mode === 'mobile' ? { failureScreens: 'ok' } : {}), ...change } });

describe('tools/e2e.mjs --combine: the checks over the walkthroughs CI plays in separate jobs', () => {
  it('passes when all four sizes passed on this commit, one of them without the voice, and the models add up', () => {
    const r = combine(results());
    expect(r.out).toContain('[e2e] PASSED');
    expect(r.out).toMatch(/walkthroughs +ok/);
    expect(r.out).toMatch(/silent walkthrough +ok .*desktop-tall/);
    expect(r.out).toMatch(/models used +ok/);
    expect(r.code, r.out).toBe(0);
  });

  it.each(SIZES)('fails when the walkthrough of %s left no summary (its job failed early or was not run)', (mode) => {
    const r = combine(results({ [`summary-${mode}.json`]: null }));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain(`${mode}: no summary of its walkthrough`);
  });

  it('fails when a summary is of another commit: an old result must not stand in for this one', () => {
    const r = combine(results(summary('desktop', { commit: 'abc1234' === commit ? 'abc1235' : 'abc1234' })));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('desktop: played on commit');
  });

  it('fails when a walkthrough failed, and names it', () => {
    const r = combine(results(summary('mobile-portrait', { walkthrough: 'FAILED', note: 'tools/shot.mjs exited with code 1', passed: false })));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('mobile-portrait: the walkthrough FAILED — tools/shot.mjs exited with code 1');
  });

  it('fails when the walkthrough passed but another step of that run did not (dist links, the server)', () => {
    const r = combine(results(summary('mobile', { passed: false })));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('mobile: the walkthrough passed, but another step of that run failed');
  });

  it('fails when the job of the phone size did not play the failure screens, or they failed', () => {
    const none = combine(results(summary('mobile', { failureScreens: undefined })));
    expect(none.code, none.out).toBe(1);
    expect(none.out).toContain('mobile: the failure screens were not played by its run');
    const red = combine(results(summary('mobile', { failureScreens: 'FAILED', passed: false })));
    expect(red.code, red.out).toBe(1);
  });

  it('fails when a summary is of another size', () => {
    const r = combine(results({ 'summary-desktop.json': { mode: 'mobile', commit, walkthrough: 'ok', note: '', passed: true } }));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('desktop: the summary is of "mobile"');
  });

  it('fails when no size was played without the voice', () => {
    const r = combine(results({ 'voice-desktop-tall.json': { mute: false, clips: 110, loud: 110 } }));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('none of the 4 walkthroughs was played without the voice');
  });

  it('fails when the models requested over all sizes differ from tools/models-used.json', () => {
    const r = combine(results({ 'models-requested-desktop.json': models.slice(30, -1) }));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('in the list, but not requested in any walkthrough');
    expect(r.out).toContain(models.at(-1));
  });

  it('takes no other flag', () => {
    expect(combine(results(), '--mode', 'mobile').code).toBe(2);
    expect(combine(results(), '--skip-build').code).toBe(2);
    expect(spawnSync(process.execPath, [join(root, 'tools/e2e.mjs'), '--combine'], { cwd: root, encoding: 'utf8' }).status).toBe(2);
  });
});

// CI may play the world in pieces (npm run e2e -- --only <group>): one job per size and group, each leaving files
// named <size>-<group>. --combine --only / --jobs must then expect every one of them, and still every size played whole.
const PIECES = ['world1', 'world2', 'finale', 'shop', 'tasks2', 'collect'];
/** What the 20 green walkthroughs of the pieces in four sizes leave behind, with `change` applied. */
function pieces(change = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'e2e-combine-'));
  dirs.push(dir);
  const files = {};
  for (const mode of SIZES) for (const group of PIECES) {
    const id = `${mode}-${group}`, mute = mode === 'desktop-tall';
    files[`summary-${id}.json`] = { mode, group, commit, walkthrough: 'ok', note: '', passed: true, ...(mode === 'mobile' && group === 'shop' ? { failureScreens: 'ok' } : {}) };
    files[`voice-${id}.json`] = { mute, clips: 30, loud: mute ? 0 : 30 };
    // every piece requests a part of the models; all of them together, every model
    files[`models-requested-${id}.json`] = models.filter((_, i) => i % PIECES.length === PIECES.indexOf(group));
  }
  Object.assign(files, change);
  for (const [name, content] of Object.entries(files)) if (content !== null) writeFileSync(join(dir, name), JSON.stringify(content));
  return dir;
}
const jobList = (skip = []) => SIZES.flatMap((m) => PIECES.map((p) => `${m}:${p}`)).filter((j) => !skip.includes(j)).join(',');

describe('tools/e2e.mjs --combine with groups: the world played in pieces', () => {
  it('passes when every piece of every size passed, desktop-tall in silence, and the models add up (--only)', () => {
    const r = combine(pieces(), '--only', PIECES.join(','));
    expect(r.out).toMatch(/walkthroughs +ok/);
    expect(r.out).toMatch(/silent walkthrough +ok .*desktop-tall/);
    expect(r.out).toMatch(/models used +ok/);
    expect(r.code, r.out).toBe(0);
  });

  it('passes the same with the walkthroughs listed one by one (--jobs)', () => {
    const r = combine(pieces(), '--jobs', jobList());
    expect(r.code, r.out).toBe(0);
  });

  it('fails when the walkthrough of one piece left no summary, and names it', () => {
    const r = combine(pieces({ 'summary-desktop-finale.json': null }), '--only', PIECES.join(','));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('desktop finale: no summary of its walkthrough');
  });

  it('fails when the listed walkthroughs leave out a piece of a size: the whole world must be played in each', () => {
    const r = combine(pieces(), '--jobs', jobList(['mobile-portrait:shop']));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('mobile-portrait: the walkthroughs listed do not play the whole world');
    const some = combine(pieces(), '--only', 'world1,world2');
    expect(some.code, some.out).toBe(1);
    expect(some.out).toContain('desktop: the walkthroughs listed do not play the whole world');
  });

  it('fails when a summary is of another group', () => {
    const r = combine(pieces({ 'summary-mobile-world2.json': { mode: 'mobile', group: 'world1', commit, walkthrough: 'ok', note: '', passed: true } }), '--only', PIECES.join(','));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('mobile world2: the summary is of the group "world1"');
  });

  it('fails when the phone\'s shop did not play the failure screens, or no listed walkthrough does', () => {
    const none = combine(pieces({ 'summary-mobile-shop.json': { mode: 'mobile', group: 'shop', commit, walkthrough: 'ok', note: '', passed: true } }), '--only', PIECES.join(','));
    expect(none.code, none.out).toBe(1);
    expect(none.out).toContain('mobile shop: the failure screens were not played by its run');
    const nobody = combine(pieces(), '--jobs', `${jobList(['mobile:shop'])},mobile:tasks`);
    expect(nobody.code, nobody.out).toBe(1);
    expect(nobody.out).toContain('no walkthrough listed plays the failure screens');
  });

  it('fails when one piece of the silent size was played with the voice: the game in silence is the whole world', () => {
    const r = combine(pieces({ 'voice-desktop-tall-shop.json': { mute: false, clips: 30, loud: 30 } }), '--only', PIECES.join(','));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('none of the 4 walkthroughs was played without the voice');
  });

  it('fails when the models requested by all the pieces differ from tools/models-used.json', () => {
    const lost = models.filter((_, i) => i % PIECES.length === 0);
    const change = Object.fromEntries(SIZES.map((m) => [`models-requested-${m}-world1.json`, lost.slice(1)]));
    const r = combine(pieces(change), '--only', PIECES.join(','));
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain(lost[0]);
  });

  it('refuses an unknown group, a bad list, --jobs without --combine and --jobs with --only', () => {
    expect(combine(pieces(), '--only', 'world1,nosuch').code).toBe(2);
    expect(combine(pieces(), '--jobs', 'mobile:nosuch').code).toBe(2);
    expect(combine(pieces(), '--jobs', 'tablet:world1').code).toBe(2);
    expect(combine(pieces(), '--jobs', jobList(), '--only', 'shop').code).toBe(2);
    expect(spawnSync(process.execPath, [join(root, 'tools/e2e.mjs'), '--jobs', 'mobile'], { cwd: root, encoding: 'utf8' }).status).toBe(2);
    expect(spawnSync(process.execPath, [join(root, 'tools/e2e.mjs'), '--only', 'nosuch'], { cwd: root, encoding: 'utf8' }).status).toBe(2);
  });
});

// ci.yml takes the list of walkthroughs from its job "plan" (tools/ci-pieces.mjs) and hands the same list to
// --combine --jobs; its walkthrough jobs switch the step "worlds" off (E2E_WORLDS=0): the probe world has its own job.
describe('tools/e2e.mjs and the plan of CI', () => {
  it('the list the plan gives when everything is played is one --combine --jobs accepts: every size whole, the failure screens in it', () => {
    const all = combine(pieces(), '--jobs', outputs(pick(null)).jobs);
    expect(all.out).toMatch(/walkthroughs +ok/);
    expect(all.code, all.out).toBe(0);
    const firstWorld = combine(pieces(), '--jobs', outputs(pick(['src/worlds/fairy/index.ts'])).jobs);
    expect(firstWorld.code, firstWorld.out).toBe(0);
  });

  it('a walkthrough of that list that left no result fails --combine', () => {
    const r = combine(pieces({ 'summary-mobile-portrait-world2.json': null }), '--jobs', outputs(pick(null)).jobs);
    expect(r.code, r.out).toBe(1);
    expect(r.out).toContain('mobile-portrait world2: no summary of its walkthrough');
  });

  it('E2E_WORLDS takes 0 or 1; anything else is refused at once, not read as "off"', () => {
    const run = (value) => {
      const env = { ...process.env, E2E_WORLDS: value };
      delete env.E2E_MUTE;
      const r = spawnSync(process.execPath, [join(root, 'tools/e2e.mjs'), '--combine', pieces(), '--jobs', jobList()], { cwd: root, encoding: 'utf8', env, timeout: 30000 });
      return { code: r.status, out: `${r.stdout}${r.stderr}` };
    };
    for (const bad of ['off', 'false', '2', '00']) {
      const r = run(bad);
      expect(r.code, r.out).toBe(2);
      expect(r.out).toContain(`[e2e] bad E2E_WORLDS "${bad}": expected 0 or 1`);
    }
    for (const good of ['0', '1', '']) expect(run(good).code, good).toBe(0);
  });

  // The step itself cannot be played in a unit test (it needs a build and Chrome), so its switch is pinned as text:
  // off only with E2E_WORLDS=0, and then the summary names the step as skipped with the reason.
  it('the step "worlds" is left out only with E2E_WORLDS=0, and is then listed as skipped', () => {
    const src = readFileSync(join(root, 'tools/e2e.mjs'), 'utf8');
    expect(src).toContain("\nconst switchedOff = process.env.E2E_WORLDS === '0' ? { worlds: 'E2E_WORLDS=0: the probe world is played elsewhere (in CI: by the job \"worlds\")' } : {};\n");
    expect(src).toContain("async function step(name, fn) {\n"
      + "  // A step switched off for this run is not played: it is listed as skipped, with the reason.\n"
      + "  if (Object.hasOwn(switchedOff, name)) { skip(name, switchedOff[name]); console.log(`\\n[e2e] ${name}: skipped — ${switchedOff[name]}`); return true; }\n");
    expect(src).toContain("      else await step('worlds', worlds);\n");
    expect(src.split('switchedOff')).toHaveLength(5);   // defined once, read in step() only
  });
});
