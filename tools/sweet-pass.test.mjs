// The pure parts of tools/sweet-pass.mjs: the environment of the published Sweet Land's walkthrough and the check of
// its report (the part "sweet" of tools/worlds.mjs once the Sweet Land is published).
import { describe, expect, it } from 'vitest';
import * as grey from './sweet-grey.mjs';
import { NEED, PASS_KINDS, PASS_TIMEOUT_MS, SECRETS, SWEET, WORLD_SKILLS, passEnv, passProblems, passTimeoutMs } from './sweet-pass.mjs';
import { readNeed } from './world-pass.mjs';

/** A report of a walkthrough that came to its end: every chain, the tour, the rubies, the secrets, Zheleyka, the finale, both scenes. */
function report() {
  const items = [
    ...['pastila', 'imbir', 'tyanuchka', 'kakao', 'polosatik'].map((id) => ({ id, kind: 'chain', how: 'act' })),
    { id: 'toured', kind: 'flyover', how: 'auto' }, { id: 'ruby_house', kind: 'part', how: 'act' }, { id: 'ruby_mill', kind: 'part', how: 'act' },
    ...SECRETS.map((id) => ({ id, kind: 'secret', how: 'act' })), { id: 'pet', kind: 'pet', how: 'act' }, { id: 'final', kind: 'finale', how: 'act' },
    { id: 'story_intro', kind: 'scene', how: 'tap' }, { id: 'story_ruby', kind: 'scene', how: 'tap' },
  ];
  return { world: SWEET, size: 'mobile', online: true, need: readNeed(NEED).label, items, order: items.filter((i) => i.kind !== 'part').map((i) => i.id),
    worldTasks: Object.keys(WORLD_SKILLS), worldSkills: { ...WORLD_SKILLS } };
}

describe('tools/sweet-pass.mjs', () => {
  it('plays the Sweet Land in the phone size with the network and the voice, held to the numbers of the template', () => {
    expect(passEnv({ E2E_GL: 'gl', E2E_ONLY: 'shop' }, '/x/pass.json')).toEqual({ E2E_GL: 'gl', E2E_WORLD: 'sweet', E2E_WORLD_NEED: 'template', E2E_WORLD_OUT: '/x/pass.json', E2E_ONLY: '', E2E_MUTE: '0' });
    // the grey build's walkthrough is held to its lesser numbers; the published one is not
    expect(grey.passEnv({}, '/x').E2E_WORLD_NEED).toBe('grey');
  });

  it('the world\'s lists are the grey build\'s, one list for both', () => {
    expect([PASS_KINDS, SECRETS, WORLD_SKILLS, PASS_TIMEOUT_MS]).toEqual([grey.PASS_KINDS, grey.SECRETS, grey.WORLD_SKILLS, grey.PASS_TIMEOUT_MS]);
    expect(PASS_KINDS).toEqual(['chain', 'scene', 'flyover', 'secret', 'pet', 'finale']);
  });

  it('a walkthrough that came to its end has nothing wrong; one checked against a grey build\'s numbers is not enough', () => {
    expect(passProblems(report())).toEqual([]);
    expect(passProblems({ ...report(), need: readNeed('grey').label }).join('; ')).toContain('its description was checked against');
    const r = report();
    r.items = r.items.filter((i) => i.kind !== 'pet'); r.order = r.order.filter((id) => id !== 'pet');
    expect(passProblems(r).join('; ')).toContain('no item of kind "pet"');
  });

  it('says what is missing: no report, a secret not found, a ruby not in the description, a task in the world not played or written to another skill', () => {
    expect(passProblems(null)).toHaveLength(1);
    const r = report();
    r.order = r.order.filter((x) => x !== 'lemonade');
    r.items = r.items.filter((i) => i.id !== 'ruby_mill');
    r.worldTasks = ['imbir 2', 'tyanuchka 2'];
    r.worldSkills = { 'imbir 2': null, 'tyanuchka 2': 'count' };
    expect(passProblems(r)).toEqual([
      'the description has 1 part(s) of the artifact in the world, 2 expected',
      'the secret "lemonade" was not found by the pass',
      'the task in the world "tyanuchka 2" recorded the skill "count", "compare" expected',
      'the task in the world "kakao 0" was not played by the pass',
    ]);
  });

  it('has the limit of its own the grey walkthrough has, unless a run asks its own', () => {
    expect(passTimeoutMs({})).toBe(PASS_TIMEOUT_MS);
    expect(passTimeoutMs({ E2E_RUN_TIMEOUT_MS: '90000' })).toBe(90000);
  });
});
