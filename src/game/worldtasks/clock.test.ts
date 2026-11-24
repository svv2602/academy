// @vitest-environment happy-dom
/**
 * The two tasks of the observatory's clock (./clock.ts, WORLD-24): the gears' row is the pattern's of levels 1-3 at any
 * level, every colour of it painted; the right gear goes onto the axle, the right number sets the hand, a wrong one rocks
 * and goes the way of every task; nothing is left once closed.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { createWorldScope } from '../scope';
import type { TaskHooks } from '../taskviews/panel';
import { GEAR_PAINT, PAINTED, generateGears, generateHands, gearsLevel, showGearsInWorld, showHandsInWorld, type WorldChoices } from './clock';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('the descriptions of the clock\'s two tasks', () => {
  it.each([1, 2, 3, 4, 5])('pattern level %i: a row of colours of levels 1-3, every one painted, three gears to choose', (level) => {
    expect(PAINTED).toBe(true);
    for (let i = 0; i < 100; i++) {
      const s = generateGears(level, createRng(`gears-${level}-${i}`));
      expect(s.level).toBe(gearsLevel(level));
      expect(s.level).toBeLessThanOrEqual(3);
      for (const c of [...s.body.row, ...s.body.options]) expect(GEAR_PAINT[c], c).toBeDefined();
      expect(s.body.options).toHaveLength(3);
      expect(s.body.options).toContain(s.body.answer);
    }
  });

  it('the hands: the panel\'s addition of the level, level 5 across the ten', () => {
    for (let i = 0; i < 100; i++) {
      const s = generateHands(5, createRng(`hands-${i}`));
      expect(s.type).toBe('add');
      expect(s.body.answer).toBeGreaterThan(10);
      expect(s.body.options).toContain(s.body.answer);
    }
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
const AT = { x: 1, z: 2, y: 0.5, facing: Math.PI };
const play = (w: WorldChoices, t0: number, s: number) => { for (let t = t0; t <= t0 + s; t += 0.05) w.update(t); };
const tapOn = (w: WorldChoices, v: string | number) => {
  const c = w.choices.find((x) => x.userData.v === v)!;
  return w.tap((p) => (Math.hypot(p.x - c.position.x, p.z - c.position.z) < 1e-6 ? 0 : 1000));
};

describe('the clock\'s tasks in the world', () => {
  it('the gears: a wrong one rocks and is counted, the right one goes onto the axle and the task is solved', async () => {
    const spec = generateGears(2, createRng('gears-show')), { hooks, heard } = listen();
    const w = showGearsInWorld(new THREE.Scene(), spec, AT, hooks, { reach: 60, scope: createWorldScope(new THREE.Scene()) });
    expect(heard.prompts).toEqual(['t_pattern']);
    expect(w.choices.map((c) => c.userData.v)).toEqual(spec.body.options);
    tapOn(w, spec.body.options.find((c) => c !== spec.body.answer)!);
    expect(w.state()).toMatchObject({ kind: 'gears', phase: 'mistake', wrongs: 1 });
    await vi.runAllTimersAsync();
    expect(heard.wrong).toBe(1);
    expect(heard.hints).toHaveLength(1);
    tapOn(w, spec.body.answer);
    play(w, 0, 1);
    expect(w.placed).toBe(true);
    await vi.runAllTimersAsync();
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 1 });
  });

  it('the hands: the right number sets the hand, solved without a mistake', async () => {
    const spec = generateHands(4, createRng('hands-show')), { hooks, heard } = listen();
    const w = showHandsInWorld(new THREE.Scene(), spec, AT, hooks, { reach: 60, scope: createWorldScope(new THREE.Scene()) });
    expect(heard.prompts).toEqual(['t_add']);
    expect(w.targets().map((x) => x.right).filter(Boolean)).toHaveLength(1);
    tapOn(w, spec.body.answer);
    play(w, 0, 1);
    await vi.runAllTimersAsync();
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 0 });
    expect(heard.good).toBe(1);
  });

  it('closed: ends unsolved and leaves nothing in the scene', async () => {
    const scene = new THREE.Scene();
    const w = showHandsInWorld(scene, generateHands(1, createRng('hands-close')), AT, listen().hooks, { reach: 60, scope: createWorldScope(new THREE.Scene()) });
    expect(scene.children).toHaveLength(1);
    w.close();
    expect(scene.children).toHaveLength(0);
    await expect(w.done).resolves.toEqual({ solved: false, wrong: 0 });
  });
});
