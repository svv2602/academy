// @vitest-environment node
/** The count generator without a page (ARCH-09, R10): bounds, one right answer, `answer` and `solution`. */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { THINGS } from './types';
import { OPTIONS, RANGE, count } from './count';

const TASKS = 1000;

describe('count generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([1, 2, 3])(`level %i: ${TASKS} tasks stay within bounds and have one right answer`, (level) => {
    const [lo, hi] = RANGE(level), seen = new Set<number>();
    for (let i = 0; i < TASKS; i++) {
      const s = count.generate(level, mulberry32(level * 100_000 + i)), { n, thing, tilt, options, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('count'); expect(s.level, why).toBe(level); expect(s.prompt, why).toBe('t_count');
      expect(Number.isInteger(n) && n >= lo && n <= hi, why).toBe(true);
      expect(THINGS, why).toContain(thing);
      expect(tilt.length, why).toBe(n);
      expect(tilt.every((r) => Number.isInteger(r) && r >= -12 && r <= 12), why).toBe(true);
      expect(options, why).toEqual(OPTIONS);
      expect(answer, why).toBe(n);
      expect(options.filter((v) => count.answer(s, count.start(s), v) === 'right'), why).toEqual([n]);
      expect(count.solution(s, count.start(s)), why).toEqual([n]);
      seen.add(n);
    }
    expect([...seen].sort((a, b) => a - b), 'every number of the level is asked').toEqual(Array.from({ length: hi - lo + 1 }, (_, i) => lo + i));
  });

  it('the hint counts all the things aloud, then pulses the answer from the second mistake', () => {
    expect(count.generate(1, mulberry32(1)).hint).toEqual({ key: 'h_count', steps: [{ do: 'countAloud', which: 'all' }, { do: 'pulseAnswer', fromMistake: 2 }] });
  });
});
