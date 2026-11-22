/**
 * "The gingerbread house" (./house.ts, WORLD-21): the generator by the level of "Classification" - 3 to 6 places, each
 * piece with exactly one place, the pieces more alike as the level grows; the board that judges a piece put on a place
 * and keeps its middle; the course of the task over a view - a fitting piece stands in, a wrong one comes back with the
 * hint of every task, closed in the middle it opens again in that middle, the walkthrough's door.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { createWorldScope } from '../scope';
import type { TaskHooks } from '../taskviews/panel';
import {
  ALIKE, HOUSE_BY_LEVEL, SHAPES, alikePairs, fits, generateHouse, houseBoard, houseLevel, placesOf, showHouseInWorld, unlikeness,
  type HouseSpec, type HouseView,
} from './house';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

const LEVELS = [1, 2, 3, 4, 5];
const many = (level: number, n = 300) => Array.from({ length: n }, (_, i) => generateHouse(level, createRng(`house-${level}-${i}`)));

describe('the gingerbread house by the level of "Classification" (WORLD-21)', () => {
  it.each(LEVELS)('level %i: every piece has exactly one place, the pieces are the places\' shapes, mixed', (level) => {
    for (const s of many(level)) {
      const { places, pieces } = s.body;
      expect(s.level).toBe(level);
      expect(places.length).toBeGreaterThanOrEqual(3);
      expect(places.length).toBeLessThanOrEqual(6);
      expect([...pieces].sort()).toEqual([...places].sort());
      for (let i = 0; i < pieces.length; i++) expect(placesOf(s.body, i), `${pieces[i]} of ${places.join(' ')}`).toHaveLength(1);
      // and every place takes exactly one piece
      for (const p of places) expect(pieces.filter((q) => fits(q, p))).toHaveLength(1);
      expect(pieces.every((q, k) => q === places[k])).toBe(false);
    }
  });

  it('3 places at the lowest level, 6 at the highest; the number of places and of alike pieces never falls as the level grows', () => {
    const count = (l: number) => many(l, 100).map((s) => s.body.places.length);
    const alike = (l: number) => many(l, 100).map((s) => alikePairs(s.body));
    expect(new Set(count(1))).toEqual(new Set([3]));
    expect(new Set(count(5))).toEqual(new Set([6]));
    for (let l = 2; l <= 5; l++) {
      expect(Math.min(...count(l)), `level ${l}`).toBeGreaterThanOrEqual(Math.max(...count(l - 1)));
      expect(Math.min(...alike(l)), `level ${l}`).toBeGreaterThanOrEqual(Math.min(...alike(l - 1)));
      expect(Math.max(...alike(l)), `level ${l}`).toBeGreaterThanOrEqual(Math.max(...alike(l - 1)));
    }
    // clearly different shapes at the lowest levels, alike ones at the top: the mirrored halves of the roof, the square
    // window beside the taller one
    expect(Math.max(...alike(1)), 'level 1').toBe(0);
    expect(Math.max(...alike(2)), 'level 2').toBe(0);
    expect(Math.min(...alike(4)), 'level 4').toBeGreaterThanOrEqual(1);
    expect(Math.min(...alike(5)), 'level 5').toBe(2);
    expect(Math.min(...alike(5)), 'level 5').toBeGreaterThan(Math.max(...alike(3)));
    expect(unlikeness('roofL', 'roofR')).toBeLessThan(ALIKE);
    expect(unlikeness('winSq', 'winTall')).toBeLessThan(ALIKE);
    expect(unlikeness('wall', 'door')).toBeGreaterThan(1);
  });

  it('no level lists a shape twice, and both sets of a level with two are drawn', () => {
    for (const l of LEVELS) for (const set of HOUSE_BY_LEVEL[l]) expect(new Set(set).size, `${l}: ${set.join(' ')}`).toBe(set.length);
    for (const l of LEVELS) expect(new Set(many(l, 60).map((s) => s.body.places.join(' '))).size, `level ${l}`).toBe(HOUSE_BY_LEVEL[l].length);
    for (const s of Object.keys(SHAPES)) expect(LEVELS.some((l) => HOUSE_BY_LEVEL[l].some((set) => set.includes(s as never))), s).toBe(true);
  });

  it('a level out of 1-5 plays its nearest; its lines are recorded ones: the question, then the hint in three rungs', () => {
    expect(houseLevel(0)).toBe(1);
    expect(houseLevel(9)).toBe(5);
    const s = generateHouse(3, createRng('lines'));
    expect(s.prompt).toBe('t_puzzle');
    expect(s.hint.rungs.map((r) => r.key)).toEqual(['h1_odd_shape', 'h1_puzzle', 'h3_show']);
    expect(s.hint.rungs[1].steps).toEqual([{ do: 'pulseNext' }]);
    expect(s.hint.rungs[2].steps).toEqual([{ do: 'pulseAnswer' }]);
  });
});

const spec = (places: HouseSpec['body']['places'], pieces: HouseSpec['body']['pieces']): HouseSpec =>
  ({ ...generateHouse(1, createRng('x')), body: { places, pieces } });

describe('the board of the house', () => {
  const s = spec(['wall', 'roof', 'door'], ['door', 'wall', 'roof']);

  it('a piece picked and put on its place stands there; on another place it is put down; nothing picked - nothing happens', () => {
    const b = houseBoard(s);
    expect(b.put(0)).toBe('none');
    expect(b.pick(0)).toBe(true);
    expect(b.put(0)).toBe('wrong');            // the door on the wall's place
    expect(b.picked).toBeNull();
    expect(b.loose()).toEqual([0, 1, 2]);
    b.pick(0);
    expect(b.put(2)).toBe('fit');
    expect(b.placed()).toEqual([0]);
    expect(b.empty()).toEqual([0, 1]);
    expect(b.pick(0)).toBe(false);             // standing: not picked again
    b.pick(1);
    expect(b.put(2)).toBe('none');             // a filled place takes nothing
    expect(b.done).toBe(false);
  });

  it('made of a middle kept, it stands as it was left; anything not a piece of this house is dropped', () => {
    const b = houseBoard(s, [2, 0, 7, -1, 1.5]);
    expect(b.placed()).toEqual([0, 2]);
    expect(b.empty()).toEqual([0]);
    b.pick(1);
    expect(b.put(0)).toBe('fit');
    expect(b.done).toBe(true);
  });
});

function listen() {
  const heard = { prompts: [] as SpokenKey[], hints: [] as SpokenKey[], wrong: 0, good: 0 };
  const quick = () => Promise.resolve() as Spoken;
  const hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'> = {
    prompt: (k) => { heard.prompts.push(k); }, good: () => { heard.good++; },
    wrong: () => { heard.wrong++; return quick(); }, hint: (k) => { heard.hints.push(k); return quick(); },
  };
  return { hooks, heard };
}

/** A view of the house that only records what the task asks of it: the pieces at x = 10 + i, the places at x = k. */
function fakeView() {
  const calls: string[] = [];
  const view: HouseView = {
    center: new THREE.Vector3(), facing: 0, extent: { side: 3, depth: 3 },
    piece: (i) => ({ pos: new THREE.Vector3(10 + i, 0, 0), r: 0.5 }),
    place: (k) => ({ pos: new THREE.Vector3(k, 0, 0), r: 0.5 }),
    picked: (i) => { calls.push(`picked ${i}`); },
    fit: (i, k) => { calls.push(`fit ${i} ${k}`); },
    back: (i, k) => { calls.push(`back ${i} ${k}`); },
    glow: (i, k) => { calls.push(`glow ${i} ${k}`); },
  };
  return { view, calls };
}
/** A tap at x on the line of the fake view (its distance on the "screen" is the distance along x, in pixels x 10). */
const at = (x: number) => (p: THREE.Vector3) => Math.abs(p.x - x) * 10;

describe('the house in the world: taps, the hint, the middle, the door of the walkthrough', () => {
  const s = spec(['wall', 'roof', 'door', 'winSq'], ['winSq', 'door', 'wall', 'roof']);
  const open = (kept: number[] = []) => {
    const { hooks, heard } = listen(), { view, calls } = fakeView(), stored: number[][] = [];
    const show = showHouseInWorld(s, view, hooks, { reach: 40, scope: createWorldScope(new THREE.Scene()), kept, keep: (p) => { stored.push(p); } });
    return { show, heard, calls, stored };
  };

  it('opened: the question; a tap on a piece picks it, a tap on its place puts it in and keeps the middle at once', () => {
    const { show, heard, calls, stored } = open();
    expect(heard.prompts).toEqual(['t_puzzle']);
    expect(show.state()).toMatchObject({ kind: 'house', phase: 'input', wrongs: 0, moves: 0, rung: 0, progress: [] });
    expect(show.tap(at(11))).toBe(true);        // the door
    expect(calls).toEqual(['picked 1']);
    expect(show.targets().map((t) => t.right)).toEqual([false, false, true, false]);   // the empty places, the door's the right one
    show.tap(at(2));
    expect(calls.slice(1)).toEqual(['picked null', 'glow null null', 'fit 1 2']);
    expect(heard.good).toBe(1);
    expect(stored).toEqual([[1]]);
    expect(show.state()).toMatchObject({ moves: 1, progress: [1] });
    // a tap on nothing is the task's too, and does nothing
    expect(show.tap(at(50))).toBe(true);
    expect(show.state().moves).toBe(1);
  });

  it('a wrong place: the piece goes back to where it lay, the mistake goes the way of every task - the hint lights its place, then it and its place', async () => {
    const { show, heard, calls, stored } = open();
    show.tap(at(10)); show.tap(at(0));          // the square window on the wall's place
    expect(calls).toEqual(['picked 0', 'picked null', 'back 0 0']);
    expect(show.state()).toMatchObject({ wrongs: 1, moves: 0, progress: [] });
    expect(stored).toEqual([]);
    expect(show.board.loose()).toContain(0);
    await vi.runAllTimersAsync();
    expect(heard.wrong).toBe(1);
    expect(heard.hints).toEqual(['h1_odd_shape']);
    expect(show.state()).toMatchObject({ phase: 'input', rung: 1 });
    expect(calls.filter((c) => c.startsWith('glow'))).toEqual([]);   // rung 1 only says the way
    show.tap(at(10)); show.tap(at(2));
    await vi.runAllTimersAsync();
    expect(heard.hints.at(-1)).toBe('h1_puzzle');
    expect(calls.at(-1)).toBe('glow null 3');    // its own place glows
    show.tap(at(10)); show.tap(at(1));
    await vi.runAllTimersAsync();
    expect(heard.hints.at(-1)).toBe('h3_show');
    expect(calls.at(-1)).toBe('glow 0 3');       // the piece and its place
    expect(show.state().wrongs).toBe(3);
  });

  it('closed in the middle, it ends unsolved; opened with that middle it goes on from there and ends solved', async () => {
    const first = open();
    first.show.tap(at(12)); first.show.tap(at(0));       // the wall in
    first.show.close();
    expect(await first.show.done).toEqual({ solved: false, wrong: 0 });
    expect(first.show.tap(at(10))).toBe(false);
    const again = open(first.stored.at(-1));
    expect(again.show.state()).toMatchObject({ phase: 'input', wrongs: 0, moves: 1, progress: [2] });
    expect(again.show.targets()).toHaveLength(3);
    again.show.solve();
    expect(again.show.state().progress).toEqual([0, 1, 2, 3]);
    expect(again.stored.at(-1)).toEqual([0, 1, 2, 3]);
    await vi.runAllTimersAsync();
    expect(await again.show.done).toEqual({ solved: true, wrong: 0 });
  });

  it('the door of the walkthrough: a wrong move while one is possible, the middle never the end, solve puts every piece in', async () => {
    const { show, calls } = open();
    expect(show.wrong()).toBe(true);
    expect(calls.filter((c) => c.startsWith('back'))).toHaveLength(1);
    await vi.runAllTimersAsync();
    expect(show.half!()).toBe(2);
    expect(show.state()).toMatchObject({ moves: 2, wrongs: 1 });
    expect(show.half!()).toBe(0);
    // one place left: no place of another shape is empty, so no wrong move
    show.tap(at(show.board.loose()[0] + 10)); show.tap(at(show.board.placeOf(show.board.loose()[0])));
    expect(show.board.empty()).toHaveLength(1);
    expect(show.wrong()).toBe(false);
    show.solve();
    await vi.runAllTimersAsync();
    expect(show.state().phase).toBe('solved');
    expect(show.targets()).toEqual([]);
  });

  it('the world left in the middle: its timer goes with the scope, the task never ends by itself', async () => {
    const { hooks } = listen(), { view } = fakeView(), scope = createWorldScope(new THREE.Scene());
    const show = showHouseInWorld(s, view, hooks, { reach: 40, scope, keep: () => {} });
    let ended = false;
    void show.done.then(() => { ended = true; });
    show.solve();
    scope.dispose();
    await vi.runAllTimersAsync();
    expect(ended).toBe(false);
  });
});
