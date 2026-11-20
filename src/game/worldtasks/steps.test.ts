// @vitest-environment happy-dom
/**
 * "Steps with numbers" (./steps.ts, WORLD-16): the generator on the bounds of every level of the number series, and the
 * show - the right mushroom hops onto the empty step, a wrong one rocks and goes the way of every task, the hint counts
 * the steps up to the empty one, nothing is left once closed or once the world is gone.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { createWorldScope } from '../scope';
import { neighbors, type NeighborsSpec } from '../tasks/neighbors';
import type { TaskHooks } from '../taskviews/panel';
import { STEPS_BY_LEVEL, generateSteps, showStepsInWorld, type WorldSteps } from './steps';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('the steps of the number series by level (docs/11-learning.md)', () => {
  it.each([1, 2, 3, 4, 5])('level %i: in a row, within the level\'s numbers, one empty step after a number, its choices around it', (level) => {
    const by = STEPS_BY_LEVEL[level];
    const seen = new Set<number>();
    for (let i = 0; i < 400; i++) {
      const s = generateSteps(level, createRng(`steps-${level}-${i}`)), b = s.body;
      expect(b.cells).toHaveLength(by.cells);
      b.cells.forEach((c, k) => { if (k) expect(c).toBe(b.cells[k - 1] + 1); });
      expect(b.cells[0]).toBeGreaterThanOrEqual(by.first[0]);
      expect(b.cells[0]).toBeLessThanOrEqual(by.first[1]);
      expect(b.cells[b.cells.length - 1]).toBeLessThanOrEqual(by.top);
      expect(b.gap).toBeGreaterThanOrEqual(1);            // a number to count from before the empty step
      expect(b.answer).toBe(b.cells[b.gap]);
      expect(b.n).toBe(b.cells[b.gap - 1]);
      expect(b.options).toHaveLength(by.options);
      expect(new Set(b.options).size).toBe(by.options);
      expect(b.options).toContain(b.answer);
      for (const v of b.options) { expect(v).toBeGreaterThanOrEqual(1); expect(v).toBeLessThanOrEqual(by.top); }
      expect(neighbors.answer(s, null, b.answer)).toBe('right');
      seen.add(b.cells[b.cells.length - 1]);
    }
    // the top of the level is reached
    expect(seen.has(by.top)).toBe(true);
  });

  it('the panel\'s description: its prompt and the hint of the track, every line recorded already', () => {
    const s = generateSteps(3, createRng('steps-lines'));
    expect(s.type).toBe('neighbors');
    expect(s.prompt).toBe('t_after');
    expect(JSON.stringify(s.hint)).toContain('h1_neighbors');
    expect(JSON.stringify(s.hint)).toContain('countCells');
  });
});

function listen() {
  const heard = { prompts: [] as SpokenKey[], hints: [] as SpokenKey[], wrong: 0, good: 0 };
  const quick = () => Promise.resolve() as Spoken;
  const hooks: TaskHooks = {
    prompt: (k) => { heard.prompts.push(k); }, number: () => {}, good: () => { heard.good++; },
    wrong: () => { heard.wrong++; return quick(); }, hint: (k) => { heard.hints.push(k); return quick(); },
  };
  return { hooks, heard };
}
const open = (spec: NeighborsSpec, hooks: TaskHooks, scene = new THREE.Scene(), scope = createWorldScope(new THREE.Scene())) =>
  showStepsInWorld(scene, spec, { x: 2, z: 4, facing: 0.4 }, hooks, { groundY: () => 0, reach: 60, scope });
/** A tap exactly on the mushroom of number `n`, far from every other. */
const tapOn = (w: WorldSteps, n: number) => {
  const m = w.choices.find((x) => x.userData.n === n)!;
  return w.tap((v) => (Math.hypot(v.x - m.position.x, v.z - m.position.z) < 1e-6 ? 0 : 1000));
};

describe('the steps in the world', () => {
  it.each([1, 3, 5])('level %i: the steps rise, the empty one has no number; the right mushroom hops onto it and the task is solved', async (level) => {
    const spec = generateSteps(level, createRng(`steps-show-${level}`)), { hooks, heard } = listen();
    const w = open(spec, hooks);
    expect(heard.prompts).toEqual(['t_after']);
    expect(w.steps).toHaveLength(spec.body.cells.length);
    w.steps.forEach((s, i) => { if (i) expect(s.position.y).toBeGreaterThan(w.steps[i - 1].position.y); });
    expect(w.steps[spec.body.gap].userData.n).toBeNull();
    expect(w.choices.map((m) => m.userData.n)).toEqual(spec.body.options);
    expect(tapOn(w, spec.body.answer)).toBe(true);
    for (let t = 0; t <= 1; t += 0.05) w.update(t);
    const m = w.choices.find((x) => x.userData.n === spec.body.answer)!;
    expect(m.position.distanceTo(w.steps[spec.body.gap].position)).toBeLessThan(0.2);
    await vi.runAllTimersAsync();
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 0 });
    expect(heard.good).toBe(1);
  });

  it('a wrong mushroom rocks and stays: counted, "try again", then the steps are counted up to the empty one', async () => {
    const spec = generateSteps(4, createRng('steps-wrong')), { hooks, heard } = listen();
    const w = open(spec, hooks);
    const wrongN = spec.body.options.find((n) => n !== spec.body.answer)!;
    tapOn(w, wrongN);
    expect(w.state()).toMatchObject({ kind: 'steps', phase: 'mistake', wrongs: 1 });
    expect(w.choices.find((m) => m.userData.n === wrongN)!.userData.placed).toBe(false);
    await vi.runAllTimersAsync();
    expect(heard.wrong).toBe(1);
    expect(heard.hints).toEqual(['h1_neighbors']);
    w.update(100);                         // the world's time when the second mistake is made
    expect(w.wrong()).toBe(true);
    await vi.runAllTimersAsync();
    expect(heard.hints).toEqual(['h1_neighbors', 'h2_neighbors']);
    // the count: the foot step lights first, then the next ones, up to the empty one
    w.update(100.1);
    const lit = () => w.steps.findIndex((s, i) => i !== spec.body.gap && (s.material as THREE.MeshStandardMaterial).emissiveIntensity > 0);
    expect(lit()).toBe(0);
    w.update(100.7);
    expect(lit()).toBe(spec.body.gap > 1 ? 1 : -1);
    w.solve();
    await vi.runAllTimersAsync();
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 2 });
  });

  it('closed: ends unsolved and leaves nothing in the scene; a world left in the middle does not end it', async () => {
    const scene = new THREE.Scene(), { hooks } = listen();
    const w = open(generateSteps(2, createRng('steps-close')), hooks, scene);
    expect(scene.children).toHaveLength(1);
    w.close();
    expect(scene.children).toHaveLength(0);
    await expect(w.done).resolves.toEqual({ solved: false, wrong: 0 });
    const scope = createWorldScope(new THREE.Scene()), scene2 = new THREE.Scene();
    const w2 = open(generateSteps(2, createRng('steps-left')), listen().hooks, scene2, scope);
    let ended = false;
    void w2.done.then(() => { ended = true; });
    w2.solve(); scope.dispose();
    await vi.advanceTimersByTimeAsync(5000);
    expect(ended).toBe(false);
  });
});
