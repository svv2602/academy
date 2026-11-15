// @vitest-environment node
/** The odd-one-out generator without a page (ARCH-09, R10): one group plus one stranger, one right answer. */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { GROUPS, odd } from './odd';

const TASKS = 1000;
const groupOf = (s: string) => GROUPS.findIndex((g) => g.includes(s));

describe('odd generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([1, 2, 3])(`level %i: ${TASKS} tasks show one group and exactly one stranger`, (level) => {
    for (let i = 0; i < TASKS; i++) {
      const s = odd.generate(level, mulberry32(level * 100_000 + i)), { things, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('odd'); expect(s.level, why).toBe(level); expect(s.prompt, why).toBe('t_odd');
      expect(things.length, why).toBe(level === 3 ? 5 : 4);
      expect(things.every((t) => groupOf(t) >= 0), why).toBe(true);
      const stranger = things.filter((t) => things.filter((u) => groupOf(u) === groupOf(t)).length === 1);
      expect(stranger, why).toEqual([things[answer]]);
      expect(new Set(things.map(groupOf)).size, why).toBe(2);
      const rest = things.filter((_, k) => k !== answer);
      // Level 1 is "the obvious odd one": three copies of one thing. From level 2 on nothing repeats.
      expect(new Set(rest).size, why).toBe(level === 1 ? 1 : rest.length);
      expect(things.map((_, k) => k).filter((k) => odd.answer(s, odd.start(s), k) === 'right'), why).toEqual([answer]);
      expect(odd.solution(s, odd.start(s)), why).toEqual([answer]);
    }
  });

  it('the stranger stands anywhere in the row', () => {
    const places = new Set(Array.from({ length: 200 }, (_, i) => odd.generate(2, mulberry32(i)).body.answer));
    expect([...places].sort()).toEqual([0, 1, 2, 3]);
  });

  it('the hint frames the alike things, then pulses the stranger from the second mistake', () => {
    expect(odd.generate(1, mulberry32(1)).hint).toEqual({ key: 'h_odd', steps: [{ do: 'frameAlike' }, { do: 'pulseAnswer', fromMistake: 2 }] });
  });
});
