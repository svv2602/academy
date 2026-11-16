// @vitest-environment node
/** The numbers-in-order generator and model without a page (ARCH-09, R10): bounds, and tapping from the smallest. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/util';
import { createRng } from '../../core/rng';
import { COUNT, TOP, order } from './order';

const TASKS = 1000;
const BOUNDS = [[0, 0], [1, 6], [1, 9], [1, 10], [1, 10], [1, 20]];   // lowest, highest number by level

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

  it('the ladder: 4 then 5 numbers; scattered up to 10 on levels 3 and 4, up to 20 on level 5', () => {
    expect([1, 2, 3, 4, 5].map(COUNT)).toEqual([4, 5, 5, 5, 5]);
    expect([3, 4, 5].map(TOP)).toEqual([10, 10, 20]);
  });

  it(`level 5: ${TASKS} tasks are 5 different numbers scattered in 1..20, solved from the smallest`, () => {
    const seen = new Set<number>();
    let big = 0, gaps = 0;
    for (let i = 0; i < TASKS; i++) {
      const s = order.generate(5, mulberry32(500_000 + i)), { shown, sorted } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('order'); expect(s.level, why).toBe(5); expect(s.prompt, why).toBe('t_order');
      expect(shown.length, why).toBe(5);
      expect(new Set(shown).size, why).toBe(5);
      expect(shown.every((v) => Number.isInteger(v) && v >= 1 && v <= 20), why).toBe(true);
      expect(sorted, why).toEqual([...shown].sort((a, b) => a - b));
      const st = order.start(s);
      expect(order.solution(s, st), why).toEqual(sorted);
      expect(sorted.map((v) => order.answer(s, st, v)), why).toEqual(['step', 'step', 'step', 'step', 'right']);
      expect(s.hint, why).toEqual({ key: 'h_order', steps: [{ do: 'pulseNext' }] });
      shown.forEach((v) => seen.add(v));
      if (sorted[4] > 10) big++;
      if (sorted[4] - sorted[0] > 4) gaps++;
    }
    // Every number of 1..20 comes up; almost every task has a two-digit number, and the numbers are not in a row.
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, k) => k + 1));
    expect(big).toBeGreaterThan(TASKS * 0.9);
    expect(gaps).toBeGreaterThan(TASKS * 0.9);
  });

  it('level 4 (the neighbours of a number, not made yet) is level 3: the same task from the same seed', () => {
    for (let i = 0; i < 200; i++) {
      const four = order.generate(4, mulberry32(400_000 + i)), three = order.generate(3, mulberry32(400_000 + i));
      expect(four.level).toBe(4);
      expect({ ...four, level: 3 }).toEqual(three);
    }
  });

  describe('levels 4 and 5 are pure', () => {
    const realRandom = Math.random;
    afterEach(() => { Math.random = realRandom; });
    it.each([4, 5])('level %i: one seed, one description, without asking Math.random', (level) => {
      const asked = vi.fn(realRandom);
      Math.random = asked;
      for (const seed of ['7', 'Зоряна']) expect(order.generate(level, createRng(seed))).toEqual(order.generate(level, createRng(seed)));
      expect(asked).not.toHaveBeenCalled();
    });
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
