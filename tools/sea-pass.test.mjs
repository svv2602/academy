// The pure parts of tools/sea-pass.mjs: the environment of the sea's walkthrough and the check of its report, the part
// "sea-grey" of tools/worlds.mjs (a job of ci.yml, never before a publication).
import { describe, expect, it } from 'vitest';
import { PASS_KINDS, SEA, SECRETS, WORLD_SKILLS, passEnv, passProblems } from './sea-pass.mjs';
import { GREY_PARTS, PARTS, PUBLISH_PARTS } from './worlds.mjs';

/** A report of a walkthrough that came to its end: every chain, the tour, the pearls, the secrets, the finale. */
function report() {
  const items = [
    ...['khvylia', 'bulk', 'pantsyr', 'kleshnya', 'iskorka'].map((id) => ({ id, kind: 'chain', how: 'act' })),
    { id: 'toured', kind: 'flyover', how: 'auto' }, { id: 'pearl_reef', kind: 'part', how: 'walk' }, { id: 'pearl_ship', kind: 'part', how: 'act' },
    ...SECRETS.map((id) => ({ id, kind: 'secret', how: 'act' })), { id: 'final', kind: 'finale', how: 'act' },
  ];
  return { world: SEA, size: 'mobile', online: true, need: 'grey', items, order: items.filter((i) => i.kind !== 'part').map((i) => i.id),
    worldTasks: Object.keys(WORLD_SKILLS), worldSkills: { ...WORLD_SKILLS } };
}

describe('tools/sea-pass.mjs', () => {
  it('plays the sea in the phone size with the network and the voice, its report where it is asked', () => {
    expect(passEnv({ E2E_GL: 'gl', E2E_ONLY: 'shop' }, '/x/pass.json')).toEqual({ E2E_GL: 'gl', E2E_WORLD: 'sea', E2E_WORLD_NEED: 'grey', E2E_WORLD_OUT: '/x/pass.json', E2E_ONLY: '', E2E_MUTE: '0' });
  });

  it('a walkthrough that came to its end has nothing wrong', () => {
    expect(passProblems(report())).toEqual([]);
    expect(PASS_KINDS).toEqual(['chain', 'flyover', 'secret', 'finale']);
  });

  it('says what is missing: no report, a secret not found, a pearl not in the description, a task in the world not played or written to another skill', () => {
    expect(passProblems(null)).toHaveLength(1);
    const r = report();
    r.order = r.order.filter((x) => x !== 'whale');
    r.items = r.items.filter((i) => i.id !== 'pearl_ship');
    r.worldTasks = ['khvylia 2'];
    r.worldSkills = { 'khvylia 2': 'count' };
    expect(passProblems(r)).toEqual([
      'the description has 1 part(s) of the artifact in the world, 2 expected',
      'the secret "whale" was not found by the pass',
      'the task in the world "khvylia 2" recorded the skill "count", "compose" expected',
      'the task in the world "pantsyr 0" was not played by the pass',
    ]);
  });

  it('is a part of tools/worlds.mjs of the grey build: played in ci.yml, never before a publication', () => {
    expect(PARTS).toContain('sea-grey');
    expect(GREY_PARTS).toContain('sea-grey');
    expect(PUBLISH_PARTS).not.toContain('sea-grey');
  });
});
