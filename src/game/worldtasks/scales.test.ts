/**
 * "The scales with candies" (./scales.ts, WORLD-22): the generator on the boundaries of the levels of "Comparing" (the
 * numbers of the row «Сравнение», docs/11-learning.md), the right weight the only one, the signs at level 5; the angle
 * of the beam - it tilts to the bigger side; the course of the task over a view - a right weight balances, a wrong one
 * comes back with the hint in three rungs, the walkthrough's door.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import type { SpokenKey } from '../../ui/strings';
import { createWorldScope } from '../scope';
import { GAP, MAX } from '../tasks/compare';
import { SIGNS, signOf } from '../tasks/signs';
import type { TaskHooks } from '../taskviews/panel';
import {
  CANDIES, TILT_MAX, TILT_MIN, WALK_MISTAKES, WEIGHTS, angleOf, balances, beamAngle, generateScales, rightOnes, scalesLevel, showScalesInWorld, sides,
  type ScalesSpec, type ScalesView,
} from './scales';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

const many = (level: number, n = 400) => Array.from({ length: n }, (_, i) => generateScales(level, createRng(`scales-${level}-${i}`)));
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

describe('the scales by the level of "Comparing" (WORLD-22)', () => {
  it.each([1, 2, 3, 4])('level %i: candies on the left pan, the right one empty, 2-4 weights - exactly one balances, the others at least the gap away', (level) => {
    for (const s of many(level)) {
      const { mode, left, right, choices, answer } = s.body;
      expect(s.level).toBe(level);
      expect(mode).toBe('weight');
      expect(right).toEqual([]);
      expect(left).toHaveLength(CANDIES(level));
      expect(choices).toHaveLength(WEIGHTS(level));
      expect(choices.length).toBeGreaterThanOrEqual(2);
      expect(choices.length).toBeLessThanOrEqual(4);
      // the right weight is the only one, and it is the candies' together
      expect(rightOnes(s.body)).toEqual([answer]);
      expect(choices[answer]).toBe(sum(left));
      expect(new Set(choices).size, choices.join(' ')).toBe(choices.length);
      for (const w of choices) {
        expect(Number.isInteger(w)).toBe(true);
        expect(w as number).toBeGreaterThanOrEqual(1);
        expect(w as number).toBeLessThanOrEqual(MAX(level));
        if (w !== choices[answer]) expect(Math.abs((w as number) - sum(left))).toBeGreaterThanOrEqual(GAP(level));
      }
      for (const c of left) expect(c).toBeGreaterThanOrEqual(1);
    }
  });

  it('the boundaries of the levels: up to 5 with a gap of 2, up to 8, up to 10, 11 to 20 written as digits - each reached', () => {
    const totals = (l: number) => many(l).map((s) => sum(s.body.left));
    const weights = (l: number) => many(l).flatMap((s) => s.body.choices as number[]);
    expect([Math.min(...totals(1)), Math.max(...totals(1))]).toEqual([1, 5]);
    expect([Math.min(...totals(2)), Math.max(...totals(2))]).toEqual([1, 8]);
    expect([Math.min(...totals(3)), Math.max(...totals(3))]).toEqual([3, 10]);
    expect([Math.min(...totals(4)), Math.max(...totals(4))]).toEqual([11, 20]);
    expect(Math.max(...weights(1))).toBe(5);
    expect(Math.max(...weights(2))).toBe(8);
    expect(Math.max(...weights(3))).toBe(10);
    expect(Math.max(...weights(4))).toBe(20);
    // the gap of level 1 is 2: never a weight next to the right one; from level 2 a weight one away comes up
    const nextTo = (l: number) => many(l).some((s) => (s.body.choices as number[]).some((w, i) => i !== s.body.answer && Math.abs(w - (s.body.choices[s.body.answer] as number)) === 1));
    expect(nextTo(1)).toBe(false);
    expect(nextTo(2)).toBe(true);
    // level 4: a candy of ten and some with a small one
    for (const s of many(4)) expect(Math.max(...s.body.left)).toBeGreaterThanOrEqual(10);
    // the right weight lies anywhere in the row
    for (const l of [2, 3, 4]) expect(new Set(many(l).map((s) => s.body.answer)).size, `level ${l}`).toBe(WEIGHTS(l));
  });

  it('level 5: both sides on the pans, numbers to 20, the three signs to choose - the right one is the sign between the sides, equal sides come up', () => {
    const all = many(5);
    for (const s of all) {
      const { mode, left, right, choices, answer } = s.body;
      expect(mode).toBe('sign');
      expect(left).toHaveLength(1);
      expect(right).toHaveLength(1);
      for (const n of [...left, ...right]) { expect(n).toBeGreaterThanOrEqual(1); expect(n).toBeLessThanOrEqual(20); }
      expect(choices).toEqual([...SIGNS]);
      expect(rightOnes(s.body)).toEqual([answer]);
      expect(choices[answer]).toBe(signOf(left[0], right[0]));
    }
    const seen = new Set(all.map((s) => s.body.choices[s.body.answer]));
    expect(seen).toEqual(new Set(['>', '<', '=']));
    // the panel's lines of the signs
    expect(all[0].prompt).toBe('t_signs');
    expect(all[0].hint.rungs.map((r) => r.key)).toEqual(['h1_signs', 'h2_signs', 'h3_show']);
  });

  it('a level out of 1-5 plays its nearest; the weights\' lines are recorded ones, the hint in three rungs', () => {
    expect(scalesLevel(0)).toBe(1);
    expect(scalesLevel(9)).toBe(5);
    const s = generateScales(3, createRng('lines'));
    expect(s.prompt).toBe('t_missing');
    expect(s.hint.rungs.map((r) => r.key)).toEqual(['h1_compare_num', 'h2_compare_num', 'h3_show']);
    expect(s.hint.rungs[1].steps).toEqual([{ do: 'showNumbers' }]);
    expect(s.hint.rungs[2].steps).toEqual([{ do: 'pulseAnswer' }]);
  });
});

describe('the beam tilts to the bigger side', () => {
  it('positive - the left pan down, negative - the right one, 0 - balanced; never less than visible, never past the most', () => {
    expect(beamAngle(8, 5)).toBeGreaterThan(0);
    expect(beamAngle(5, 8)).toBeLessThan(0);
    expect(beamAngle(7, 7)).toBe(0);
    expect(beamAngle(5, 8)).toBeCloseTo(-beamAngle(8, 5));
    expect(beamAngle(10, 9)).toBeCloseTo(TILT_MIN);
    expect(beamAngle(20, 1)).toBeCloseTo(TILT_MAX);
    expect(Math.abs(beamAngle(12, 4))).toBeGreaterThan(Math.abs(beamAngle(12, 10)));
  });

  const weight: ScalesSpec['body'] = { mode: 'weight', left: [8, 5], right: [], choices: [9, 13, 16], answer: 1 };
  it('the weights: waiting, the candies weigh their pan down; a light weight leaves it down, a heavy one tips the other way, the right one balances', () => {
    expect(angleOf(weight, null)).toBeGreaterThan(0);
    expect(angleOf(weight, 0)).toBeGreaterThan(0);     // 13 against 9: the left pan still down
    expect(angleOf(weight, 2)).toBeLessThan(0);        // 13 against 16: the weight's pan down
    expect(angleOf(weight, 1)).toBe(0);
    expect(sides(weight, 16)).toEqual([13, 16]);
  });

  it('the signs: held level while she chooses, a wrong sign leaves it held, the right one lets it tilt to the bigger side', () => {
    const sign = (a: number, b: number): ScalesSpec['body'] => ({ mode: 'sign', left: [a], right: [b], choices: [...SIGNS], answer: SIGNS.indexOf(signOf(a, b)) });
    expect(angleOf(sign(14, 9), null)).toBe(0);
    expect(angleOf(sign(14, 9), SIGNS.indexOf('<'))).toBe(0);
    expect(angleOf(sign(14, 9), SIGNS.indexOf('>'))).toBeGreaterThan(0);
    expect(angleOf(sign(3, 17), SIGNS.indexOf('<'))).toBeLessThan(0);
    expect(angleOf(sign(6, 6), SIGNS.indexOf('='))).toBe(0);
    expect(balances(sign(6, 6), '=')).toBe(true);
    expect(balances(sign(6, 6), '>')).toBe(false);
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

/** A view that only records what the task asks of it: choice i at x = i. */
function fakeView() {
  const calls: string[] = [];
  const view: ScalesView = {
    center: new THREE.Vector3(), facing: 0, extent: { side: 2, depth: 2 },
    choice: (i) => ({ pos: new THREE.Vector3(i, 0, 0), r: 0.2 }),
    put: (i, a) => { calls.push(`put ${i} ${Math.sign(a)}`); },
    back: (i, a, rest) => { calls.push(`back ${i} ${Math.sign(a)} ${Math.sign(rest)}`); },
    dots: (on) => { calls.push(`dots ${on}`); },
    glow: (i) => { calls.push(`glow ${i}`); },
    clear: (solved) => { calls.push(`clear ${solved}`); },
  };
  return { view, calls };
}
const at = (x: number) => (p: THREE.Vector3) => Math.abs(p.x - x) * 10;

describe('the scales in the world: taps, the hint, the door of the walkthrough', () => {
  const s: ScalesSpec = { ...generateScales(4, createRng('x')), body: { mode: 'weight', left: [8, 5], right: [], choices: [9, 13, 16], answer: 1 } };
  const open = () => {
    const { hooks, heard } = listen(), { view, calls } = fakeView();
    const show = showScalesInWorld(s, view, hooks, { reach: 40, scope: createWorldScope(new THREE.Scene()) });
    return { show, heard, calls };
  };

  it('opened: the question; a tap on the right weight balances the scales and the task ends solved', async () => {
    const { show, heard, calls } = open();
    expect(heard.prompts).toEqual(['t_missing']);
    expect(show.state()).toMatchObject({ kind: 'scales', phase: 'input', wrongs: 0, moves: 0, rung: 0, progress: [] });
    expect(show.targets().map((t) => t.right)).toEqual([false, true, false]);
    expect(show.tap(at(1))).toBe(true);
    expect(calls).toEqual(['dots false', 'glow null', 'put 1 0']);
    expect(heard.good).toBe(1);
    expect(show.state()).toMatchObject({ phase: 'solved', moves: 1 });
    // no more input while it settles
    expect(show.tap(at(0))).toBe(false);
    await vi.runAllTimersAsync();
    expect(await show.done).toEqual({ solved: true, wrong: 0 });
    expect(calls.at(-1)).toBe('clear true');
  });

  it('a wrong weight goes on, tips the beam the way it is wrong and comes back; three mistakes - the way, the dots, the right weight lit', async () => {
    const { show, heard, calls } = open();
    show.tap(at(2));                                    // 16 against 13: the weight's pan goes down, then back to the candies' side
    expect(calls).toEqual(['back 2 -1 1']);
    expect(show.state()).toMatchObject({ wrongs: 1, moves: 0, phase: 'mistake' });
    await vi.runAllTimersAsync();
    expect(heard.wrong).toBe(1);
    expect(heard.hints).toEqual(['h1_compare_num']);
    expect(show.state()).toMatchObject({ phase: 'input', rung: 1 });
    expect(calls.filter((c) => c.startsWith('dots') || c.startsWith('glow'))).toEqual([]);   // rung 1 only says the way
    show.tap(at(0));                                    // 9 against 13: the candies' pan stays down
    expect(calls.at(-1)).toBe('back 0 1 1');
    await vi.runAllTimersAsync();
    expect(heard.hints.at(-1)).toBe('h2_compare_num');
    expect(calls.at(-1)).toBe('dots true');
    show.tap(at(2));
    await vi.runAllTimersAsync();
    expect(heard.hints.at(-1)).toBe('h3_show');
    expect(calls.at(-1)).toBe('glow 1');
    expect(show.state()).toMatchObject({ wrongs: 3, rung: 3, phase: 'input' });
    show.tap(at(1));
    await vi.runAllTimersAsync();
    expect(await show.done).toEqual({ solved: true, wrong: 3 });
  });

  it('the door of the walkthrough: three wrong moves asked for, a wrong move always possible, solve puts the right one; closed - all taken away', async () => {
    const { show, calls } = open();
    expect(show.mistakes).toBe(WALK_MISTAKES);
    expect(WALK_MISTAKES).toBe(3);
    for (let k = 1; k <= 3; k++) { expect(show.wrong()).toBe(true); await vi.runAllTimersAsync(); expect(show.state()).toMatchObject({ wrongs: k, rung: k, phase: 'input' }); }
    show.close();
    expect(await show.done).toEqual({ solved: false, wrong: 3 });
    expect(calls.at(-1)).toBe('clear false');
    expect(show.wrong()).toBe(false);
    expect(show.targets()).toEqual([]);
    const again = open();
    again.show.solve();
    await vi.runAllTimersAsync();
    expect(await again.show.done).toEqual({ solved: true, wrong: 0 });
  });

  it('the signs: the right sign lets the beam go to the bigger side; a wrong one comes back and the beam stays held; the hint lays out both sides', async () => {
    const { hooks, heard } = listen(), { view, calls } = fakeView();
    const sign: ScalesSpec = generateScales(5, createRng('s'));
    sign.body = { mode: 'sign', left: [4], right: [11], choices: [...SIGNS], answer: SIGNS.indexOf('<') };
    const show = showScalesInWorld(sign, view, hooks, { reach: 40, scope: createWorldScope(new THREE.Scene()) });
    expect(heard.prompts).toEqual(['t_signs']);
    show.tap(at(SIGNS.indexOf('>')));
    expect(calls).toEqual(['back 0 0 0']);
    await vi.runAllTimersAsync();
    show.tap(at(SIGNS.indexOf('=')));
    await vi.runAllTimersAsync();
    expect(heard.hints).toEqual(['h1_signs', 'h2_signs']);
    expect(calls.at(-1)).toBe('dots true');            // pairUp: both sides as dots
    show.tap(at(SIGNS.indexOf('<')));
    expect(calls.at(-1)).toBe('put 1 -1');              // the right pan, the bigger side, goes down
    await vi.runAllTimersAsync();
    expect(await show.done).toEqual({ solved: true, wrong: 2 });
  });

  it('the world left in the middle: its timer goes with the scope, the task never ends by itself', async () => {
    const { hooks } = listen(), { view } = fakeView(), scope = createWorldScope(new THREE.Scene());
    const show = showScalesInWorld(s, view, hooks, { reach: 40, scope });
    let ended = false;
    void show.done.then(() => { ended = true; });
    show.solve();
    scope.dispose();
    await vi.runAllTimersAsync();
    expect(ended).toBe(false);
  });
});
