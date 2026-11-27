// @vitest-environment node
/**
 * Three addends without a page (LEARN-27, ARCH-09): the bounds (every number 2..9, the sum 11..20), one right answer,
 * the pair that makes ten in two tasks of three and not always side by side, the hint of each case.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { THINGS } from './types';
import { PART, PLAIN, SUM, example, sum3, tenOf, type Three } from './sum3';

/** The hint as HINTS.md has it: rung 1 says the way and shows nothing, rung 2 solves it together, rung 3 lights the answer. */
const LADDER = (way: string, key: string, steps: object[]) =>
  ({ rungs: [{ key: way, steps: [] }, { key, steps }, { key: 'h3_show', steps: [{ do: 'pulseAnswer' }] }] });

const TASKS = 1000;
const tasks = (level: number, n = TASKS) => Array.from({ length: n }, (_, i) => sum3.generate(level, mulberry32(level * 100_000 + i)));
/** Whether some two of the three numbers make ten: counted here by itself, not with the generator's own `tenOf`. */
const pairs = ([a, b, c]: Three) => [a + b, a + c, b + c].filter((s) => s === 10).length;

describe('sum3 generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it('the bounds of the task: numbers 2..9, sums 11..20', () => {
    expect([PART, SUM]).toEqual([[2, 9], [11, 20]]);
  });

  it.each([1, 3, 5, 6])(`asked with level %i: ${TASKS} tasks stay within bounds and have one right answer`, (level) => {
    for (let i = 0; i < TASKS; i++) {
      const s = sum3.generate(level, mulberry32(level * 100_000 + i)), { parts, ten, thing, tilt, options, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect([s.type, s.level, s.prompt, s.ask], why).toEqual(['sum3', level, 't_sum3', undefined]);
      expect(parts.length, why).toBe(3);
      expect(parts.every((x) => Number.isInteger(x) && x >= 2 && x <= 9), why).toBe(true);
      expect(answer, why).toBe(parts[0] + parts[1] + parts[2]);
      expect(answer >= 11 && answer <= 20, why).toBe(true);
      expect(THINGS, why).toContain(thing);
      expect(tilt.length, why).toBe(answer);
      expect(tilt.every((r) => Number.isInteger(r) && r >= -12 && r <= 12), why).toBe(true);
      expect(options.length, why).toBe(4);
      expect(new Set(options).size, why).toBe(4);
      expect(options.every((v) => Number.isInteger(v) && v >= 0 && v <= 20), why).toBe(true);
      expect([...options].sort((x, y) => x - y), 'options are in ascending order').toEqual(options);
      expect(options.filter((v) => sum3.answer(s, sum3.start(s), v) === 'right'), why).toEqual([answer]);
      expect(sum3.solution(s, sum3.start(s)), why).toEqual([answer]);
      // the pair named is a pair that makes ten, the lower place first; none is named only when no two make ten
      if (ten) { expect(ten[0] < ten[1], why).toBe(true); expect(parts[ten[0]] + parts[ten[1]], why).toBe(10); }
      else expect(pairs(parts), why).toBe(0);
    }
  });

  it('the numbers do not follow the level: one seed is the same example on any level', () => {
    for (let i = 0; i < 50; i++) {
      const [one, five] = [1, 5].map((level) => sum3.generate(level, mulberry32(i)));
      expect(five.body).toEqual(one.body);
      expect([one.level, five.level]).toEqual([1, 5]);
    }
  });

  it('two tasks of three have two numbers that make ten, the third has none', () => {
    const all = tasks(5, 3000), withTen = all.filter((s) => s.body.ten).length;
    expect(withTen / all.length).toBeGreaterThan(0.63);
    expect(withTen / all.length).toBeLessThan(0.70);
    for (const s of all) expect(pairs(s.body.parts) > 0, JSON.stringify(s.body.parts)).toBe(s.body.ten !== null);
  });

  it('the pair that makes ten does not always stand side by side: first and second, first and third, second and third all come up', () => {
    const at = tasks(5).filter((s) => s.body.ten).map((s) => s.body.ten!.join('-'));
    expect(new Set(at)).toEqual(new Set(['0-1', '0-2', '1-2']));
    // not side by side in a good share of them (a third of the placements; a number that pairs twice adds to the others)
    const apart = at.filter((x) => x === '0-2').length / at.length;
    expect(apart).toBeGreaterThan(0.2);
    expect(apart).toBeLessThan(0.45);
  });

  it('every sum of 11..20 comes up, with a pair of ten only 12..19 (ten and a number of 2..9)', () => {
    const all = tasks(5, 3000);
    expect(new Set(all.map((s) => s.body.answer))).toEqual(new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]));
    expect(new Set(all.filter((s) => s.body.ten).map((s) => s.body.answer))).toEqual(new Set([12, 13, 14, 15, 16, 17, 18, 19]));
    // every number 2..9 stands in every place
    for (const place of [0, 1, 2]) expect(new Set(all.map((s) => s.body.parts[place])), `place ${place}`).toEqual(new Set([2, 3, 4, 5, 6, 7, 8, 9]));
  });

  it('other seeds give other examples', () => {
    expect(new Set(tasks(5).map((s) => s.body.parts.join('+'))).size).toBeGreaterThan(200);
  });

  it('the examples without a pair of ten: every three numbers 2..9 with a sum of 11..20 no two of which make ten, each once', () => {
    const want: string[] = [];
    for (let a = 2; a <= 9; a++) for (let b = 2; b <= 9; b++) for (let c = 2; c <= 9; c++) {
      if (a + b + c >= 11 && a + b + c <= 20 && a + b !== 10 && a + c !== 10 && b + c !== 10) want.push(`${a}+${b}+${c}`);
    }
    expect(PLAIN.map((p) => p.join('+'))).toEqual(want);
    expect(want.length).toBeGreaterThan(100);
  });

  it('tenOf: the places of the two numbers that make ten, of several pairs the first; null without one', () => {
    expect(tenOf([7, 3, 5])).toEqual([0, 1]);
    expect(tenOf([7, 5, 3])).toEqual([0, 2]);
    expect(tenOf([5, 7, 3])).toEqual([1, 2]);
    expect(tenOf([3, 7, 7])).toEqual([0, 1]);
    expect(tenOf([5, 5, 5])).toEqual([0, 1]);
    expect(tenOf([6, 5, 3])).toBeNull();
    expect(tenOf([9, 9, 2])).toBeNull();
  });

  it('the hint: with a pair of ten the way is to find it; without one the way of adding across ten; both fill a ten together, then the answer pulses', () => {
    expect(example(5, [7, 5, 3], mulberry32(1)).hint).toEqual(LADDER('h1_sum3', 'h2_add_cross', [{ do: 'fillTen' }]));
    expect(example(5, [6, 5, 3], mulberry32(1)).hint).toEqual(LADDER('h1_add_cross', 'h2_add_cross', [{ do: 'fillTen' }]));
    for (const s of tasks(5, 300)) expect(s.hint!.rungs[0].key, JSON.stringify(s.body.parts)).toBe(s.body.ten ? 'h1_sum3' : 'h1_add_cross');
  });

  it('the task of chosen numbers is the one the generator builds of them', () => {
    for (const s of tasks(5, 200)) {
      const { parts } = s.body, e = example(5, parts, mulberry32(parts[0] * 100 + parts[1] * 10 + parts[2]));
      expect([e.type, e.level, e.prompt, e.ask, e.hint], parts.join('+')).toEqual([s.type, s.level, s.prompt, s.ask, s.hint]);
      expect([e.body.parts, e.body.ten, e.body.answer, e.body.tilt.length]).toEqual([parts, s.body.ten, s.body.answer, s.body.answer]);
      expect(e.body.options).toContain(s.body.answer);
    }
  });
});
