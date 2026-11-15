// @vitest-environment node
/** The compare generator without a page (ARCH-09, R10): bounds, one right answer, `answer` and `solution`. */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { THINGS } from './types';
import { GAP, MAX, compare } from './compare';

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

  it('the hint shows the numbers, then the right group grows or shrinks, then pulses from the second mistake', () => {
    const more = compare.generate(1, mulberry32(1));
    expect(more.hint).toEqual({ key: 'h_compare', steps: [{ do: 'showNumbers' }, { do: 'grow' }, { do: 'pulseAnswer', fromMistake: 2 }] });
    const less = Array.from({ length: 50 }, (_, i) => compare.generate(2, mulberry32(i))).find((s) => !s.body.more)!;
    expect(less.hint!.steps[1]).toEqual({ do: 'shrink' });
  });
});
