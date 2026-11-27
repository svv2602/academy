// @vitest-environment node
/**
 * The missing number of a take away without a page (LEARN-27, ARCH-09): "13 − ? = 6" - the bounds (there were 11..20,
 * 2..9 are gone), one right answer, the number asked is always the one taken away, the hint.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { THINGS } from './types';
import { GONE, TOTAL, example, gap } from './gap';

/** The hint as HINTS.md has it: rung 1 says the way and shows nothing, rung 2 solves it together, rung 3 lights the answer. */
const LADDER = (way: string, key: string, steps: object[]) =>
  ({ rungs: [{ key: way, steps: [] }, { key, steps }, { key: 'h3_show', steps: [{ do: 'pulseAnswer' }] }] });

const TASKS = 1000;
const tasks = (level: number, n = TASKS) => Array.from({ length: n }, (_, i) => gap.generate(level, mulberry32(level * 100_000 + i)));

describe('gap generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it('the bounds of the task: there were 11..20, 2..9 are gone', () => {
    expect([TOTAL, GONE]).toEqual([[11, 20], [2, 9]]);
  });

  it.each([1, 3, 5, 6])(`asked with level %i: ${TASKS} tasks stay within bounds and have one right answer`, (level) => {
    for (let i = 0; i < TASKS; i++) {
      const s = gap.generate(level, mulberry32(level * 100_000 + i)), { total, left, thing, tilt, options, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect([s.type, s.level, s.prompt, s.ask], why).toEqual(['gap', level, 't_gap', undefined]);
      expect(Number.isInteger(total) && total >= 11 && total <= 20, why).toBe(true);
      expect(Number.isInteger(answer) && answer >= 2 && answer <= 9, why).toBe(true);
      expect(left, why).toBe(total - answer);
      expect(left >= 1 && left <= 20, why).toBe(true);
      expect(THINGS, why).toContain(thing);
      expect(tilt.length, why).toBe(total);
      expect(tilt.every((r) => Number.isInteger(r) && r >= -12 && r <= 12), why).toBe(true);
      expect(options.length, why).toBe(4);
      expect(new Set(options).size, why).toBe(4);
      expect(options.every((v) => Number.isInteger(v) && v >= 0 && v <= 20), why).toBe(true);
      expect([...options].sort((x, y) => x - y), 'options are in ascending order').toEqual(options);
      expect(options.filter((v) => gap.answer(s, gap.start(s), v) === 'right'), why).toEqual([answer]);
      expect(gap.solution(s, gap.start(s)), why).toEqual([answer]);
    }
  });

  it('the numbers do not follow the level: one seed is the same example on any level', () => {
    for (let i = 0; i < 50; i++) {
      const [one, five] = [1, 5].map((level) => gap.generate(level, mulberry32(i)));
      expect(five.body).toEqual(one.body);
      expect([one.level, five.level]).toEqual([1, 5]);
    }
  });

  it('every number of things 11..20 and every number taken away 2..9 come up, in every pairing', () => {
    const all = tasks(5, 3000);
    expect(new Set(all.map((s) => s.body.total))).toEqual(new Set([11, 12, 13, 14, 15, 16, 17, 18, 19, 20]));
    expect(new Set(all.map((s) => s.body.answer))).toEqual(new Set([2, 3, 4, 5, 6, 7, 8, 9]));
    expect(new Set(all.map((s) => `${s.body.total}-${s.body.answer}`)).size).toBe(80);
  });

  it('the hint: count from the smaller number to the larger; then the things taken away are counted together; then the answer pulses', () => {
    for (const s of tasks(5, 100)) expect(s.hint).toEqual(LADDER('h1_gap', 'h2_gap', [{ do: 'countGone' }]));
  });

  it('the task of chosen numbers is the one the generator builds of them', () => {
    for (const s of tasks(5, 200)) {
      const { total, left } = s.body, e = example(5, total, left, mulberry32(total * 31 + left));
      expect([e.type, e.level, e.prompt, e.ask, e.hint], `${total} - ? = ${left}`).toEqual([s.type, s.level, s.prompt, s.ask, s.hint]);
      expect([e.body.total, e.body.left, e.body.answer, e.body.tilt.length]).toEqual([total, left, total - left, total]);
      expect(e.body.options).toContain(total - left);
    }
  });
});
