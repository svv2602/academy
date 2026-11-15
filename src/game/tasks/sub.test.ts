// @vitest-environment node
/** The sub generator without a page (ARCH-09, R10): bounds, one right answer, `answer` and `solution`. */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { THINGS } from './types';
import { MAX, sub } from './sub';

const TASKS = 1000;

describe('sub generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([1, 2, 3])(`level %i: ${TASKS} tasks stay within bounds and have one right answer`, (level) => {
    const max = MAX(level);
    for (let i = 0; i < TASKS; i++) {
      const s = sub.generate(level, mulberry32(level * 100_000 + i)), { total, gone, thing, tilt, options, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('sub'); expect(s.prompt, why).toBe('t_sub');
      expect(Number.isInteger(total) && total >= 3 && total <= max, why).toBe(true);
      expect(Number.isInteger(gone) && gone >= 1 && gone <= total - 1, why).toBe(true);
      expect(THINGS, why).toContain(thing);
      expect(tilt.length, why).toBe(total);
      expect(tilt.every((r) => Number.isInteger(r) && r >= -12 && r <= 12), why).toBe(true);
      expect(answer, why).toBe(total - gone);
      expect(options.length, why).toBe(4);
      expect(new Set(options).size, why).toBe(4);
      expect(options.every((v) => Number.isInteger(v) && v >= 0 && v <= 10), why).toBe(true);
      expect(options.filter((v) => sub.answer(s, sub.start(s), v) === 'right'), why).toEqual([total - gone]);
      expect(sub.solution(s, sub.start(s)), why).toEqual([total - gone]);
    }
  });

  it('the hint counts the things that are left, then pulses the answer from the second mistake', () => {
    expect(sub.generate(3, mulberry32(1)).hint).toEqual({ key: 'h_left', steps: [{ do: 'countAloud', which: 'left' }, { do: 'pulseAnswer', fromMistake: 2 }] });
  });
});
