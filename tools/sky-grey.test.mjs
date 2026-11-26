// The pure parts of tools/sky-grey.mjs: its arguments, the walkthrough's environment and the check of its report,
// the time of the route. The run itself (a build, a browser) is not played here.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { GREY_PARTS, PARTS, PUBLISH_PARTS } from './worlds.mjs';
import { GREY_BUILD } from './world-pass.mjs';
import { LANDMARK_NAMES, LEG_TARGET, PARTS_IN_WORLD, PASS_KINDS, PASS_TIMEOUT_MS, SECRETS, SKY, WORLD_SKILLS, passEnv, passProblems, passTimeoutMs, readArgs, routeSeconds } from './sky-grey.mjs';

describe('tools/sky-grey.mjs', () => {
  it('has a limit of its own, twice the shared limit of a walkthrough, unless a run asks its own', () => {
    expect(passTimeoutMs({})).toBe(PASS_TIMEOUT_MS);
    expect(PASS_TIMEOUT_MS).toBeGreaterThanOrEqual(2 * 600000);
    expect(passTimeoutMs({ E2E_RUN_TIMEOUT_MS: '90000' })).toBe(90000);
    // tools/worlds.mjs plays the islands with it, not with the shared limit of the other walkthroughs
    const worlds = readFileSync(new URL('./worlds.mjs', import.meta.url), 'utf8');
    expect(worlds).toContain('(out) => skyPassEnv(process.env, out), skyPassTimeoutMs(process.env), skyPassProblems,');
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

  it('plays the islands by their description as a grey build, online, with the voice', () => {
    expect(passEnv({ KEEP: '1' }, '/r.json')).toEqual({ KEEP: '1', E2E_WORLD: 'sky', E2E_WORLD_NEED: 'grey', E2E_WORLD_OUT: '/r.json', E2E_ONLY: '', E2E_MUTE: '0' });
    // every kind a grey build must have is one the pass must have done itself, but the parts it takes inside the chains;
    // and the secrets and the pet the islands have (PLAY-07, PLAY-09), as the Sweet Land's
    expect([...PASS_KINDS.filter((k) => !['secret', 'pet'].includes(k)), 'part'].sort()).toEqual(Object.entries(GREY_BUILD).filter(([, n]) => n > 0).map(([k]) => k).sort());
    expect(PASS_KINDS).toEqual(expect.arrayContaining(['secret', 'pet']));
    expect(SECRETS).toEqual(['sky_chest', 'rainbow_slide', 'cloud_shapes', 'dragon_nest']);
    expect(PARTS_IN_WORLD).toBe(GREY_BUILD.part);
    expect(LEG_TARGET).toEqual([15, 25]);
  });

  it('a report is right only when the pass came to the finale on the islands, every kind done, the two rays, the four secrets, the three tasks in the world', () => {
    const items = [{ id: 'lazur', kind: 'chain' }, { id: 'toured', kind: 'flyover' }, { id: 'ray_clock', kind: 'part' }, { id: 'ray_island', kind: 'part' },
      ...SECRETS.map((id) => ({ id, kind: 'secret' })), { id: 'pet', kind: 'pet' }, { id: 'final', kind: 'finale' }];
    // the rays are taken inside the chains: not in the order of the items done by the pass itself
    const report = { world: SKY, size: 'mobile', online: true, items, order: ['toured', 'lazur', 'pet', ...SECRETS, 'final'], worldTasks: Object.keys(WORLD_SKILLS), worldSkills: { ...WORLD_SKILLS } };
    expect(passProblems(report)).toEqual([]);
    expect(passProblems(null)).toHaveLength(1);
    expect(passProblems({ ...report, order: ['lazur', 'toured', 'pet', ...SECRETS] })).toEqual(['no item of kind "finale" was done by the pass']);
    // Pushok (PLAY-09): a pass that never found him is wrong
    expect(passProblems({ ...report, order: report.order.filter((x) => x !== 'pet') })).toEqual(['no item of kind "pet" was done by the pass']);
    expect(passProblems({ ...report, items: items.filter((i) => i.id !== 'ray_island') })).toEqual(['the description has 1 part(s) of the artifact in the world, 2 expected']);
    // every secret found by the pass, and in the description
    expect(passProblems({ ...report, order: report.order.filter((x) => x !== 'cloud_shapes') })).toEqual(['the secret "cloud_shapes" was not found by the pass']);
    expect(passProblems({ ...report, items: items.filter((i) => i.id !== 'dragon_nest') })).toEqual(['the description has no secret "dragon_nest"']);
    // the bridge, the clock and the winds are played in the world, each recorded where it must be
    expect(passProblems({ ...report, worldTasks: [], worldSkills: {} })[0]).toBe('no task in the world was played by the pass: the world declares one');
    expect(passProblems({ ...report, worldSkills: { ...WORLD_SKILLS, 'mertsal 2': 'pattern' } })).toEqual(['the task in the world "mertsal 2" recorded the skill "pattern", "add" expected']);
    expect(passProblems({ ...report, world: 'sweet' })[0]).toContain('"sweet"');
  });

  it('the cloud bridge is recorded in `add`, the clock\'s last step (the hands) in `add`, the route of the winds in no skill (the customer\'s decisions of 2026-11-18)', () => {
    expect(WORLD_SKILLS).toEqual({ 'lazur 2': 'add', 'mertsal 2': 'add', 'veterok 2': null });
  });


  it('the landmark of every island is named as the scenery names it', () => {
    expect(Object.keys(LANDMARK_NAMES)).toEqual(['castle', 'observatory', 'dragon', 'mills', 'pier', 'far']);
    const src = ['landmarks.ts', 'scenery.ts', 'index.ts'].map((f) => readFileSync(new URL(`../src/worlds/sky/${f}`, import.meta.url), 'utf8')).join('\n');
    for (const names of Object.values(LANDMARK_NAMES)) for (const n of names) expect(src, n).toContain(`'${n}'`);
  });

  it('the time of the route sums its legs, a way walked twice counted twice', () => {
    const legs = [{ from: 'castle', to: 'dragon', walked: 15 }, { from: 'castle', to: 'observatory', walked: 16 }];
    expect(routeSeconds(['castle', 'dragon', 'castle', 'observatory'], legs)).toBe(46);
  });

  it('is a part of tools/worlds.mjs of the grey build: played in ci.yml, never before a publication', () => {
    expect(PARTS).toContain('sky-grey');
    expect(GREY_PARTS).toContain('sky-grey');
    expect(PUBLISH_PARTS).not.toContain('sky-grey');
  });
});
