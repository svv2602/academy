// @vitest-environment happy-dom
/**
 * The probe world's task in the world (./tally.ts): the same columns every time, the core's recorded question; the
 * right column solves it through the same handler a tap goes through, a wrong one goes the way of every mistake (rung
 * 1 of the hint, nothing given away), closing it ends it unsolved with nothing left in the scene - and the conversation
 * records nothing for it.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Spoken } from '../../core/audio';
import CORE_CLIPS from '../../core/clips.json';
import { createWorldScope } from '../../game/scope';
import type { TaskHooks } from '../../game/taskviews/panel';
import { worldTaskDoor, setWorldTask } from '../../game/worldtasks/core';
import type { SpokenKey } from '../../ui/strings';
import { COLUMNS, HINT, PROMPT, TALLY, showTallyInWorld, tallyTask, type WorldTally } from './tally';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function listen() {
  const heard = { prompts: [] as SpokenKey[], hints: [] as SpokenKey[], wrong: 0, good: 0 };
  const quick = () => Promise.resolve() as Spoken;
  const hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'> = {
    prompt: (k) => { heard.prompts.push(k); }, good: () => { heard.good++; },
    wrong: () => { heard.wrong++; return quick(); }, hint: (k) => { heard.hints.push(k); return quick(); },
  };
  return { hooks, heard };
}
const open = (hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'>, scene = new THREE.Scene(), scope = createWorldScope(new THREE.Scene())) =>
  showTallyInWorld(scene, { x: -3, z: -5.8, facing: Math.PI }, hooks, { reach: 60, scope });
/** A tap that lands exactly on column `i` and far from the others. */
const tapColumn = (w: WorldTally, i: number) => {
  const c = w.columns[i];
  return w.tap((v) => (Math.hypot(v.x - c.position.x, v.z - c.position.z) < 1e-6 ? 0 : 1000));
};
const answer = COLUMNS.indexOf(Math.max(...COLUMNS));

describe('"where are more?" over three columns, the probe world\'s task in the world', () => {
  it('the same columns every time, as many balls as COLUMNS says; the question and every rung of the hint are recorded lines of the core', () => {
    const a = open(listen().hooks), b = open(listen().hooks);
    expect(a.columns.map((c) => c.userData.n)).toEqual([...COLUMNS]);
    expect(b.columns.map((c) => c.userData.n)).toEqual(a.columns.map((c) => c.userData.n));
    expect(a.columns.map((c) => c.children.filter((x) => (x as THREE.Mesh).isMesh).length)).toEqual([...COLUMNS]);
    expect(new Set(COLUMNS).size, 'one tallest column').toBe(COLUMNS.length);
    const keys = [PROMPT, ...HINT.rungs.map((r) => r.key)];
    for (const k of keys) expect(CORE_CLIPS, k).toContain(k);
    expect(a.state()).toEqual({ kind: TALLY, phase: 'input', wrongs: 0, moves: 0, rung: 0, progress: [] });
  });

  it('a tap on the tallest column solves it at once: asked, praised, no mistake', async () => {
    const { hooks, heard } = listen();
    const w = open(hooks);
    expect(heard.prompts).toEqual([PROMPT]);
    expect(w.targets().filter((t) => t.right)).toHaveLength(1);
    expect(tapColumn(w, answer)).toBe(true);
    expect(w.state().phase).toBe('solved');
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 0 });
    expect(heard.good).toBe(1);
    expect(w.targets()).toEqual([]);
  });

  it('a wrong column: counted, "try again", then rung 1 - the way said, nothing shown; the next mistakes climb the rungs; solve() goes on from there', async () => {
    const { hooks, heard } = listen();
    const w = open(hooks);
    expect(tapColumn(w, (answer + 1) % COLUMNS.length)).toBe(true);
    expect(w.state()).toMatchObject({ phase: 'mistake', wrongs: 1 });
    await vi.runAllTimersAsync();
    expect(heard.wrong).toBe(1);
    expect(heard.hints).toEqual([HINT.rungs[0].key]);
    expect(w.state()).toMatchObject({ phase: 'input', wrongs: 1, rung: 1 });
    w.update(1);
    expect(w.columns.some((c) => c.getObjectByName('number')?.visible), 'rung 1 shows no number').toBe(false);
    expect(w.columns[answer].scale.x, 'rung 1 lights no column').toBe(1);
    expect(w.wrong()).toBe(true);
    await vi.runAllTimersAsync();
    expect(w.state()).toMatchObject({ wrongs: 2, rung: 2 });
    expect(heard.hints).toEqual([HINT.rungs[0].key, HINT.rungs[1].key]);
    w.solve();
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 2 });
  });

  it('the door of the walkthrough reaches it: a wrong move, the state, solve', async () => {
    const g = {}, { hooks } = listen();
    const w = open(hooks);
    setWorldTask(g, w);
    const door = worldTaskDoor(g);
    expect(door.state).toMatchObject({ kind: TALLY, phase: 'input', wrongs: 0, rung: 0 });
    expect(door.wrong()).toBe(true);
    await vi.runAllTimersAsync();
    expect(door.state).toMatchObject({ phase: 'input', wrongs: 1, rung: 1 });
    expect(door.targets()!.all.filter((t) => t.right)).toHaveLength(1);
    expect(door.solve()).toBe(true);
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 1 });
  });

  it('closed: ends unsolved, says nothing, leaves nothing in the scene; a tap after it is not taken', async () => {
    const scene = new THREE.Scene(), { hooks, heard } = listen();
    const w = open(hooks, scene);
    expect(scene.children.length).toBe(1);
    w.close();
    expect(scene.children.length).toBe(0);
    await expect(w.done).resolves.toEqual({ solved: false, wrong: 0 });
    expect(w.state().phase).toBe('closed');
    expect(tapColumn(w, answer)).toBe(false);
    expect({ good: heard.good, wrong: heard.wrong, hints: heard.hints }).toEqual({ good: 0, wrong: 0, hints: [] });
  });

  it('the step of a chain: played in the world on every level, before the character; closed, it reports unsolved - the conversation records nothing', async () => {
    const { hooks } = listen(), scene = new THREE.Scene(), scope = createWorldScope(new THREE.Scene());
    let shown: WorldTally | null = null;
    const player = { open: null, tap: () => false, update: () => {}, play: (s: WorldTally) => { shown = s; s.close(); return s.done; } };
    const step = tallyTask({ scene, touch: true, hooksFor: () => hooks as TaskHooks }, player as never, scope);
    expect(step.skill).toBe('compare');
    for (const level of [1, 2, 3, 4, 5]) expect(step.inWorld!(level), `level ${level}`).toBe(true);
    const npc = { def: { heading: 0, emoji: '🦊' }, pos: new THREE.Vector3(-3, 0, -8) };
    await expect(step.run!(npc as never, 3)).resolves.toEqual({ solved: false, wrong: 0 });
    // the row stands in front of the character, the child looks across it at the character
    expect(shown!.center.z).toBeGreaterThan(npc.pos.z);
    expect(shown!.facing).toBeCloseTo(Math.PI, 9);
  });
});
