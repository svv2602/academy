/**
 * A step of a chain done in the background (src/game/dialogue.ts `stepDone`): the chain moves on and gives its stars;
 * a step that ended in a task played in the world (the sea's shell lock) hands its result, which goes to the step's
 * skill as a task in the foreground's would - without one (the nuts, the maze, a pearl) no skill is touched.
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { defaultSave, defaultWorld } from '../core/save';
import type { Game } from './context';
import { createDialogue } from './dialogue';
import type { CharacterDef, Npc, WorldTask } from './world';

vi.mock('../ui/achieve', () => ({ bindAchievements: () => {} }));
vi.mock('../ui/ui', () => ({ fanfare: () => Promise.resolve() }));
vi.mock('./stops', () => ({ stopPoint: () => Promise.resolve() }));
vi.mock('./stage', () => ({ playScene: (_s: unknown, _n: string, f: () => Promise<void>) => f() }));

const QUEEN: CharacterDef = { id: 'queen', emoji: '🧜‍♀️', x: 0, z: 0, heading: 0, steps: ['compare', 'lock', 'nuts'], shard: '#fff' } as CharacterDef;

function world() {
  const save = defaultSave(), ws = defaultWorld();
  const stars: number[] = [];
  const g = {
    save, ws, plan: {}, rng: () => 0.5,
    hero: { root: new THREE.Object3D(), play: () => {} }, cat: { play: () => {} }, cam: {}, sparks: { burst: () => {} },
    persist: () => {}, refreshHud: () => {}, addStars: (n: number) => { stars.push(n); }, above: () => new THREE.Vector3(),
    fault: () => {}, praise: () => Promise.resolve(), task: () => Promise.resolve({ solved: false, wrong: 0 }), hooksFor: () => ({}),
    speech: { line: () => Promise.resolve() },
  } as unknown as Game;
  const lock: WorldTask = { skill: 'compose', start: () => {}, endsInWorld: true };
  const nuts: WorldTask = { skill: 'count', start: () => {} };
  const d = createDialogue(g, {} as never, { characters: [QUEEN], lines: { partGiven: 'npc_next', allParts: 'go_next', partTitle: 'sea_part', partText: 'sea_count' } as never, tasks: { lock, nuts } });
  const npc = { def: QUEEN } as Npc;
  return { save, ws, stars, d, npc };
}

describe('a step done in the background (src/game/dialogue.ts stepDone)', () => {
  it('with the result of the task played at its end: the chain moves on, 3 stars, one task more in the step\'s skill', () => {
    const { save, ws, stars, d, npc } = world();
    ws.quests.queen = 1;
    const before = { ...save.skills.compose };
    d.stepDone(npc, 1, { solved: true, wrong: 2 });
    expect(ws.quests.queen).toBe(2);
    expect(stars).toEqual([3]);
    expect(save.skills.compose.tasks).toBe(before.tasks + 1);
    expect(save.skills.compose.errors).toBe(before.errors + 2);
  });

  it('without a result (the nuts, the maze, a pearl): the chain moves on, no skill is touched; a step done already is done once', () => {
    const { save, ws, stars, d, npc } = world();
    ws.quests.queen = 1;
    const skills = JSON.stringify(save.skills);
    d.stepDone(npc, 1);
    expect(ws.quests.queen).toBe(2);
    expect(JSON.stringify(save.skills)).toBe(skills);
    d.stepDone(npc, 1, { solved: true, wrong: 0 });
    expect(ws.quests.queen).toBe(2);
    expect(stars).toEqual([3]);
    expect(JSON.stringify(save.skills)).toBe(skills);
  });
});
