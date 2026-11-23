// The pure parts of tools/sweet-grey.mjs: its arguments, the walkthrough's environment and the check of its report,
// the time of the route. The run itself (a build, a browser) is not played here.
import { describe, expect, it } from 'vitest';
import { GREY_PARTS, PARTS, PUBLISH_PARTS } from './worlds.mjs';
import { GREY_BUILD } from './world-pass.mjs';
import { LANDMARK_NAMES, PARTS_IN_WORLD, PASS_KINDS, SWEET, WORLD_SKILLS, passEnv, passProblems, readArgs, routeSeconds } from './sweet-grey.mjs';

describe('tools/sweet-grey.mjs', () => {
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
    // every kind a grey build must have is one the pass must have done itself, but the parts it takes inside the chains
    expect([...PASS_KINDS, 'part'].sort()).toEqual(Object.entries(GREY_BUILD).filter(([, n]) => n > 0).map(([k]) => k).sort());
    expect(PARTS_IN_WORLD).toBe(GREY_BUILD.part);
  });

  it('a report is right only when the pass came to the finale in the Sweet Land, every kind done', () => {
    const items = [{ id: 'pastila', kind: 'chain' }, { id: 'toured', kind: 'flyover' }, { id: 'ruby_house', kind: 'part' }, { id: 'ruby_mill', kind: 'part' }, { id: 'final', kind: 'finale' }];
    // the rubies are taken inside the chains: not in the order of the items done by the pass itself
    const report = { world: SWEET, size: 'mobile', online: true, items, order: ['toured', 'pastila', 'final'], worldTasks: ['imbir 2', 'tyanuchka 2'], worldSkills: { 'imbir 2': null, 'tyanuchka 2': 'compare' } };
    expect(passProblems(report)).toEqual([]);
    // the gingerbread house (WORLD-21) and the scales (WORLD-22) are played in the world: a pass that never met them there is wrong
    expect(passProblems({ ...report, worldTasks: [], worldSkills: {} })).toEqual(['no task in the world was played by the pass: the world declares one',
      'the task in the world "imbir 2" was not played by the pass', 'the task in the world "tyanuchka 2" was not played by the pass']);
    expect(passProblems(null)).toHaveLength(1);
    expect(passProblems({ ...report, order: ['pastila', 'toured'] })).toEqual(['no item of kind "finale" was done by the pass']);
    expect(passProblems({ ...report, items: items.filter((i) => i.id !== 'ruby_mill') })).toEqual(['the description has 1 part(s) of the artifact in the world, 2 expected']);
    expect(passProblems({ ...report, world: 'sea' })[0]).toContain('"sea"');
  });

  it('the house is recorded in no skill, the scales in `compare` as a panel task of comparing (the customer\'s decision 2026-11-18)', () => {
    expect(WORLD_SKILLS).toEqual({ 'imbir 2': null, 'tyanuchka 2': 'compare' });
    const items = [{ id: 'pastila', kind: 'chain' }, { id: 'toured', kind: 'flyover' }, { id: 'ruby_house', kind: 'part' }, { id: 'ruby_mill', kind: 'part' }, { id: 'final', kind: 'finale' }];
    const report = { world: SWEET, size: 'mobile', online: true, items, order: ['toured', 'pastila', 'final'], worldTasks: ['imbir 2', 'tyanuchka 2'] };
    expect(passProblems({ ...report, worldSkills: { 'imbir 2': null, 'tyanuchka 2': 'sub' } })).toEqual(['the task in the world "tyanuchka 2" recorded the skill "sub", "compare" expected']);
    expect(passProblems({ ...report, worldSkills: { 'imbir 2': 'classify', 'tyanuchka 2': null } })).toEqual([
      'the task in the world "imbir 2" recorded the skill "classify", no skill expected', 'the task in the world "tyanuchka 2" recorded no skill, "compare" expected']);
    expect(passProblems(report)).toEqual(['the task in the world "imbir 2" recorded nothing the report shows, no skill expected', 'the task in the world "tyanuchka 2" recorded nothing the report shows, "compare" expected']);
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
