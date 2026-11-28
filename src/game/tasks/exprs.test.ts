// @vitest-environment node
/**
 * Comparing two examples without a page (LEARN-27, ARCH-09): each side a sum of 2..9 and 2..9, a difference or - in a
 * third of the tasks, one side only - a number alone; the values 2..20 and no more than 3 apart, the same in a
 * quarter of the tasks; never one example twice; one right sign; the hint.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { THINGS } from './types';
import { EXAMPLES, NEAR, SAME, VALUE, alike, example, exprs, textOf, type Side } from './exprs';

/** The hint as HINTS.md has it: rung 1 says the way and shows nothing, rung 2 solves it together, rung 3 lights the answer. */
const LADDER = (way: string, key: string, steps: object[]) =>
  ({ rungs: [{ key: way, steps: [] }, { key, steps }, { key: 'h3_show', steps: [{ do: 'pulseAnswer' }] }] });

const TASKS = 1000;
const tasks = (level: number, n = TASKS) => Array.from({ length: n }, (_, i) => exprs.generate(level, mulberry32(level * 100_000 + i)));
/** What a side comes to, worked out here by itself. */
const worth = (s: Side) => (s.sign === '+' ? s.a + s.b : s.sign === '−' ? s.a - s.b : s.a);
const SUM: Side = { a: 8, sign: '+', b: 5, value: 13 }, SWAPPED: Side = { a: 5, sign: '+', b: 8, value: 13 };
const DIFF: Side = { a: 15, sign: '−', b: 2, value: 13 }, ALONE: Side = { a: 13, sign: '', b: 0, value: 13 };

describe('exprs generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it('the bounds of the task: values 2..20, no more than 3 apart, the same in a quarter of the tasks', () => {
    expect([VALUE, NEAR, SAME]).toEqual([[2, 20], 3, 0.25]);
  });

  it.each([1, 3, 5, 6])(`asked with level %i: ${TASKS} tasks stay within bounds and have one right sign`, (level) => {
    for (let i = 0; i < TASKS; i++) {
      const s = exprs.generate(level, mulberry32(level * 100_000 + i)), { sides, thing, options, answer } = s.body, why = `seed #${i}: ${sides.map(textOf).join(' ? ')}`;
      expect([s.type, s.level, s.prompt, s.ask], why).toEqual(['exprs', level, 't_exprs', undefined]);
      expect(sides.length, why).toBe(2);
      for (const side of sides) {
        expect(side.value, why).toBe(worth(side));
        expect(Number.isInteger(side.value) && side.value >= 2 && side.value <= 20, why).toBe(true);
        if (side.sign === '+') expect([side.a, side.b].every((x) => x >= 2 && x <= 9), why).toBe(true);
        else if (side.sign === '−') expect(side.a >= 5 && side.a <= 20 && side.b >= 2 && side.b <= 9, why).toBe(true);
        else expect(side.b, why).toBe(0);
      }
      expect(Math.abs(sides[0].value - sides[1].value), why).toBeLessThanOrEqual(3);
      // at most one side is a number alone; never one example twice, nor a sum with its numbers the other way round
      expect(sides.filter((x) => x.sign === '').length, why).toBeLessThanOrEqual(1);
      expect(alike(sides[0], sides[1]), why).toBe(false);
      expect(THINGS, why).toContain(thing);
      expect(options, why).toEqual(['>', '<', '=']);
      expect(answer, why).toBe(sides[0].value > sides[1].value ? '>' : sides[0].value < sides[1].value ? '<' : '=');
      expect(options.filter((v) => exprs.answer(s, exprs.start(s), v) === 'right'), why).toEqual([answer]);
      expect(exprs.solution(s, exprs.start(s)), why).toEqual([answer]);
      expect(s.hint, why).toEqual(LADDER('h1_exprs', 'h2_exprs', [{ do: 'pairUp' }]));
    }
  });

  it('the numbers do not follow the level: one seed is the same example on any level', () => {
    for (let i = 0; i < 50; i++) {
      const [one, five] = [1, 5].map((level) => exprs.generate(level, mulberry32(i)));
      expect(five.body).toEqual(one.body);
      expect([one.level, five.level]).toEqual([1, 5]);
    }
  });

  it('the three signs come up: "=" in about a quarter, ">" and "<" about as often as each other', () => {
    const all = tasks(5, 4000), n = (sign: string) => all.filter((s) => s.body.answer === sign).length / all.length;
    expect(n('=')).toBeGreaterThan(0.21);
    expect(n('=')).toBeLessThan(0.29);
    expect(Math.abs(n('>') - n('<'))).toBeLessThan(0.05);
    // the values that differ do so by 1, 2 and 3
    expect(new Set(all.map((s) => Math.abs(s.body.sides[0].value - s.body.sides[1].value)))).toEqual(new Set([0, 1, 2, 3]));
  });

  it('sums, differences and numbers alone come up on either side; a number alone in a third of the tasks or a little more', () => {
    const all = tasks(5, 4000);
    for (const place of [0, 1]) expect(new Set(all.map((s) => s.body.sides[place].sign)), `side ${place}`).toEqual(new Set(['+', '−', '']));
    const alone = all.filter((s) => s.body.sides.some((x) => x.sign === '')).length / all.length;
    expect(alone).toBeGreaterThan(0.3);
    expect(alone).toBeLessThan(0.42);
    // 19 and 20 are no sum of two numbers up to 9 and no difference of the task: they come as a number alone only
    const high = all.flatMap((s) => s.body.sides).filter((x) => x.value >= 19);
    expect(high.length).toBeGreaterThan(0);
    expect(high.every((x) => x.sign === '')).toBe(true);
    expect(new Set(all.flatMap((s) => s.body.sides.map((x) => x.value))).size).toBe(19);
  });

  it('the examples a side may be: every sum of 2..9 and 2..9, every difference of 5..20 less 2..9 that leaves 2 or more', () => {
    const want: string[] = [];
    for (let a = 2; a <= 9; a++) for (let b = 2; b <= 9; b++) want.push(`${a} + ${b}`);
    for (let a = 5; a <= 20; a++) for (let b = 2; b <= 9; b++) if (a - b >= 2) want.push(`${a} − ${b}`);
    expect(EXAMPLES.map(textOf)).toEqual(want);
    for (const e of EXAMPLES) expect(e.value, textOf(e)).toBe(worth(e));
  });

  it('alike: one example twice, or one sum with its numbers the other way round; a difference the other way round is another example', () => {
    expect(alike(SUM, { ...SUM })).toBe(true);
    expect(alike(SUM, SWAPPED)).toBe(true);
    expect(alike(SUM, DIFF)).toBe(false);
    expect(alike(SUM, ALONE)).toBe(false);
    expect(alike({ a: 9, sign: '−', b: 5, value: 4 }, { a: 9, sign: '−', b: 5, value: 4 })).toBe(true);
    expect(alike({ a: 9, sign: '−', b: 5, value: 4 }, { a: 5, sign: '−', b: 9, value: -4 })).toBe(false);
  });

  it('a side as it is read', () => {
    expect([SUM, DIFF, ALONE].map(textOf)).toEqual(['8 + 5', '15 − 2', '13']);
  });

  it('the task of chosen sides: its sign is the one of their values', () => {
    expect(example(5, [SUM, DIFF], mulberry32(1)).body.answer).toBe('=');
    expect(example(5, [SUM, { a: 7, sign: '+', b: 7, value: 14 }], mulberry32(1)).body.answer).toBe('<');
    expect(example(5, [{ a: 7, sign: '+', b: 7, value: 14 }, ALONE], mulberry32(1)).body.answer).toBe('>');
    const e = example(3, [SUM, ALONE], mulberry32(2));
    expect([e.type, e.level, e.prompt, e.body.sides]).toEqual(['exprs', 3, 't_exprs', [SUM, ALONE]]);
  });
});
