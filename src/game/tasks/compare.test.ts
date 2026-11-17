// @vitest-environment node
/** The compare generator without a page (ARCH-09, R10): bounds, one right answer, `answer` and `solution`. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/util';
import { createRng } from '../../core/rng';
import { THINGS } from './types';
import { DIGITS, GAP, MAX, compare } from './compare';

/** The hint as HINTS.md has it: rung 1 says the way and shows nothing, rung 2 solves it together, rung 3 lights the answer. */
const LADDER = (way: string, key: string, steps: object[], lit: object[] = [{ do: 'pulseAnswer' }]) =>
  ({ rungs: [{ key: way, steps: [] }, { key, steps }, { key: 'h3_show', steps: lit }] });

const TASKS = 1000;

describe('compare generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([1, 2, 3])(`level %i: ${TASKS} tasks stay within bounds and have one right answer`, (level) => {
    const max = MAX(level), asked = new Set<boolean>();
    for (let i = 0; i < TASKS; i++) {
      const s = compare.generate(level, mulberry32(level * 100_000 + i)), { groups, thing, tilt, more, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('compare');
      expect(s.prompt, why).toBe(more ? 't_compare_more' : 't_compare_less');
      expect(groups.every((n) => Number.isInteger(n) && n >= 1 && n <= max), why).toBe(true);
      expect(Math.abs(groups[0] - groups[1]) >= GAP(level), why).toBe(true);
      expect(THINGS, why).toContain(thing);
      expect(s.body.digits, `${why}: levels 1-3 draw things`).toBe(false);
      expect(tilt.map((t) => t.length), why).toEqual(groups);
      expect(tilt.flat().every((r) => Number.isInteger(r) && r >= -12 && r <= 12), why).toBe(true);
      const best = more ? Math.max(...groups) : Math.min(...groups);
      expect(groups[answer], why).toBe(best);
      expect(groups.filter((n) => n === best).length, `${why}: the answer is one group`).toBe(1);
      expect(([0, 1] as const).filter((g) => compare.answer(s, compare.start(s), g) === 'right'), why).toEqual([answer]);
      expect(compare.solution(s, compare.start(s)), why).toEqual([answer]);
      asked.add(more);
    }
    // The first level always asks "more"; the others ask both.
    expect([...asked].sort()).toEqual(level === 1 ? [true] : [false, true]);
  });

  it('the ladder: groups up to 5, 8, 10 on levels 1-3, numbers up to 20 in digits on levels 4 and 5', () => {
    expect([1, 2, 3, 4, 5].map(MAX)).toEqual([5, 8, 10, 20, 20]);
    expect([1, 2, 3, 4, 5].map(DIGITS)).toEqual([false, false, false, true, true]);
    expect([1, 2, 3, 4, 5].map(GAP)).toEqual([2, 1, 1, 1, 1]);
  });

  it(`level 4: ${TASKS} tasks are two different numbers 1..20 in digits, without things, with one right answer`, () => {
    const asked = new Set<boolean>(), seen = new Set<number>();
    let big = 0, bothBig = 0;
    for (let i = 0; i < TASKS; i++) {
      const s = compare.generate(4, mulberry32(400_000 + i)), { groups, thing, tilt, digits, more, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('compare'); expect(s.level, why).toBe(4);
      expect(s.prompt, why).toBe(more ? 't_compare_more' : 't_compare_less');
      expect(digits, why).toBe(true);
      expect(tilt, `${why}: no things to tilt`).toEqual([[], []]);
      expect(THINGS, why).toContain(thing);
      expect(groups.every((n) => Number.isInteger(n) && n >= 1 && n <= 20), why).toBe(true);
      expect(groups[0], `${why}: no equal numbers on level 4 (equal is the sign "=", level 5)`).not.toBe(groups[1]);
      const best = more ? Math.max(...groups) : Math.min(...groups);
      expect(groups[answer], why).toBe(best);
      expect(([0, 1] as const).filter((g) => compare.answer(s, compare.start(s), g) === 'right'), why).toEqual([answer]);
      expect(compare.solution(s, compare.start(s)), why).toEqual([answer]);
      expect(s.hint, why).toEqual(LADDER('h1_compare_num', 'h2_compare_num', [{ do: 'showNumbers' }], [{ do: more ? 'grow' : 'shrink' }, { do: 'pulseAnswer' }]));
      asked.add(more); groups.forEach((n) => seen.add(n));
      if (Math.max(...groups) > 10) big++;
      if (Math.min(...groups) > 10) bothBig++;
    }
    expect([...asked].sort()).toEqual([false, true]);
    // Every number of 1..20 comes up, the two-digit ones too, and often both numbers are above ten.
    expect([...seen].sort((a, b) => a - b)).toEqual(Array.from({ length: 20 }, (_, k) => k + 1));
    expect(big).toBeGreaterThan(TASKS / 2);
    expect(bothBig).toBeGreaterThan(TASKS / 10);
  });

  it('the type itself plays level 5 as its 4 (level 5 of the skill is the signs, tasks/index.ts BY_LEVEL)', () => {
    for (let i = 0; i < 200; i++) {
      const five = compare.generate(5, mulberry32(500_000 + i)), four = compare.generate(4, mulberry32(500_000 + i));
      expect(five.level).toBe(5);
      expect({ ...five, level: 4 }).toEqual(four);
    }
  });

  describe('levels 4 and 5 are pure', () => {
    const realRandom = Math.random;
    afterEach(() => { Math.random = realRandom; });
    it.each([4, 5])('level %i: one seed, one description, without asking Math.random', (level) => {
      const asked = vi.fn(realRandom);
      Math.random = asked;
      for (const seed of ['7', 'Зоряна']) expect(compare.generate(level, createRng(seed))).toEqual(compare.generate(level, createRng(seed)));
      expect(asked).not.toHaveBeenCalled();
    });
  });

  it('the hint: the way (said only), then each group counted together, then the right group grows or shrinks and pulses', () => {
    const more = compare.generate(1, mulberry32(1));
    expect(more.hint).toEqual(LADDER('h_compare', 'h2_compare', [{ do: 'showNumbers' }], [{ do: 'grow' }, { do: 'pulseAnswer' }]));
    const less = Array.from({ length: 50 }, (_, i) => compare.generate(2, mulberry32(i))).find((s) => !s.body.more)!;
    expect(less.hint).toEqual(LADDER('h_compare', 'h2_compare', [{ do: 'showNumbers' }], [{ do: 'shrink' }, { do: 'pulseAnswer' }]));
  });
});
