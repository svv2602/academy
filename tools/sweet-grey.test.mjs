// The pure parts of tools/sweet-grey.mjs: its arguments, the walkthrough's environment and the check of its report,
// the time of the route. The run itself (a build, a browser) is not played here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GREY_PARTS, PARTS, PUBLISH_PARTS } from './worlds.mjs';
import { GREY_BUILD } from './world-pass.mjs';
import { LANDMARK_NAMES, PARTS_IN_WORLD, PASS_KINDS, PASS_TIMEOUT_MS, SECRETS, SWEET, WORLD_SKILLS, passEnv, passProblems, passTimeoutMs, readArgs, routeSeconds } from './sweet-grey.mjs';

/** The secrets of the description (src/worlds/sweet/secrets.ts), each done by the pass. */
const SECRET_ITEMS = SECRETS.map((id) => ({ id, kind: 'secret' }));

describe('tools/sweet-grey.mjs', () => {
  it('has a limit of its own, twice the shared limit of a walkthrough and inside the job, unless a run asks its own', () => {
    expect(passTimeoutMs({})).toBe(PASS_TIMEOUT_MS);
    expect(PASS_TIMEOUT_MS).toBeGreaterThanOrEqual(2 * 600000);
    expect(passTimeoutMs({ E2E_RUN_TIMEOUT_MS: '90000' })).toBe(90000);
    // tools/worlds.mjs plays the Sweet Land with it, not with the shared limit of the other walkthroughs
    const worlds = readFileSync(new URL('./worlds.mjs', import.meta.url), 'utf8');
    expect(worlds).toContain('(out) => sweetPassEnv(process.env, out), sweetPassTimeoutMs(process.env), sweetPassProblems,');
  });

  it('reads its arguments: the chosen stretch 1.6 and q2 by default', () => {
    const o = readArgs([]);
    expect([o.scales, o.q, o.pass, o.measure]).toEqual([[1.6], 2, true, true]);
    expect(readArgs(['--scales', '1,1.6']).scales).toEqual([1, 1.6]);
    expect(readArgs(['--no-pass', '--no-measure'])).toMatchObject({ pass: false, measure: false });
    expect(readArgs(['--scales', '9']).error).toContain('--scales');
    expect(readArgs(['--q', '3']).error).toContain('--q');
    expect(readArgs(['--x']).error).toBe('unknown argument "--x"');
  });

  it('plays the Sweet Land by its description as a grey build, online, with the voice', () => {
    expect(passEnv({ KEEP: '1' }, '/r.json')).toEqual({ KEEP: '1', E2E_WORLD: 'sweet', E2E_WORLD_NEED: 'grey', E2E_WORLD_OUT: '/r.json', E2E_ONLY: '', E2E_MUTE: '0' });
    // every kind a grey build must have is one the pass must have done itself, but the parts it takes inside the chains;
    // and the secrets the Sweet Land has (PLAY-07), as the sea's
    expect([...PASS_KINDS.filter((k) => k !== 'secret'), 'part'].sort()).toEqual(Object.entries(GREY_BUILD).filter(([, n]) => n > 0).map(([k]) => k).sort());
    expect(PASS_KINDS).toContain('secret');
    expect(SECRETS).toEqual(['candy_box', 'cotton_cloud', 'lemonade', 'bubble_gum']);
    expect(PARTS_IN_WORLD).toBe(GREY_BUILD.part);
  });

  it('a report is right only when the pass came to the finale in the Sweet Land, every kind done', () => {
    const items = [{ id: 'pastila', kind: 'chain' }, { id: 'toured', kind: 'flyover' }, { id: 'ruby_house', kind: 'part' }, { id: 'ruby_mill', kind: 'part' }, ...SECRET_ITEMS, { id: 'final', kind: 'finale' }];
    // the rubies are taken inside the chains: not in the order of the items done by the pass itself
    const report = { world: SWEET, size: 'mobile', online: true, items, order: ['toured', 'pastila', ...SECRETS, 'final'], worldTasks: ['imbir 2', 'tyanuchka 2', 'kakao 0'], worldSkills: { 'imbir 2': null, 'tyanuchka 2': 'compare', 'kakao 0': 'classify' } };
    expect(passProblems(report)).toEqual([]);
    // the gingerbread house (WORLD-21), the scales (WORLD-22) and the bridge (WORLD-20) are played in the world: a pass that never met them there is wrong
    expect(passProblems({ ...report, worldTasks: [], worldSkills: {} })).toEqual(['no task in the world was played by the pass: the world declares one',
      'the task in the world "imbir 2" was not played by the pass', 'the task in the world "tyanuchka 2" was not played by the pass', 'the task in the world "kakao 0" was not played by the pass']);
    expect(passProblems({ ...report, worldTasks: ['imbir 2', 'tyanuchka 2'] })).toEqual(['the task in the world "kakao 0" was not played by the pass']);
    expect(passProblems(null)).toHaveLength(1);
    expect(passProblems({ ...report, order: ['pastila', 'toured', ...SECRETS] })).toEqual(['no item of kind "finale" was done by the pass']);
    // every secret found by the pass, and in the description
    expect(passProblems({ ...report, order: report.order.filter((x) => x !== 'lemonade') })).toEqual(['the secret "lemonade" was not found by the pass']);
    expect(passProblems({ ...report, items: items.filter((i) => i.id !== 'bubble_gum') })).toEqual(['the description has no secret "bubble_gum"']);
    expect(passProblems({ ...report, items: items.filter((i) => i.id !== 'ruby_mill') })).toEqual(['the description has 1 part(s) of the artifact in the world, 2 expected']);
    expect(passProblems({ ...report, world: 'sea' })[0]).toContain('"sea"');
  });

  it('the house is recorded in no skill, the scales in `compare`, the bridge in `classify` - each as a panel task of its skill (the customer\'s decision 2026-11-18)', () => {
    expect(WORLD_SKILLS).toEqual({ 'imbir 2': null, 'tyanuchka 2': 'compare', 'kakao 0': 'classify' });
    const items = [{ id: 'pastila', kind: 'chain' }, { id: 'toured', kind: 'flyover' }, { id: 'ruby_house', kind: 'part' }, { id: 'ruby_mill', kind: 'part' }, ...SECRET_ITEMS, { id: 'final', kind: 'finale' }];
    const report = { world: SWEET, size: 'mobile', online: true, items, order: ['toured', 'pastila', ...SECRETS, 'final'], worldTasks: ['imbir 2', 'tyanuchka 2', 'kakao 0'] };
    expect(passProblems({ ...report, worldSkills: { 'imbir 2': null, 'tyanuchka 2': 'sub', 'kakao 0': 'classify' } })).toEqual(['the task in the world "tyanuchka 2" recorded the skill "sub", "compare" expected']);
    expect(passProblems({ ...report, worldSkills: { 'imbir 2': 'classify', 'tyanuchka 2': null, 'kakao 0': 'classify' } })).toEqual([
      'the task in the world "imbir 2" recorded the skill "classify", no skill expected', 'the task in the world "tyanuchka 2" recorded no skill, "compare" expected']);
    expect(passProblems({ ...report, worldSkills: { 'imbir 2': null, 'tyanuchka 2': 'compare', 'kakao 0': 'memory' } })).toEqual(['the task in the world "kakao 0" recorded the skill "memory", "classify" expected']);
    expect(passProblems({ ...report, worldSkills: { 'imbir 2': null, 'tyanuchka 2': 'compare', 'kakao 0': null } })).toEqual(['the task in the world "kakao 0" recorded no skill, "classify" expected']);
    expect(passProblems(report)).toEqual(['the task in the world "imbir 2" recorded nothing the report shows, no skill expected', 'the task in the world "tyanuchka 2" recorded nothing the report shows, "compare" expected',
      'the task in the world "kakao 0" recorded nothing the report shows, "classify" expected']);
  });

  it('the route\'s time sums the ways it walks, twice for one walked there and back', () => {
    const legs = [{ from: 'a', to: 'b', walked: 10 }, { from: 'b', to: 'c', walked: 5 }];
    expect(routeSeconds(['a', 'b', 'c', 'b', 'a'], legs)).toBe(30);
  });

  it('knows the landmark of every zone of the map', () => {
    expect(Object.keys(LANDMARK_NAMES).sort()).toEqual(['bridge', 'garden', 'market', 'mill', 'palace', 'square', 'town']);
    for (const names of Object.values(LANDMARK_NAMES)) expect(names[0]).toMatch(/^landmark-/);
  });

  it('is a part of tools/worlds.mjs of the grey build: played in ci.yml, never before a publication', () => {
    expect(PARTS).toContain('sweet-grey');
    expect(GREY_PARTS).toEqual(['hub-grey', 'sweet-grey', 'sea-grey']);
    expect(PUBLISH_PARTS).not.toContain('sweet-grey');
  });
});
