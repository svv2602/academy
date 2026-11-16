// @vitest-environment node
/**
 * The missing addend without a page (LEARN-06, R07-R08): "a + ? = sum", bounds of each level, one right answer among
 * the options (how many are missing, not the sum), and the hint of HINTS.md - counting on from the known addend.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { THINGS } from './types';
import { MAX, missing } from './missing';

const LADDER = (way: string) => ({ rungs: [{ key: way, steps: [] }, { key: 'h2_missing', steps: [{ do: 'countUp' }] }, { key: 'h3_show', steps: [{ do: 'pulseAnswer' }] }] });
const TASKS = 1000;
const tasks = (level: number) => Array.from({ length: TASKS }, (_, i) => missing.generate(level, mulberry32(level * 100_000 + i)));

describe('missing addend generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([3, 4, 5, 6])(`level %i: ${TASKS} tasks stay within bounds, the answer is sum - a and the only right option`, (level) => {
    for (const s of tasks(level)) {
      const { a, sum, thing, tilt, options, answer } = s.body, why = JSON.stringify(s.body);
      expect(s.type, why).toBe('missing'); expect(s.prompt, why).toBe('t_missing'); expect(s.level, why).toBe(level);
      expect(Number.isInteger(a) && a >= 1 && a < sum, why).toBe(true);
      expect(sum <= MAX(level), why).toBe(true);
      expect(answer, why).toBe(sum - a);
      expect(answer >= 1, why).toBe(true);
      expect(THINGS, why).toContain(thing);
      expect(tilt.length, why).toBe(a);
      expect(options.length, why).toBe(4);
      expect(new Set(options).size, why).toBe(4);
      expect(options.every((v) => Number.isInteger(v) && v >= 0 && v <= MAX(level)), why).toBe(true);
      expect([...options].sort((x, y) => x - y), why).toEqual(options);
      expect(options.filter((v) => missing.answer(s, missing.start(s), v) === 'right'), why).toEqual([sum - a]);
      expect(missing.answer(s, missing.start(s), sum), 'the sum itself is not the answer').toBe('wrong');
      expect(missing.solution(s, missing.start(s)), why).toEqual([sum - a]);
    }
  });

  it('the largest sum: 10 up to level 4, then 20', () => {
    expect([3, 4, 5, 6].map(MAX)).toEqual([10, 10, 20, 20]);
  });

  it(`level 3: ${TASKS} sums 3..10, every sum and every known addend 1..9 come up`, () => {
    const all = tasks(3);
    expect(new Set(all.map((s) => s.body.sum))).toEqual(new Set([3, 4, 5, 6, 7, 8, 9, 10]));
    expect(new Set(all.map((s) => s.body.a)).size).toBe(9);
  });

  it.each([5, 6])(`level %i: each of ${TASKS} crosses the ten (8 + ? = 13): one-digit numbers, the sum 11..18`, (level) => {
    const all = tasks(level);
    for (const { body: { a, sum, answer } } of all) {
      const why = `${a} + ? = ${sum}`;
      expect(a >= 2 && a <= 9 && answer >= 2 && answer <= 9, why).toBe(true);
      expect(sum >= 11 && sum <= 18, why).toBe(true);
    }
    expect(new Set(all.map((s) => s.body.sum))).toEqual(new Set([11, 12, 13, 14, 15, 16, 17, 18]));
  });

  it('the hint: the way (count on from the known number; across the ten - first to ten), counting up together, the answer lit', () => {
    for (const level of [3, 4]) for (const s of tasks(level).slice(0, 50)) expect(s.hint).toEqual(LADDER('h1_missing'));
    for (const level of [5, 6]) for (const s of tasks(level).slice(0, 50)) expect(s.hint).toEqual(LADDER('h1_missing_ten'));
  });
});
