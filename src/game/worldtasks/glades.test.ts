// @vitest-environment happy-dom
/**
 * "Where are more?" as two glades of flowers (./glades.ts): the panel's description, the flowers of each glade as many
 * as its group, the first group on the left; a tap on the right glade ends the task solved, on the other one goes the
 * way of every task; the hint shows the numbers; nothing of it is left once closed or once the world is gone.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { createWorldScope } from '../scope';
import { generate, type CompareSpec } from '../tasks/compare';
import type { TaskHooks } from '../taskviews/panel';
import { showGladesInWorld, type WorldGlades } from './glades';

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
const AT = { x: 2, z: 4, facing: 0.4 };
const open = (spec: CompareSpec, hooks: TaskHooks, scene = new THREE.Scene(), scope = createWorldScope(new THREE.Scene())) =>
  showGladesInWorld(scene, spec, AT, hooks, { groundY: () => 0, reach: 60, scope });
/** A tap that lands exactly on the middle of glade `i` and far from everything else. */
const tapGlade = (w: WorldGlades, i: number) => {
  const p = w.glades[i].position;
  return w.tap((v) => (Math.hypot(v.x - p.x, v.z - p.z) < 1e-6 ? 0 : 1000));
};
const flowers = (w: WorldGlades, i: number) => w.glades[i].children.filter((c) => c.userData.flower).length;

describe('"where are more?" as two glades', () => {
  it.each([1, 2, 3])('level %i: each glade has the flowers of its group, the first on the left; a tap on the right one solves it', async (level) => {
    for (let i = 0; i < 20; i++) {
      const spec = generate(level, createRng(`glades-${level}-${i}`));
      const { hooks, heard } = listen();
      const w = open(spec, hooks);
      expect([flowers(w, 0), flowers(w, 1)]).toEqual(spec.body.groups);
      expect(heard.prompts).toEqual([spec.prompt]);
      // looking along the facing (sin f, cos f), the screen's left is (cos f, -sin f): the first glade lies that way
      const d = w.glades[0].position.clone().sub(w.glades[1].position);
      expect(d.x * Math.cos(AT.facing) - d.z * Math.sin(AT.facing)).toBeGreaterThan(0);
      expect(tapGlade(w, spec.body.answer)).toBe(true);
      await vi.runAllTimersAsync();
      await expect(w.done).resolves.toEqual({ solved: true, wrong: 0 });
      expect(heard.good).toBe(1);
    }
  });

  it('a tap on the other glade: counted, "try again", the rung of the hint - the second shows the numbers; the door solves it after', async () => {
    const spec = generate(2, createRng('glades-wrong'));
    const { hooks, heard } = listen();
    const w = open(spec, hooks);
    tapGlade(w, 1 - spec.body.answer);
    expect(w.state()).toMatchObject({ kind: 'glades', phase: 'mistake', wrongs: 1 });
    await vi.runAllTimersAsync();
    expect(heard.wrong).toBe(1);
    expect(w.state().rung).toBe(1);
    expect(w.wrong()).toBe(true);
    await vi.runAllTimersAsync();
    expect(w.state().rung).toBe(2);
    w.update(1);
    const labels = w.glades.flatMap((g) => g.children.filter((c) => c.userData.label));
    if (labels.length) expect(labels.every((l) => l.visible)).toBe(true);
    w.solve();
    expect(w.state().phase).toBe('solved');
    await vi.runAllTimersAsync();
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 2 });
  });

  it('closed: ends unsolved and leaves nothing in the scene', async () => {
    const scene = new THREE.Scene(), { hooks } = listen();
    const w = open(generate(1, createRng('glades-close')), hooks, scene);
    expect(scene.children.length).toBe(1);
    w.close();
    expect(scene.children.length).toBe(0);
    await expect(w.done).resolves.toEqual({ solved: false, wrong: 0 });
  });

  it('a world left while the right glade blooms: the task does not end in the world taken away', async () => {
    const scene = new THREE.Scene(), scope = createWorldScope(new THREE.Scene()), { hooks } = listen();
    const w = open(generate(1, createRng('glades-left')), hooks, scene, scope);
    let ended = false;
    void w.done.then(() => { ended = true; });
    w.solve();
    scope.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(ended).toBe(false);
  });
});
