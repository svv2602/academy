/**
 * "The second half" played in the world (./half-show.ts, WORLD-18): the open valve with the given pattern, the valves to
 * choose from; the mirror closes the shell, a wrong valve rocks and goes the way of every task - the hint by its three
 * rungs (the way, the ghosts of the mirror, the right valve pulsing); closed, nothing of it is left.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Spoken } from '../../core/audio';
import { createRng } from '../../core/rng';
import type { SpokenKey } from '../../ui/strings';
import { createWorldScope } from '../scope';
import type { TaskHooks } from '../taskviews/panel';
import { alike } from './half';
import { generateHalf, showHalfInWorld, type HalfSpec, type WorldHalf } from './half-show';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

const LINES = { prompt: 'pantsyr_half_start', way: 'sea_half_hint_1', together: 'sea_half_hint_2' } as unknown as { prompt: SpokenKey; way: SpokenKey; together: SpokenKey };

function listen() {
  const heard = { prompts: [] as SpokenKey[], hints: [] as SpokenKey[], wrong: 0, good: 0 };
  const quick = () => Promise.resolve() as Spoken;
  const hooks: TaskHooks = {
    prompt: (k) => { heard.prompts.push(k); }, number: () => {}, good: () => { heard.good++; },
    wrong: () => { heard.wrong++; return quick(); }, hint: (k) => { heard.hints.push(k); return quick(); },
  };
  return { hooks, heard };
}
const open = (spec: HalfSpec, hooks: TaskHooks, scene = new THREE.Scene()) =>
  ({ scene, w: showHalfInWorld(scene, spec, { x: 2, z: 4, facing: 0.4 }, hooks, { groundY: () => 0, reach: 60, scope: createWorldScope(new THREE.Scene()) }) });
/** A tap right on valve `i` (its middle, as the show measures it) and far from the others. */
const tapValve = (w: WorldHalf, i: number) => {
  const p = w.targets()[i].pos;
  return w.tap((v) => (v.distanceTo(p) < 1e-6 ? 0 : 1000));
};

describe('"the second half" in the world (WORLD-18)', () => {
  it.each([1, 2, 3, 4, 5])('level %i: one valve is the mirror, every other differs; the turtle asks; the mirror tapped closes the shell', async (level) => {
    for (let k = 0; k < 10; k++) {
      const spec = generateHalf(level, createRng(`half-${level}-${k}`), LINES);
      const { body } = spec;
      expect(body.options.filter((o) => alike(o, body.given))).toHaveLength(1);
      expect(alike(body.options[body.answer], body.given)).toBe(true);
      const { hooks, heard } = listen();
      const { w } = open(spec, hooks);
      expect(w.valves).toHaveLength(body.options.length);
      expect(heard.prompts).toEqual(['pantsyr_half_start']);
      expect(w.targets().filter((t) => t.right)).toHaveLength(1);
      expect(tapValve(w, body.answer)).toBe(true);
      await vi.runAllTimersAsync();
      await expect(w.done).resolves.toEqual({ solved: true, wrong: 0 });
      expect(heard.good).toBe(1);
    }
  });

  it('three wrong valves: each rocks and stays, "try again" and the rung: the way, the ghosts of the mirror, the right one pulsing', async () => {
    const spec = generateHalf(4, createRng('half-wrong'), LINES);
    const { hooks, heard } = listen();
    const { w } = open(spec, hooks);
    const wrongAt = spec.body.options.findIndex((_, i) => i !== spec.body.answer);
    const ghosts = () => w.open.parent!.children.filter((c) => c !== w.open && !w.valves.includes(c as THREE.Group))[0];
    const right = w.valves[spec.body.answer];
    for (let r = 1; r <= 3; r++) {
      const home = w.valves[wrongAt].position.clone();
      tapValve(w, wrongAt);
      await vi.runAllTimersAsync();
      expect(w.valves[wrongAt].position.distanceTo(home)).toBeLessThan(1e-9);
      expect(w.state().wrongs).toBe(r);
      expect(w.state().rung).toBe(r);
      if (r === 2) expect(ghosts().visible).toBe(true);
    }
    expect(heard.wrong).toBe(3);
    expect(heard.hints).toEqual(['sea_half_hint_1', 'sea_half_hint_2', 'h3_show']);
    w.update(0.2);
    expect(right.scale.x).toBeGreaterThan(1);
    w.solve();
    await vi.runAllTimersAsync();
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 3 });
  });

  it('closed: unsolved, and nothing of it is left in the scene', async () => {
    const spec = generateHalf(2, createRng('half-close'), LINES);
    const { hooks } = listen();
    const { scene, w } = open(spec, hooks);
    expect(scene.children.length).toBe(1);
    w.close();
    await expect(w.done).resolves.toEqual({ solved: false, wrong: 0 });
    expect(scene.children.length).toBe(0);
    expect(w.targets()).toEqual([]);
  });
});
