// The pure parts of tools/forest-pass.mjs: the environment of the forest's walkthrough and the check of its report, the
// part "forest" of tools/worlds.mjs (in the published build, a job of both workflows: it holds a publication).
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { FOREST, PASS_KINDS, PASS_TIMEOUT_MS, SECRETS, WORLD_SKILLS, passEnv, passProblems, passTimeoutMs } from './forest-pass.mjs';
import { GREY_PARTS, NO_PROBE_PARTS, PARTS, PUBLISH_PARTS } from './worlds.mjs';

/** A report of a walkthrough that came to its end, as the forest's grey pass wrote it: every chain, the tour, the leaves, the secrets, the owlet, the finale. */
function report() {
  const items = [
    ...['borovik', 'mudrena', 'shustrik', 'yasen', 'kolyuchka'].map((id) => ({ id, kind: 'chain', how: 'act' })),
    { id: 'pet', kind: 'pet', how: 'act' }, { id: 'story_intro', kind: 'scene', how: 'tap' }, { id: 'toured', kind: 'flyover', how: 'auto' },
    { id: 'leaf_hollow', kind: 'part', how: 'walk' }, { id: 'leaf_maze', kind: 'part', how: 'walk' },
    ...SECRETS.map((id) => ({ id, kind: 'secret', how: 'walk' })), { id: 'final', kind: 'finale', how: 'act' }, { id: 'story_emerald', kind: 'scene', how: 'tap' },
  ];
  return { world: FOREST, size: 'mobile', online: true, need: 'the numbers of the world template', items, order: items.filter((i) => i.kind !== 'part').map((i) => i.id),
    worldTasks: Object.keys(WORLD_SKILLS), worldSkills: { ...WORLD_SKILLS }, check: { maze: { forks: 6, filled: 6, rings: 0, fills: 6, refusals: 1 } } };
}

describe('tools/forest-pass.mjs', () => {
  it('plays the forest in the phone size with the network and the voice, its report where it is asked', () => {
    expect(passEnv({ E2E_GL: 'gl', E2E_ONLY: 'shop' }, '/x/pass.json')).toEqual({ E2E_GL: 'gl', E2E_WORLD: 'forest', E2E_WORLD_NEED: 'template', E2E_WORLD_OUT: '/x/pass.json', E2E_ONLY: '', E2E_MUTE: '0' });
  });

  it('a walkthrough that came to its end has nothing wrong', () => {
    expect(passProblems(report())).toEqual([]);
    expect(PASS_KINDS).toEqual(['chain', 'scene', 'flyover', 'secret', 'pet', 'finale']);
  });

  it('its secrets are the forest\'s own (src/worlds/forest/secrets.ts), and Mudrena\'s steps write the skill "series"', () => {
    const src = readFileSync(new URL('../src/worlds/forest/secrets.ts', import.meta.url), 'utf8');
    const flags = Object.fromEntries([...src.matchAll(/(\w+_FLAG) = '(\w+)'/g)].map((m) => [m[1], m[2]]));
    const list = /FOREST_SECRETS = \[([^\]]*)\]/.exec(src)[1].split(',').map((x) => flags[x.trim()]);
    expect(SECRETS).toEqual(list);
    expect(WORLD_SKILLS).toEqual({ 'mudrena 1': 'series' });
  });

  it('says what is missing: no report, the owlet not found, a secret not found, a leaf not in the description, the steps not played or written to another skill', () => {
    expect(passProblems(null)).toEqual(['it left no report of the pass: it did not come to the end of the description']);
    const r = report();
    r.items = r.items.filter((i) => i.id !== 'leaf_maze' && i.kind !== 'pet');
    r.order = r.order.filter((id) => id !== 'ring' && id !== 'pet');
    r.worldSkills = { 'mudrena 1': 'count' };
    expect(passProblems(r)).toEqual([
      'no item of kind "pet" was done by the pass',
      'the description has 1 part(s) of the artifact in the world, 2 expected',
      'the secret "ring" was not found by the pass',
      'the task in the world "mudrena 1" recorded the skill "count", "series" expected',
    ]);
    expect(passProblems({ ...report(), worldTasks: [] }).join('; ')).toContain('the task in the world "mudrena 1" was not played by the pass');
    // the cutscenes are the template's: a pass that skipped them is not the forest played whole
    expect(passProblems({ ...report(), order: report().order.filter((id) => !id.startsWith('story_')) })).toEqual(['no item of kind "scene" was done by the pass']);
    // a description checked against a grey build's lesser numbers is not enough for a published world
    expect(passProblems({ ...report(), need: 'what a grey build has (WORLD-12)' })).toEqual(['its description was checked against what a grey build has (WORLD-12), not the numbers of the world template']);
  });

  it('the maze: every row full by its stone\'s jump, no ring empty, a wrong way\'s stone hopped back (the customer\'s word of 2026-11-26)', () => {
    const maze = (o) => ({ ...report(), check: { maze: { forks: 6, filled: 6, rings: 0, fills: 6, refusals: 1, ...o } } });
    expect(passProblems(maze({ refusals: 3 }))).toEqual([]);
    expect(passProblems(maze({ filled: 5, rings: 1, fills: 5 }))).toEqual([
      'the maze walked through shows 5 of 6 rows full, 1 ring(s) empty',
      '5 stone(s) of the right ways jumped into their rings, 6 expected (one a fork)',
    ]);
    expect(passProblems(maze({ refusals: 0 }))).toEqual(['no stone of a wrong way hopped back: the pass walked a wrong way and back at its first fork']);
    expect(passProblems({ ...report(), check: null })).toEqual(['the forest reported nothing of its maze (__game.worldCheck)']);
  });

  it('has a limit of its own, unless a run asks its own', () => {
    expect(passTimeoutMs({})).toBe(PASS_TIMEOUT_MS);
    expect(passTimeoutMs({ E2E_RUN_TIMEOUT_MS: '90000' })).toBe(90000);
  });

  it('is a part of tools/worlds.mjs of the published build: played before a publication, no probe build for it', () => {
    expect(PARTS).toContain('forest');
    expect(PUBLISH_PARTS).toContain('forest');
    expect(GREY_PARTS).not.toContain('forest');
    expect(NO_PROBE_PARTS).toContain('forest');
  });
});
