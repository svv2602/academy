// @vitest-environment node
/** The add generator without a page (ARCH-09, R10): bounds, one right answer, `answer` and `solution`. */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { THINGS } from './types';
import { MAX, add } from './add';

const TASKS = 1000;

describe('add generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([1, 2, 3])(`level %i: ${TASKS} tasks stay within bounds and have one right answer`, (level) => {
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
      expect(options.every((v) => Number.isInteger(v) && v >= 0 && v <= 10), why).toBe(true);
      expect([...options].sort((x, y) => x - y), 'options are in ascending order').toEqual(options);
      expect(options.filter((v) => add.answer(s, add.start(s), v) === 'right'), why).toEqual([a + b]);
      expect(add.solution(s, add.start(s)), why).toEqual([a + b]);
    }
  });

  it('the hint counts all the things aloud, then pulses the answer from the second mistake', () => {
    expect(add.generate(2, mulberry32(1)).hint).toEqual({ key: 'h_count', steps: [{ do: 'countAloud', which: 'all' }, { do: 'pulseAnswer', fromMistake: 2 }] });
  });
});
