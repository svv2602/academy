// @vitest-environment node
/**
 * The number house without a page (LEARN-07, R09-R10): the roof, floors of two numbers that make it, exactly one empty
 * window in the whole house, one right answer among the options, and the hint of HINTS.md.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { FLOORS, ROOF, house } from './house';

const TASKS = 1000;
const tasks = (level: number) => Array.from({ length: TASKS }, (_, i) => house.generate(level, mulberry32(level * 100_000 + i)));

describe('number house generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([3, 4, 5])(`level %i: ${TASKS} houses stay within bounds, one empty window, one right answer`, (level) => {
    for (const s of tasks(level)) {
      const { roof, floors, gap, options, answer } = s.body, why = JSON.stringify(s.body);
      expect(s.type, why).toBe('house'); expect(s.prompt, why).toBe('t_house'); expect(s.level, why).toBe(level);
      expect(roof >= ROOF[0] && roof <= ROOF[1], why).toBe(true);
      expect(floors.length, why).toBe(FLOORS);
      for (const [a, b] of floors) {
        expect(Number.isInteger(a) && Number.isInteger(b) && a >= 1 && b >= 1, why).toBe(true);
        expect(a + b, why).toBe(roof);
      }
      expect(new Set(floors.map(([a]) => a)).size, 'the floors are different pairs').toBe(FLOORS);
      // exactly one window of the whole house is empty: one floor, one side
      const empty = floors.flatMap((pair, f) => pair.map((_, side) => f === gap.floor && side === gap.side)).filter(Boolean);
      expect(empty.length, why).toBe(1);
      expect(gap.floor >= 0 && gap.floor < FLOORS && (gap.side === 0 || gap.side === 1), why).toBe(true);
      expect(answer, why).toBe(floors[gap.floor][gap.side]);
      expect(answer, 'the window next to it and the answer make the roof').toBe(roof - floors[gap.floor][1 - gap.side]);
      expect(options.length, why).toBe(4);
      expect(new Set(options).size, why).toBe(4);
      expect(options.every((v) => Number.isInteger(v) && v >= 0 && v <= roof), why).toBe(true);
      expect([...options].sort((x, y) => x - y), why).toEqual(options);
      expect(options.filter((v) => house.answer(s, house.start(s), v) === 'right'), why).toEqual([answer]);
      expect(house.solution(s, house.start(s)), why).toEqual([answer]);
    }
  });

  it(`${TASKS} houses: every roof 4..10, every floor and both sides of the empty window come up`, () => {
    const all = tasks(4);
    expect(new Set(all.map((s) => s.body.roof))).toEqual(new Set([4, 5, 6, 7, 8, 9, 10]));
    expect(new Set(all.map((s) => s.body.gap.floor))).toEqual(new Set([0, 1, 2]));
    expect(new Set(all.map((s) => s.body.gap.side))).toEqual(new Set([0, 1]));
  });

  it('the hint: the way said only, counting up from the window to the roof together, the answer lit', () => {
    expect(house.generate(4, mulberry32(1)).hint).toEqual({ rungs: [
      { key: 'h1_house', steps: [] }, { key: 'h2_house', steps: [{ do: 'countUp' }] }, { key: 'h3_show', steps: [{ do: 'pulseAnswer' }] },
    ] });
  });
});
