// @vitest-environment node
/**
 * The add generator without a page (ARCH-09, R10): bounds, one right answer, `answer` and `solution`; the ladder of
 * levels 4-5 (LEARN-04: up to 20, without and with crossing the ten) and no 1 + 1 from level 2 (LEARN-13).
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { THINGS } from './types';
import { MAX, add } from './add';

const TASKS = 1000;
/** The ones of the two numbers make a ten or more: the sum crosses the ten (8 + 5) or ends on it (13 + 7). */
const crosses = (a: number, b: number) => (a % 10) + (b % 10) >= 10;
const tasks = (level: number) => Array.from({ length: TASKS }, (_, i) => add.generate(level, mulberry32(level * 100_000 + i)));

describe('add generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([1, 2, 3, 4, 5, 6])(`level %i: ${TASKS} tasks stay within bounds and have one right answer`, (level) => {
    const max = MAX(level);
    for (let i = 0; i < TASKS; i++) {
      const s = add.generate(level, mulberry32(level * 100_000 + i)), { a, b, thing, tilt, options, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('add'); expect(s.prompt, why).toBe('t_add');
      expect([a, b].every((x) => Number.isInteger(x) && x >= 1 && x <= max - 1), why).toBe(true);
      expect(a + b <= max, why).toBe(true);
      expect(THINGS, why).toContain(thing);
      expect(tilt.length, why).toBe(a + b);
      expect(tilt.every((r) => Number.isInteger(r) && r >= -12 && r <= 12), why).toBe(true);
      expect(answer, why).toBe(a + b);
      expect(options.length, why).toBe(4);
      expect(new Set(options).size, why).toBe(4);
      expect(options.every((v) => Number.isInteger(v) && v >= 0 && v <= (level <= 3 ? 10 : 20)), why).toBe(true);
      expect(answer >= 0 && answer <= 20, why).toBe(true);
      expect([...options].sort((x, y) => x - y), 'options are in ascending order').toEqual(options);
      expect(options.filter((v) => add.answer(s, add.start(s), v) === 'right'), why).toEqual([a + b]);
      expect(add.solution(s, add.start(s)), why).toEqual([a + b]);
    }
  });

  it('the largest sum of each level: 5, 8, 10, then 20 (a level above 5 is the fifth)', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(MAX)).toEqual([5, 8, 10, 20, 20, 20, 20]);
  });

  it(`level 4: ${TASKS} sums up to 20 with a ten in the first number, none crosses the ten (12 + 5)`, () => {
    const all = tasks(4);
    for (const { body: { a, b } } of all) {
      const why = `${a} + ${b}`;
      expect(a >= 10 && a <= 18 && b >= 1 && b <= 9, why).toBe(true);
      expect(a + b <= 19, why).toBe(true);
      expect(crosses(a, b), why).toBe(false);
    }
    // every first number of the level and every one-digit second one come up
    expect(new Set(all.map((s) => s.body.a)).size).toBe(9);
    expect(new Set(all.map((s) => s.body.b)).size).toBe(9);
  });

  it.each([5, 6])(`level %i: each of ${TASKS} examples crosses the ten (8 + 5), the sum 11..18`, (level) => {
    const all = tasks(level);
    for (const { body: { a, b } } of all) {
      const why = `${a} + ${b}`;
      expect(a >= 2 && a <= 9 && b >= 2 && b <= 9, why).toBe(true);
      expect(a + b >= 11 && a + b <= 18, why).toBe(true);
      expect(crosses(a, b), why).toBe(true);
    }
    expect(new Set(all.map((s) => s.body.a + s.body.b))).toEqual(new Set([11, 12, 13, 14, 15, 16, 17, 18]));
  });

  it.each([2, 3, 4, 5, 6])(`level %i: none of ${TASKS} examples is 1 + 1 (LEARN-13)`, (level) => {
    for (const { body: { a, b } } of tasks(level)) expect(a === 1 && b === 1, `${a} + ${b}`).toBe(false);
  });

  it('level 1 may still ask 1 + 1: the filter starts at level 2', () => {
    expect(tasks(1).some((s) => s.body.a === 1 && s.body.b === 1)).toBe(true);
  });

  it('the hint counts all the things aloud, then pulses the answer from the second mistake', () => {
    expect(add.generate(2, mulberry32(1)).hint).toEqual({ key: 'h_count', steps: [{ do: 'countAloud', which: 'all' }, { do: 'pulseAnswer', fromMistake: 2 }] });
  });
});
