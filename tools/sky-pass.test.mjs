// The pure parts of tools/sky-pass.mjs: the environment of the published Sky Islands' walkthrough and the check of its
// report (a part "sky" of tools/worlds.mjs once the Sky Islands are published).
import { describe, expect, it } from 'vitest';
import * as grey from './sky-grey.mjs';
import { NEED, PASS_KINDS, PASS_TIMEOUT_MS, SECRETS, SKY, WORLD_SKILLS, passEnv, passProblems, passTimeoutMs } from './sky-pass.mjs';
import { readNeed } from './world-pass.mjs';
import { GREY_PARTS, PARTS, PUBLISH_PARTS } from './worlds.mjs';

/** A report of a walkthrough that came to its end: every chain, the tour, the rays, the secrets, Pushok, the finale. */
function report() {
  const items = [
    ...['lazur', 'gromykhalo', 'mertsal', 'veterok', 'chirika'].map((id) => ({ id, kind: 'chain', how: 'act' })),
    { id: 'toured', kind: 'flyover', how: 'auto' }, { id: 'ray_clock', kind: 'part', how: 'act' }, { id: 'ray_island', kind: 'part', how: 'act' },
    ...SECRETS.map((id) => ({ id, kind: 'secret', how: 'act' })), { id: 'pet', kind: 'pet', how: 'act' }, { id: 'final', kind: 'finale', how: 'act' },
  ];
  return { world: SKY, size: 'mobile', online: true, need: readNeed(NEED).label, items, order: items.filter((i) => i.kind !== 'part').map((i) => i.id),
    worldTasks: Object.keys(WORLD_SKILLS), worldSkills: { ...WORLD_SKILLS } };
}

describe('tools/sky-pass.mjs', () => {
  it('plays the Sky Islands in the phone size with the network and the voice, held to the numbers of the template', () => {
    expect(passEnv({ E2E_GL: 'gl', E2E_ONLY: 'shop' }, '/x/pass.json')).toEqual({ E2E_GL: 'gl', E2E_WORLD: 'sky', E2E_WORLD_NEED: 'template', E2E_WORLD_OUT: '/x/pass.json', E2E_ONLY: '', E2E_MUTE: '0' });
    // the grey build's walkthrough is held to its lesser numbers; the published one is not
    expect(grey.passEnv({}, '/x').E2E_WORLD_NEED).toBe('grey');
  });

  it('the world\'s lists are the grey build\'s, one list for both', () => {
    expect([PASS_KINDS, SECRETS, WORLD_SKILLS, PASS_TIMEOUT_MS]).toEqual([grey.PASS_KINDS, grey.SECRETS, grey.WORLD_SKILLS, grey.PASS_TIMEOUT_MS]);
  });

  it('a walkthrough that came to its end has nothing wrong; one checked against a grey build\'s numbers is not enough', () => {
    expect(passProblems(report())).toEqual([]);
    expect(passProblems({ ...report(), need: readNeed('grey').label }).join('; ')).toContain('its description was checked against');
    const r = report();
    r.items = r.items.filter((i) => i.kind !== 'pet'); r.order = r.order.filter((id) => id !== 'pet');
    expect(passProblems(r).join('; ')).toContain('no item of kind "pet"');
  });

  it('says what is missing: no report, a secret not found, a ray not in the description, a task in the world not played or written to another skill', () => {
    expect(passProblems(null)).toHaveLength(1);
    const r = report();
    r.order = r.order.filter((x) => x !== 'rainbow_slide');
    r.items = r.items.filter((i) => i.id !== 'ray_island');
    r.worldTasks = ['lazur 2', 'mertsal 2'];
    r.worldSkills = { 'lazur 2': 'add', 'mertsal 2': 'count' };
    expect(passProblems(r)).toEqual([
      'the description has 1 part(s) of the artifact in the world, 2 expected',
      'the secret "rainbow_slide" was not found by the pass',
      'the task in the world "mertsal 2" recorded the skill "count", "add" expected',
      'the task in the world "veterok 2" was not played by the pass',
    ]);
  });

  it('has the limit of its own the grey walkthrough has, unless a run asks its own', () => {
    expect(passTimeoutMs({})).toBe(PASS_TIMEOUT_MS);
    expect(passTimeoutMs({ E2E_RUN_TIMEOUT_MS: '90000' })).toBe(90000);
  });

  it('is not a part of tools/worlds.mjs yet: the islands are grey until the customer\'s word, their grey walkthrough plays them', () => {
    expect(PARTS).not.toContain('sky');
    expect(PUBLISH_PARTS).not.toContain('sky');
    expect(GREY_PARTS).toContain('sky-grey');
  });
});
