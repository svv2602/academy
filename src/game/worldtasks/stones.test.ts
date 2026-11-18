// @vitest-environment happy-dom
/**
 * "Numbers in order" as stones across a stream (./stones.ts): the panel's description, the stones in the order of
 * `shown`, the places across the stream; a right tap puts the stone on the next place, a wrong one rocks it and goes
 * the way of every task; solved through the same handler; nothing of it is left once the world is gone.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { createWorldScope } from '../scope';
import { generate, type OrderSpec } from '../tasks/order';
import type { TaskHooks } from '../taskviews/panel';
import { showStonesInWorld, type WorldStones } from './stones';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

function listen() {
  const heard = { prompts: [] as SpokenKey[], hints: [] as SpokenKey[], wrong: 0, good: 0 };
  const quick = () => Promise.resolve() as Spoken;
  const hooks: TaskHooks = {
    prompt: (k) => { heard.prompts.push(k); }, number: () => {}, good: () => { heard.good++; },
    wrong: () => { heard.wrong++; return quick(); }, hint: (k) => { heard.hints.push(k); return quick(); },
  };
  return { hooks, heard };
}
const open = (spec: OrderSpec, hooks: TaskHooks, scene = new THREE.Scene(), scope = createWorldScope(new THREE.Scene())) =>
  showStonesInWorld(scene, spec, { x: 2, z: 4, facing: 0.4 }, hooks, { groundY: () => 0, reach: 60, scope });
/** A tap that lands exactly on stone `n` and far from every other thing. */
const tapStone = (w: WorldStones, n: number) => {
  const s = w.stones.find((x) => x.userData.n === n)!;
  return w.tap((v) => (Math.hypot(v.x - s.position.x, v.z - s.position.z) < 1e-6 ? 0 : 1000));
};

describe('"numbers in order" as stones across a stream', () => {
  it.each([1, 2, 3, 5])('level %i: the stones show the numbers of the description in its order; tapped in order they cross and the task is solved', async (level) => {
    for (let i = 0; i < 20; i++) {
      const spec = generate(level, createRng(`stones-${level}-${i}`));
      const { hooks, heard } = listen();
      const w = open(spec, hooks);
      expect(w.stones.map((s) => s.userData.n)).toEqual(spec.body.shown);
      expect(w.places.length).toBe(spec.body.sorted.length);
      expect(heard.prompts).toEqual(['t_order']);
      for (const n of spec.body.sorted) expect(tapStone(w, n)).toBe(true);
      expect(w.stones.every((s) => (s.userData.at as number) >= 0)).toBe(true);
      expect(w.stones.find((s) => s.userData.n === spec.body.sorted[0])!.userData.at).toBe(0);
      await vi.runAllTimersAsync();
      await expect(w.done).resolves.toEqual({ solved: true, wrong: 0 });
      expect(heard.good).toBe(spec.body.sorted.length);
    }
  });

  it('a wrong stone rocks and stays on the bank: counted, "try again", the rung of the hint; the solve() of the door goes on from there', async () => {
    const spec = generate(2, createRng('stones-wrong'));
    const { hooks, heard } = listen();
    const w = open(spec, hooks);
    const wrongN = spec.body.sorted[spec.body.sorted.length - 1];
    tapStone(w, wrongN);
    expect(w.state()).toMatchObject({ kind: 'stones', phase: 'mistake', wrongs: 1 });
    expect(w.stones.find((s) => s.userData.n === wrongN)!.userData.at).toBe(-1);
    await vi.runAllTimersAsync();
    expect(heard.wrong).toBe(1);
    expect(heard.hints.length).toBe(1);
    expect(w.state().rung).toBe(1);
    expect(w.wrong()).toBe(true);
    await vi.runAllTimersAsync();
    expect(w.state().rung).toBe(2);
    w.solve();
    expect(w.state().phase).toBe('solved');
    await vi.runAllTimersAsync();
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 2 });
  });

  it('closed: ends unsolved and leaves nothing in the scene', async () => {
    const scene = new THREE.Scene(), { hooks } = listen();
    const w = open(generate(1, createRng('stones-close')), hooks, scene);
    expect(scene.children.length).toBe(1);
    w.close();
    expect(scene.children.length).toBe(0);
    await expect(w.done).resolves.toEqual({ solved: false, wrong: 0 });
  });

  it('a world left while the last stone hops: the task does not end in the world taken away', async () => {
    const scene = new THREE.Scene(), scope = createWorldScope(new THREE.Scene()), { hooks } = listen();
    const w = open(generate(1, createRng('stones-left')), hooks, scene, scope);
    let ended = false;
    void w.done.then(() => { ended = true; });
    w.solve();
    scope.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(ended).toBe(false);
    expect(scene.children.length).toBe(1);
  });
});
