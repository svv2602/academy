// @vitest-environment happy-dom
/**
 * The tracks on the ground (./tracks.ts, WORLD-15): the nuts by the level of counting, the prints laid from Shustrik to
 * every nut, a nut found by walking into it; the search records nothing, the question of counting at its end goes to
 * "count" (LEARN-02); a question closed waits and is asked again; the step is done once it is answered.
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { defaultSave, worldState } from '../../core/save';
import { createRng } from '../../core/rng';
import type { TaskResult } from '../../game/taskviews/panel';

let answer: TaskResult = { solved: true, wrong: 1 };
const asked: { thing: string; n: number }[] = [];
vi.mock('../../game/taskviews/panel', () => ({ showTask: async (spec: { body: { thing: string; n: number } }) => { asked.push({ thing: spec.body.thing, n: spec.body.n }); return answer; }, answerOf: () => ({}) }));
vi.mock('../../core/audio', async (orig) => ({ ...(await orig<object>()), sfx: vi.fn() }));

// the forest's texts, as the game adds them before its start screen (src/main.ts)
const { addStrings } = await import('../../ui/strings');
addStrings((await import('./strings')).strings, false);
const { createNutsSearch, nutsFor, FIND_R, OFF } = await import('./tracks');
const { lineDist } = await import('./terrain');
const { PATHS } = await import('./layout');

function host(level: number) {
  const save = defaultSave();
  save.skills.count.level = level;
  const g = {
    scene: new THREE.Scene(), save, ws: worldState(save, 'forest'), groundY: () => 0, rng: createRng('nuts'),
    ground: { resolve: () => {} }, hero: { root: new THREE.Object3D() }, sparks: { burst: vi.fn() },
    speech: { caption: vi.fn(), line: vi.fn(() => Promise.resolve()) }, task: (open: () => Promise<TaskResult>) => open(), hooksFor: () => ({}), persist: vi.fn(),
  };
  g.hero.root.position.set(999, 0, 999);
  return g;
}
const SHUSTRIK = { def: { id: 'shustrik', emoji: '🐿️' }, pos: new THREE.Vector3(PATHS[PATHS.length - 1][0].x, 0, PATHS[PATHS.length - 1][0].z) };

describe('the tracks on the ground (WORLD-15)', () => {
  it('3 to 5 nuts by the level of counting', () => {
    expect([1, 2, 3, 4, 5].map(nutsFor)).toEqual([3, 3, 4, 4, 5]);
  });

  it('the prints from Shustrik along the tracks, a nut at the end of a branch off them', () => {
    const g = host(3), s = createNutsSearch(g as never), done = vi.fn();
    s.start!(SHUSTRIK as never, done);
    expect(s.state.nuts).toHaveLength(4);
    expect(s.tracks.count).toBeGreaterThan(40);
    for (const n of s.state.nuts) expect(lineDist(PATHS[PATHS.length - 1], n.at.x, n.at.z)).toBeCloseTo(OFF, 0);
    expect(g.speech.caption).toHaveBeenCalled();
  });

  it('found by walking into them: the search records nothing; the question at the end goes to "count", then the step is done', async () => {
    answer = { solved: true, wrong: 1 }; asked.length = 0;
    const g = host(2), s = createNutsSearch(g as never), done = vi.fn();
    const before = JSON.stringify(g.save.skills.count);
    s.start!(SHUSTRIK as never, done);
    for (const [i, n] of s.state.nuts.entries()) {
      g.hero.root.position.set(n.at.x + FIND_R * 0.5, 0, n.at.z);
      s.update(0.016, i, true);
      if (i < s.state.nuts.length - 1) expect(JSON.stringify(g.save.skills.count)).toBe(before);      // LEARN-02
    }
    // the question at once with the last nut: no line before it (the walkthrough of the forest, 2026-11-26)
    expect(s.state.asking).toBe(true);
    await vi.waitFor(() => expect(done).toHaveBeenCalledTimes(1));
    expect(asked).toEqual([{ thing: '🌰', n: 3 }]);
    expect(g.save.skills.count.tasks).toBe(JSON.parse(before).tasks + 1);
    // Shustrik glad of the first two nuts; the tracks' end is her word of the step solved (CharacterDef.solved)
    expect(g.speech.line.mock.calls.map((c: unknown[]) => c[0])).toEqual(['shustrik_tracks_found_1', 'shustrik_tracks_found_2']);
    expect(s.active!()).toBe(false);
  });

  it('a question closed waits: nothing recorded, the step not done; asked again, answered, done', async () => {
    answer = { solved: false, wrong: 0 }; asked.length = 0;
    const g = host(1), s = createNutsSearch(g as never), done = vi.fn();
    const before = JSON.stringify(g.save.skills.count);
    s.start!(SHUSTRIK as never, done);
    for (const n of s.state.nuts) { g.hero.root.position.set(n.at.x, 0, n.at.z); s.update(0.016, 0, true); }
    await vi.waitFor(() => expect(asked).toHaveLength(1));
    expect(done).not.toHaveBeenCalled();
    expect(JSON.stringify(g.save.skills.count)).toBe(before);
    expect(s.state.asking).toBe(true);
    answer = { solved: true, wrong: 0 };
    await s.reask!(SHUSTRIK as never);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('not while she cannot move; the walkthrough\'s move puts her on the next nut', () => {
    const g = host(1), s = createNutsSearch(g as never);
    s.start!(SHUSTRIK as never, vi.fn());
    const n = s.state.nuts[0];
    g.hero.root.position.set(n.at.x, 0, n.at.z);
    s.update(0.016, 0, false);
    expect(n.found).toBe(false);
    g.hero.root.position.set(999, 0, 999);
    expect(s.cheat()).toBe(true);
    expect(g.hero.root.position.distanceTo(new THREE.Vector3(n.at.x, 0, n.at.z))).toBeLessThan(1e-6);
  });
});
