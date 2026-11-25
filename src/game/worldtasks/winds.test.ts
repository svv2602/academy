// @vitest-environment happy-dom
/**
 * "The route of the winds" (./winds.ts, WORLD-23), by its card's acceptance: the map's route exists, its length is
 * within the level, the storm clouds never lie on it, the ship with no arrow never reaches the goal; the show - a tap
 * turns an arrow, a launch that bumps sails back with the arrows staying, the hint lights the next right arrow after
 * two of them, the route made solves it; the arrows are its middle.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { createWorldScope } from '../scope';
import type { TaskHooks } from '../taskviews/panel';
import { WINDS_BY_LEVEL, cellKey, generateWinds, sail, showWindsInWorld, type WorldWinds } from './winds';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

describe('the map of the winds by level (WORLD-23)', () => {
  it.each([1, 2, 3, 4, 5])('level %i: the route exists with the level\'s arrows, within the map; the clouds off it; no arrow, no goal', (level) => {
    const by = WINDS_BY_LEVEL[level];
    for (let i = 0; i < 300; i++) {
      const s = generateWinds(level, createRng(`winds-${level}-${i}`));
      expect(s.n).toBe(by.n);
      expect(s.solution).toHaveLength(by.arrows);
      expect(s.path.length).toBeGreaterThan(by.arrows);
      expect(s.path.length).toBeLessThanOrEqual(by.n * by.n);
      expect(new Set(s.path.map(cellKey)).size).toBe(s.path.length);
      expect(s.clouds.length).toBeGreaterThanOrEqual(1);
      expect(s.clouds.length).toBeLessThanOrEqual(by.clouds);
      for (const c of s.clouds) expect(s.path.map(cellKey)).not.toContain(cellKey(c));
      const arrows = new Map(s.solution.map((x) => [cellKey(x.cell), x.dir] as const));
      expect(sail(s, arrows)).toEqual({ cells: s.path, end: 'goal' });
      expect(sail(s, new Map()).end).not.toBe('goal');
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
const AT = { x: 0, z: 0, y: 0, facing: 0 };
const play = (w: WorldWinds, t0: number, s: number) => { for (let t = t0; t <= t0 + s; t += 0.05) w.update(t); return t0 + s + 0.05; };

describe('the route of the winds in the world', () => {
  it('a tap turns an arrow round its headings; a launch that bumps sails back, the arrows staying; two of them light the next right arrow', async () => {
    const spec = generateWinds(3, createRng('winds-show')), { hooks, heard } = listen();
    const w = showWindsInWorld(new THREE.Scene(), spec, AT, hooks, { reach: 60, scope: createWorldScope(new THREE.Scene()) });
    expect(w.mistakes).toBe(1);
    const c = spec.solution[0].cell;
    w.turn(c); expect(w.arrows.get(cellKey(c))).toBe(0);
    w.turn(c); w.turn(c); w.turn(c); expect(w.arrows.get(cellKey(c))).toBe(3);
    w.turn(c); expect(w.arrows.has(cellKey(c))).toBe(false);
    w.turn(c);
    let t = 0;
    expect(w.wrong()).toBe(true);
    t = play(w, t, 8);
    await vi.runAllTimersAsync();
    expect(w.state()).toMatchObject({ kind: 'winds', wrongs: 1 });
    expect(w.arrows.has(cellKey(c))).toBe(true);
    expect(heard.hints).toEqual(['h_simon']);
    expect(w.wrong()).toBe(true);
    t = play(w, t, 8);
    await vi.runAllTimersAsync();
    expect(heard.hints).toEqual(['h_simon', 'h3_show']);
    // the arrows are its middle
    expect(w.progress().length % 3).toBe(0);
    w.solve();
    play(w, t, 10);
    await vi.runAllTimersAsync();
    await expect(w.done).resolves.toEqual({ solved: true, wrong: 2 });
    expect(heard.good).toBe(1);
  });

  it('opened with a middle kept, its arrows are on the map', () => {
    const spec = generateWinds(4, createRng('winds-kept')), s = spec.solution[0];
    const w = showWindsInWorld(new THREE.Scene(), spec, AT, listen().hooks, { reach: 60, scope: createWorldScope(new THREE.Scene()), kept: [s.cell[0], s.cell[1], s.dir] });
    expect(w.arrows.get(cellKey(s.cell))).toBe(s.dir);
    expect(w.state().progress).toEqual([s.cell[0], s.cell[1], s.dir]);
  });

  it('closed: ends unsolved and leaves nothing in the scene', async () => {
    const scene = new THREE.Scene();
    const w = showWindsInWorld(scene, generateWinds(1, createRng('winds-close')), AT, listen().hooks, { reach: 60, scope: createWorldScope(new THREE.Scene()) });
    expect(scene.children).toHaveLength(1);
    w.close();
    expect(scene.children).toHaveLength(0);
    await expect(w.done).resolves.toEqual({ solved: false, wrong: 0 });
  });
});
