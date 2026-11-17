// @vitest-environment node
/**
 * The generator of the signs (LEARN-09, R13, R14): two numbers of 1..20, the three sign buttons, one right sign,
 * equal numbers come up; the hint lays both numbers out as things (rung 2); pure.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/util';
import { createRng } from '../../core/rng';
import { THINGS } from './types';
import { SIGNS, SIGNS_MAX, signOf, signs } from './signs';

const LADDER = (way: string, key: string, steps: object[], lit: object[] = [{ do: 'pulseAnswer' }]) =>
  ({ rungs: [{ key: way, steps: [] }, { key, steps }, { key: 'h3_show', steps: lit }] });
const TASKS = 1000;

describe('signs generator (LEARN-09, R13, R14)', () => {
  it(`${TASKS} tasks: two numbers of 1..20, the three sign buttons, one right sign; equal numbers come up`, () => {
    const seen = new Set<number>(), answers = { '>': 0, '<': 0, '=': 0 };
    for (let i = 0; i < TASKS; i++) {
      const s = signs.generate(5, mulberry32(700_000 + i)), { a, b, thing, options, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('signs');
      expect(s.level, why).toBe(5);
      expect(s.prompt, why).toBe('t_signs');
      expect(s.ask, why).toBeUndefined();
      expect([a, b].every((n) => Number.isInteger(n) && n >= 1 && n <= SIGNS_MAX), why).toBe(true);
      expect(THINGS, why).toContain(thing);
      expect(options, why).toEqual(['>', '<', '=']);
      expect(answer, why).toBe(a > b ? '>' : a < b ? '<' : '=');
      expect(SIGNS.filter((v) => signs.answer(s, signs.start(s), v) === 'right'), why).toEqual([answer]);
      expect(signs.solution(s, signs.start(s)), why).toEqual([answer]);
      expect(s.hint, why).toEqual(LADDER('h1_signs', 'h2_signs', [{ do: 'pairUp' }]));
      answers[answer]++; seen.add(a); seen.add(b);
    }
    // Equal numbers come up (R14) - about a quarter - and "more" and "less" each about as often.
    expect(answers['=']).toBeGreaterThan(TASKS * 0.15);
    expect(answers['=']).toBeLessThan(TASKS * 0.35);
    expect(answers['>']).toBeGreaterThan(TASKS * 0.3);
    expect(answers['<']).toBeGreaterThan(TASKS * 0.3);
    expect([...seen].sort((x, y) => x - y)).toEqual(Array.from({ length: 20 }, (_, k) => k + 1));
  });

  it('the sign opens towards the larger number', () => {
    expect([signOf(12, 7), signOf(3, 15), signOf(9, 9)]).toEqual(['>', '<', '=']);
  });

  describe('pure', () => {
    const realRandom = Math.random;
    afterEach(() => { Math.random = realRandom; });
    it('one seed, one description, without asking Math.random', () => {
      const asked = vi.fn(realRandom);
      Math.random = asked;
      for (const seed of ['7', 'Зоряна']) expect(signs.generate(5, createRng(seed))).toEqual(signs.generate(5, createRng(seed)));
      expect(asked).not.toHaveBeenCalled();
    });
  });
});
