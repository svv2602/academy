// @vitest-environment node
/** The numbers-in-order generator and model without a page (ARCH-09, R10): bounds, and tapping from the smallest. */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { COUNT, order } from './order';

const TASKS = 1000;
const BOUNDS = [[0, 0], [1, 6], [1, 9], [1, 10]];   // lowest, highest number by level

describe('order generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([1, 2, 3])(`level %i: ${TASKS} tasks stay within bounds and are solved from the smallest`, (level) => {
    const [lo, hi] = BOUNDS[level];
    for (let i = 0; i < TASKS; i++) {
      const s = order.generate(level, mulberry32(level * 100_000 + i)), { shown, sorted } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('order'); expect(s.level, why).toBe(level); expect(s.prompt, why).toBe('t_order');
      expect(shown.length, why).toBe(COUNT(level));
      expect(new Set(shown).size, why).toBe(shown.length);
      expect(shown.every((v) => Number.isInteger(v) && v >= lo && v <= hi), why).toBe(true);
      expect(sorted, why).toEqual([...shown].sort((a, b) => a - b));
      if (level === 1) expect(sorted[0] <= 3, why).toBe(true);
      if (level < 3) expect(sorted.every((v, k) => v === sorted[0] + k), `${why}: levels 1 and 2 show consecutive numbers`).toBe(true);
      const st = order.start(s);
      expect(order.solution(s, st), why).toEqual(sorted);
      expect(sorted.map((v) => order.answer(s, st, v)), why).toEqual([...sorted.slice(1).map(() => 'step'), 'right']);
    }
  });

  it('a number out of turn is wrong and changes nothing; a number already tapped is ignored', () => {
    const s = order.generate(2, mulberry32(3)), st = order.start(s), [a, b, c] = s.body.sorted;
    expect(order.answer(s, st, c)).toBe('wrong');
    expect(st.next).toBe(0);
    expect(order.answer(s, st, a)).toBe('step');
    expect(order.answer(s, st, a)).toBe('ignored');
    expect(order.solution(s, st)[0]).toBe(b);
    expect(order.answer(s, st, b)).toBe('step');
    expect(st.next).toBe(2);
  });

  it('the hint pulses the next number', () => {
    expect(order.generate(1, mulberry32(1)).hint).toEqual({ key: 'h_order', steps: [{ do: 'pulseNext' }] });
  });
});
