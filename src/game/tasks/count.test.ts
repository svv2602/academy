// @vitest-environment node
/**
 * The count generator without a page (ARCH-09, R10): bounds, one right answer, `answer` and `solution`; the ladder of
 * levels 4-5 (LEARN-05: 11-15 and 16-20 things, the answer among four numbers up to 20).
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { THINGS } from './types';
import { OPTIONS, RANGE, TOP, count } from './count';

const TASKS = 1000;

describe('count generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it('the things of each level follow the ladder: 3-6, 5-9, 7-10, 11-15, 16-20 (a level above 5 is the fifth)', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(RANGE)).toEqual([[3, 6], [5, 9], [7, 10], [11, 15], [16, 20], [16, 20], [16, 20]]);
    expect(TOP).toBe(20);
  });

  it.each([1, 2, 3, 4, 5, 6])(`level %i: ${TASKS} tasks stay within bounds and have one right answer`, (level) => {
    const [lo, hi] = RANGE(level), seen = new Set<number>();
    for (let i = 0; i < TASKS; i++) {
      const s = count.generate(level, mulberry32(level * 100_000 + i)), { n, thing, tilt, options, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('count'); expect(s.level, why).toBe(level); expect(s.prompt, why).toBe('t_count');
      expect(Number.isInteger(n) && n >= lo && n <= hi, why).toBe(true);
      expect(THINGS, why).toContain(thing);
      expect(tilt.length, why).toBe(n);
      expect(tilt.every((r) => Number.isInteger(r) && r >= -12 && r <= 12), why).toBe(true);
      if (level <= 3) expect(options, why).toEqual(OPTIONS);
      else {
        expect(options.length, why).toBe(4);
        expect(options.every((v) => Number.isInteger(v) && v >= 0 && v <= TOP), why).toBe(true);
        expect(options, why).toEqual([...new Set(options)].sort((a, b) => a - b));
        expect(options.every((v) => Math.abs(v - n) <= 3), 'the other numbers stand around the answer').toBe(true);
      }
      expect(answer, why).toBe(n);
      expect(options.filter((v) => count.answer(s, count.start(s), v) === 'right'), why).toEqual([n]);
      expect(count.solution(s, count.start(s)), why).toEqual([n]);
      seen.add(n);
    }
    expect([...seen].sort((a, b) => a - b), 'every number of the level is asked').toEqual(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
  });

  it.each([4, 5])(`level %i: over ${TASKS} tasks every number up to 20 near the answer is offered, and the answer sits in every place`, (level) => {
    const offered = new Set<number>(), places = new Set<number>();
    for (let i = 0; i < TASKS; i++) {
      const { options, answer } = count.generate(level, mulberry32(level * 100_000 + i)).body;
      options.forEach((v) => offered.add(v)); places.add(options.indexOf(answer));
    }
    const [lo, hi] = RANGE(level);
    expect([...offered].sort((a, b) => a - b)).toEqual(Array.from({ length: Math.min(TOP, hi + 3) - (lo - 3) + 1 }, (_, i) => lo - 3 + i));
    expect([...places].sort()).toEqual([0, 1, 2, 3]);
  });

  it.each([4, 5])('level %i: one seed, one task', (level) => {
    for (let i = 0; i < 50; i++) expect(count.generate(level, mulberry32(i))).toEqual(count.generate(level, mulberry32(i)));
  });

  it('the hint counts all the things aloud, then pulses the answer from the second mistake', () => {
    expect(count.generate(1, mulberry32(1)).hint).toEqual({ key: 'h_count', steps: [{ do: 'countAloud', which: 'all' }, { do: 'pulseAnswer', fromMistake: 2 }] });
  });
});
