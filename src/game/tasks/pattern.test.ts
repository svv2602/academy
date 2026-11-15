// @vitest-environment node
/** The pattern generator without a page (ARCH-09, R10): bounds, one right answer, `answer` and `solution`. */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { COLORS, UNITS, pattern } from './pattern';

const TASKS = 1000;

describe('pattern generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([1, 2, 3])(`level %i: ${TASKS} tasks stay within bounds and have one right answer`, (level) => {
    for (let i = 0; i < TASKS; i++) {
      const s = pattern.generate(level, mulberry32(level * 100_000 + i)), { unit, row, options, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('pattern'); expect(s.prompt, why).toBe('t_pattern');
      expect(UNITS(level), why).toContain(unit);
      expect(options.length, why).toBe(3);
      expect(new Set(options).size, why).toBe(3);
      expect(options.every((c) => COLORS.includes(c)), why).toBe(true);
      // Two whole units and the start of the third.
      expect(row.length >= unit.length * 2 + 1 && row.length <= unit.length * 3 - (unit.length > 1 ? 1 : 0), why).toBe(true);
      // One colour per letter of the unit, different letters - different colours, all of them among the options.
      const colorOf = (letter: string) => row[unit.indexOf(letter)];
      row.forEach((c, j) => expect(c, why).toBe(colorOf(unit[j % unit.length])));
      const letters = [...new Set(unit)];
      expect(new Set(letters.map(colorOf)).size, why).toBe(letters.length);
      expect(letters.every((l) => options.includes(colorOf(l))), why).toBe(true);
      expect(answer, why).toBe(colorOf(unit[row.length % unit.length]));
      expect(options.filter((v) => pattern.answer(s, pattern.start(s), v) === 'right'), why).toEqual([answer]);
      expect(pattern.solution(s, pattern.start(s)), why).toEqual([answer]);
    }
  });

  it('the hint marks the units, then pulses the answer from the second mistake', () => {
    expect(pattern.generate(2, mulberry32(1)).hint).toEqual({ key: 'h_pattern', steps: [{ do: 'markUnits' }, { do: 'pulseAnswer', fromMistake: 2 }] });
  });
});
