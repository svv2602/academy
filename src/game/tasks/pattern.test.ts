// @vitest-environment node
/** The pattern generator without a page (ARCH-09, R10): bounds, one right answer, `answer` and `solution`. */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { COLORS, THREES, UNITS, pattern } from './pattern';
import { FIG_COLORS, FIG_SHAPES, figureOf } from './odd';

/** The hint as HINTS.md has it: rung 1 says the way and shows nothing, rung 2 solves it together, rung 3 lights the answer. */
const LADDER = (way: string, key: string, steps: object[], lit: object[] = [{ do: 'pulseAnswer' }]) =>
  ({ rungs: [{ key: way, steps: [] }, { key, steps }, { key: 'h3_show', steps: lit }] });

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

  it('the hint: the way (said only), then the units marked together, then the answer pulses', () => {
    expect(pattern.generate(2, mulberry32(1)).hint).toEqual(LADDER('h_pattern', 'h2_pattern', [{ do: 'markUnits' }]));
  });

  // Level 4 (docs/11-learning.md): a growing row of 1, 2 (, 3) things; the next group has one more.
  it(`level 4: ${TASKS} growing rows - groups of 1, 2, 3 of one colour, the answer is one more, the choices one less and one more`, () => {
    const lengths = new Set<number>();
    for (let i = 0; i < TASKS; i++) {
      const s = pattern.generate(4, mulberry32(400_000 + i)), { unit, row, options, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('pattern'); expect(s.level, why).toBe(4); expect(s.prompt, why).toBe('t_pattern');
      expect(unit, why).toBe('grow');
      const sizes = row.map((g) => [...g].length), color = [...row[0]][0];
      expect(COLORS, why).toContain(color);
      expect([...row.join(''), ...answer].every((t) => t === color), why).toBe(true);
      expect(sizes, why).toEqual(sizes.map((_, k) => k + 1));          // 1, 2, 3 ...
      expect(row.length === 2 || row.length === 3, why).toBe(true);
      lengths.add(row.length);
      expect([...answer].length, why).toBe(row.length + 1);            // the next link grows, it does not repeat the last
      expect(options.map((o) => [...o].length).sort(), why).toEqual([row.length, row.length + 1, row.length + 2]);
      expect(options.filter((v) => pattern.answer(s, pattern.start(s), v) === 'right'), why).toEqual([answer]);
      expect(pattern.solution(s, pattern.start(s)), why).toEqual([answer]);
    }
    expect([...lengths].sort()).toEqual([2, 3]);
  });

  // Level 5: two features at once - the colour by one unit, the shape by another of a different length.
  it(`level 5: ${TASKS} rows change the colour and the shape by different units; only the right figure has both right`, () => {
    for (let i = 0; i < TASKS; i++) {
      const s = pattern.generate(5, mulberry32(500_000 + i)), { unit, row, options, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('pattern'); expect(s.level, why).toBe(5); expect(s.prompt, why).toBe('t_pattern');
      const [cu, su] = unit.split('/');
      expect(cu === 'AB' || su === 'AB', why).toBe(true);
      expect(THREES, why).toContain(cu === 'AB' ? su : cu);
      expect(row.length >= 6 && row.length <= 7, why).toBe(true);
      const figs = row.map(figureOf), next = figureOf(answer);
      expect(figs.every((f) => FIG_COLORS.includes(f.color) && FIG_SHAPES.includes(f.shape) && !f.small), why).toBe(true);
      // Each feature follows its own unit: the same letter - the same value, different letters - different values.
      const check = (u: string, of: (k: number) => string, at: number) => of(u.indexOf(u[at % u.length]));
      for (let k = 0; k <= row.length; k++) {
        const f = k < row.length ? figs[k] : next;
        expect(f.color, why).toBe(check(cu, (j) => figs[j].color, k));
        expect(f.shape, why).toBe(check(su, (j) => figs[j].shape, k));
      }
      expect(new Set([...cu].map((l) => figs[cu.indexOf(l)].color)).size, why).toBe(new Set(cu).size);
      expect(new Set([...su].map((l) => figs[su.indexOf(l)].shape)).size, why).toBe(new Set(su).size);
      // The choices: three different figures, one right; one wrong in the colour alone, one in the shape alone.
      expect(new Set(options).size, why).toBe(3);
      const wrong = options.filter((o) => o !== answer).map(figureOf);
      expect(wrong.filter((f) => f.shape === next.shape && f.color !== next.color).length, why).toBe(1);
      expect(wrong.filter((f) => f.color === next.color && f.shape !== next.shape).length, why).toBe(1);
      expect(options.filter((v) => pattern.answer(s, pattern.start(s), v) === 'right'), why).toEqual([answer]);
    }
  });

  it('the hint of levels 4 and 5: the way said only, then numbers over the groups / the links of colour and shape, then the answer pulses', () => {
    expect(pattern.generate(4, mulberry32(1)).hint).toEqual(LADDER('h1_pattern_grow', 'h2_pattern_grow', [{ do: 'showNumbers' }]));
    expect(pattern.generate(5, mulberry32(1)).hint).toEqual(LADDER('h1_pattern_two', 'h2_pattern_two', [{ do: 'markUnits' }]));
  });
});
