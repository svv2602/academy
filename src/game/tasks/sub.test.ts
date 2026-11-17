// @vitest-environment node
/**
 * The sub generator without a page (ARCH-09, R10): bounds, one right answer, `answer` and `solution`; the ladder of
 * levels 4-5 (LEARN-04: up to 20, without and with crossing the ten) and no 1 - 1 from level 2 (LEARN-13).
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { THINGS } from './types';
import { MAX, example, sub } from './sub';

/** The hint as HINTS.md has it: rung 1 says the way and shows nothing, rung 2 solves it together, rung 3 lights the answer. */
const LADDER = (way: string, key: string, steps: object[], lit: object[] = [{ do: 'pulseAnswer' }]) =>
  ({ rungs: [{ key: way, steps: [] }, { key, steps }, { key: 'h3_show', steps: lit }] });

const TASKS = 1000;
/** Taking away more than the ones of `total` crosses the ten (13 - 6). */
const crosses = (total: number, gone: number) => gone % 10 > total % 10;
const tasks = (level: number) => Array.from({ length: TASKS }, (_, i) => sub.generate(level, mulberry32(level * 100_000 + i)));

describe('sub generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([1, 2, 3, 4, 5, 6])(`level %i: ${TASKS} tasks stay within bounds and have one right answer`, (level) => {
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
      expect(options.every((v) => Number.isInteger(v) && v >= 0 && v <= (level <= 3 ? 10 : 20)), why).toBe(true);
      expect(answer >= 0 && answer <= 20, why).toBe(true);
      expect([...options].sort((x, y) => x - y), 'options are in ascending order').toEqual(options);
      expect(options.filter((v) => sub.answer(s, sub.start(s), v) === 'right'), why).toEqual([total - gone]);
      expect(sub.solution(s, sub.start(s)), why).toEqual([total - gone]);
    }
  });

  it('the largest number of things of each level: 5, 8, 10, then 20 (a level above 5 is the fifth)', () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(MAX)).toEqual([5, 8, 10, 20, 20, 20, 20]);
  });

  it(`level 4: ${TASKS} examples from 11..19, none crosses the ten (17 - 4)`, () => {
    const all = tasks(4);
    for (const { body: { total, gone } } of all) {
      const why = `${total} - ${gone}`;
      expect(total >= 11 && total <= 19 && gone >= 1 && gone <= 9, why).toBe(true);
      expect(total - gone >= 10, why).toBe(true);
      expect(crosses(total, gone), why).toBe(false);
    }
    expect(new Set(all.map((s) => s.body.total)).size).toBe(9);
    expect(new Set(all.map((s) => s.body.gone)).size).toBe(9);
  });

  it.each([5, 6])(`level %i: each of ${TASKS} examples crosses the ten (13 - 6), from 11..18`, (level) => {
    const all = tasks(level);
    for (const { body: { total, gone } } of all) {
      const why = `${total} - ${gone}`;
      expect(total >= 11 && total <= 18 && gone >= 2 && gone <= 9, why).toBe(true);
      expect(total - gone >= 2 && total - gone <= 9, why).toBe(true);
      expect(crosses(total, gone), why).toBe(true);
    }
    expect(new Set(all.map((s) => s.body.total))).toEqual(new Set([11, 12, 13, 14, 15, 16, 17, 18]));
  });

  it.each([2, 3, 4, 5, 6])(`level %i: none of ${TASKS} examples is 1 - 1 (LEARN-13)`, (level) => {
    for (const { body: { total, gone } } of tasks(level)) expect(total === 1 && gone === 1, `${total} - ${gone}`).toBe(false);
  });

  it('the hint: the way (said only), then the things left counted together, then the answer pulses; past ten from ten, across ten down to it', () => {
    for (const level of [1, 2, 3]) expect(sub.generate(level, mulberry32(1)).hint).toEqual(LADDER('h1_sub', 'h_left', [{ do: 'countAloud', which: 'left' }]));
    expect(sub.generate(4, mulberry32(1)).hint).toEqual(LADDER('h1_sub', 'h2_ten', [{ do: 'countOn', which: 'left' }]));
    for (const level of [5, 6]) expect(sub.generate(level, mulberry32(1)).hint).toEqual(LADDER('h1_sub_cross', 'h2_sub_cross', [{ do: 'takeToTen' }]));
  });

  it.each([1, 2, 3, 4, 5])('level %i: the task of chosen numbers (an example brought back, LEARN-11) is the one the generator builds of them', (level) => {
    for (const s of tasks(level).slice(0, 200)) {
      const { total, gone } = s.body, e = example(level, total, gone, mulberry32(total * 31 + gone));
      expect([e.type, e.level, e.prompt, e.ask, e.hint], `${total} - ${gone}`).toEqual([s.type, s.level, s.prompt, s.ask, s.hint]);
      expect([e.body.total, e.body.gone, e.body.answer, e.body.tilt.length]).toEqual([total, gone, total - gone, total]);
      expect(e.body.options).toContain(total - gone);
    }
  });
});
