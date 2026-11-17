// @vitest-environment node
/**
 * The generator of "the neighbours of a number" (LEARN-08, R11, R12): a piece of the number track with the cell right
 * before or right after the marked number empty; numbers up to 20; the question asks the very number by its clip of
 * the bank when the bank has one; one right answer; pure.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/util';
import { createRng } from '../../core/rng';
import { bank } from '../../ui/strings-bank';
import { CELLS, TOP, neighbors } from './neighbors';

const TASKS = 2000;
const LADDER = { rungs: [{ key: 'h1_neighbors', steps: [] }, { key: 'h2_neighbors', steps: [{ do: 'countCells' }] }, { key: 'h3_show', steps: [{ do: 'pulseAnswer' }] }] };

describe('neighbors generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it(`${TASKS} tasks: five numbers in a row within 1..20, the empty cell right before or after the marked number`, () => {
    const asked = new Set<boolean>(), gaps = new Set<number>(), numbers = new Set<number>();
    let byBank = 0;
    for (let i = 0; i < TASKS; i++) {
      const s = neighbors.generate(4, mulberry32(80_000 + i)), { cells, n, before, gap, options, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('neighbors');
      expect(s.level, why).toBe(4);
      expect(s.prompt, why).toBe(before ? 't_before' : 't_after');
      expect(cells.length, why).toBe(CELLS);
      cells.forEach((v, k) => { expect(v, why).toBe(cells[0] + k); });
      expect(cells[0] >= 1 && cells.at(-1)! <= TOP, why).toBe(true);
      // The empty cell is the neighbour of the marked one, on the side the question asks about.
      expect(answer, why).toBe(before ? n - 1 : n + 1);
      expect(cells[gap], why).toBe(answer);
      expect(cells.indexOf(n), why).toBe(gap + (before ? 1 : -1));
      // There is a number to count from before the empty cell (the hint counts from the start of the piece).
      expect(gap, why).toBeGreaterThanOrEqual(1);
      // The answers: up to four different numbers of 1..20, the right one among them, once.
      expect(new Set(options).size, why).toBe(options.length);
      expect(options.length, why).toBeGreaterThanOrEqual(3);
      expect(options.every((v) => Number.isInteger(v) && v >= 1 && v <= TOP), why).toBe(true);
      expect(options.filter((v) => neighbors.answer(s, neighbors.start(s), v) === 'right'), why).toEqual([answer]);
      expect(neighbors.solution(s, neighbors.start(s)), why).toEqual([answer]);
      expect(s.hint, why).toEqual(LADDER);
      // The clip of the bank that asks this very number, when the bank has it (2..19), else the general question alone.
      const key = `${before ? 'q_before' : 'q_after'}_${n}`;
      expect(s.ask, why).toBe(Object.hasOwn(bank.table.uk, key) ? key : undefined);
      if (s.ask) byBank++;
      asked.add(before); gaps.add(gap); cells.forEach((v) => numbers.add(v));
    }
    expect([...asked].sort()).toEqual([false, true]);
    expect([...gaps].sort()).toEqual([1, 2, 3, 4]);
    expect([...numbers].sort((a, b) => a - b)).toEqual(Array.from({ length: TOP }, (_, k) => k + 1));
    expect(byBank).toBeGreaterThan(TASKS * 0.9);
  });

  it('"before" and "after" both come up about as often, and the empty cell is not always on one side of the piece', () => {
    const list = Array.from({ length: TASKS }, (_, i) => neighbors.generate(4, mulberry32(90_000 + i)).body);
    const before = list.filter((b) => b.before).length;
    expect(before).toBeGreaterThan(TASKS * 0.4);
    expect(before).toBeLessThan(TASKS * 0.6);
    expect(list.some((b) => b.gap === CELLS - 1) && list.some((b) => b.gap === 1)).toBe(true);
  });

  describe('pure', () => {
    const realRandom = Math.random;
    afterEach(() => { Math.random = realRandom; });
    it('one seed, one description, without asking Math.random', () => {
      const asked = vi.fn(realRandom);
      Math.random = asked;
      for (const seed of ['7', 'Зоряна']) expect(neighbors.generate(4, createRng(seed))).toEqual(neighbors.generate(4, createRng(seed)));
      expect(asked).not.toHaveBeenCalled();
    });
  });
});
