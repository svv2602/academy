// @vitest-environment node
/**
 * A chain of two actions without a page (LEARN-27, ARCH-09): "8 + 5 − 6" and "15 − 7 + 4" - the bounds (the first
 * number 5..15, the two others 2..9 and not the same, the number between the actions and the answer within 1..20), one
 * right answer, both orders of the actions, the hint.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { THINGS } from './types';
import { ADD_FIRST, FIRST, STEP, SUB_FIRST, WITHIN, chain, example, run } from './chain';

/** The hint as HINTS.md has it: rung 1 says the way and shows nothing, rung 2 solves it together, rung 3 lights the answer. */
const LADDER = (way: string, key: string, steps: object[]) =>
  ({ rungs: [{ key: way, steps: [] }, { key, steps }, { key: 'h3_show', steps: [{ do: 'pulseAnswer' }] }] });

const TASKS = 1000;
const tasks = (level: number, n = TASKS) => Array.from({ length: n }, (_, i) => chain.generate(level, mulberry32(level * 100_000 + i)));

describe('chain generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it('the bounds of the task: the first number 5..15, the number of an action 2..9, never past 1..20 on the way', () => {
    expect([FIRST, STEP, WITHIN]).toEqual([[5, 15], [2, 9], [1, 20]]);
  });

  it.each([1, 3, 5, 6])(`asked with level %i: ${TASKS} tasks stay within bounds and have one right answer`, (level) => {
    for (let i = 0; i < TASKS; i++) {
      const s = chain.generate(level, mulberry32(level * 100_000 + i)), { first, addsFirst, second, third, mid, thing, tilt, options, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect([s.type, s.level, s.prompt, s.ask], why).toEqual(['chain', level, 't_chain', undefined]);
      expect(Number.isInteger(first) && first >= 5 && first <= 15, why).toBe(true);
      expect([second, third].every((x) => Number.isInteger(x) && x >= 2 && x <= 9), why).toBe(true);
      expect(second, why).not.toBe(third);
      // worked out here by itself: one action adds, the other takes away
      const wantMid = addsFirst ? first + second : first - second, want = addsFirst ? wantMid - third : wantMid + third;
      expect([mid, answer], why).toEqual([wantMid, want]);
      expect(mid >= 1 && mid <= 20 && answer >= 1 && answer <= 20, why).toBe(true);
      expect(answer, why).not.toBe(first);
      expect(THINGS, why).toContain(thing);
      // the things drawn: the first number, and the ones the first action adds
      expect(tilt.length, why).toBe(addsFirst ? mid : first);
      expect(tilt.every((r) => Number.isInteger(r) && r >= -12 && r <= 12), why).toBe(true);
      expect(options.length, why).toBe(4);
      expect(new Set(options).size, why).toBe(4);
      expect(options.every((v) => Number.isInteger(v) && v >= 0 && v <= 20), why).toBe(true);
      expect([...options].sort((x, y) => x - y), 'options are in ascending order').toEqual(options);
      expect(options.filter((v) => chain.answer(s, chain.start(s), v) === 'right'), why).toEqual([answer]);
      expect(chain.solution(s, chain.start(s)), why).toEqual([answer]);
    }
  });

  it('the numbers do not follow the level: one seed is the same example on any level', () => {
    for (let i = 0; i < 50; i++) {
      const [one, five] = [1, 5].map((level) => chain.generate(level, mulberry32(i)));
      expect(five.body).toEqual(one.body);
      expect([one.level, five.level]).toEqual([1, 5]);
    }
  });

  it('both orders of the actions come up, about as often; every first number and every number of an action too', () => {
    const all = tasks(5, 3000), adds = all.filter((s) => s.body.addsFirst).length;
    expect(adds / all.length).toBeGreaterThan(0.45);
    expect(adds / all.length).toBeLessThan(0.55);
    for (const order of [true, false]) {
      const of = all.filter((s) => s.body.addsFirst === order);
      expect(new Set(of.map((s) => s.body.first)), `adds first: ${order}`).toEqual(new Set([5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]));
      expect(new Set(of.map((s) => s.body.second)), `adds first: ${order}`).toEqual(new Set([2, 3, 4, 5, 6, 7, 8, 9]));
      expect(new Set(of.map((s) => s.body.third)), `adds first: ${order}`).toEqual(new Set([2, 3, 4, 5, 6, 7, 8, 9]));
    }
    expect(new Set(all.map((s) => `${s.body.addsFirst}:${s.body.first}:${s.body.second}:${s.body.third}`)).size).toBeGreaterThan(700);
  });

  it('the chains of each order: every one within the bounds, each once', () => {
    for (const [addsFirst, list] of [[true, ADD_FIRST], [false, SUB_FIRST]] as const) {
      const want: string[] = [];
      for (let a = 5; a <= 15; a++) for (let b = 2; b <= 9; b++) for (let c = 2; c <= 9; c++) {
        const mid = addsFirst ? a + b : a - b, end = addsFirst ? mid - c : mid + c;
        if (b !== c && mid >= 1 && mid <= 20 && end >= 1 && end <= 20) want.push(`${a},${b},${c}`);
      }
      expect(list.map((x) => x.join()), `adds first: ${addsFirst}`).toEqual(want);
      expect(want.length).toBeGreaterThan(300);
    }
    // the edges: 15 + 5 reaches twenty and may go on down; 15 + 6 is past it; 9 − 8 leaves one, 9 − 9 nothing
    expect(ADD_FIRST.some((x) => x.join() === '15,5,3')).toBe(true);
    expect(ADD_FIRST.some(([a, b]) => a + b > 20)).toBe(false);
    expect(SUB_FIRST.some((x) => x.join() === '9,8,2')).toBe(true);
    expect(SUB_FIRST.some(([a, b]) => a - b < 1)).toBe(false);
    expect(SUB_FIRST.some(([a, b, c]) => a - b + c > 20)).toBe(false);
  });

  it('run: the number after the first action and the answer', () => {
    expect(run(true, [8, 5, 6])).toEqual([13, 7]);
    expect(run(false, [15, 7, 4])).toEqual([8, 12]);
  });

  it('the hint: first one action, then the other; then worked out together action by action; then the answer pulses', () => {
    for (const s of tasks(5, 100)) expect(s.hint).toEqual(LADDER('h1_chain', 'h2_chain', [{ do: 'showMid' }]));
  });

  it('the task of a chosen chain is the one the generator builds of it', () => {
    for (const s of tasks(5, 200)) {
      const { first, addsFirst, second, third } = s.body, e = example(5, addsFirst, [first, second, third], mulberry32(first * 100 + second * 10 + third));
      expect([e.type, e.level, e.prompt, e.ask, e.hint]).toEqual([s.type, s.level, s.prompt, s.ask, s.hint]);
      expect([e.body.first, e.body.addsFirst, e.body.second, e.body.third, e.body.mid, e.body.answer, e.body.tilt.length])
        .toEqual([first, addsFirst, second, third, s.body.mid, s.body.answer, s.body.tilt.length]);
      expect(e.body.options).toContain(s.body.answer);
    }
  });
});
