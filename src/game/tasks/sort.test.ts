// @vitest-environment node
/**
 * The gem-sorting generator and model without a page (ARCH-09, R10). The description alone - baskets and queue -
 * is what any view needs (the panel now, the world later): the model judges each gem, the view only draws.
 */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { COLORS, sort } from './sort';

/** The hint as HINTS.md has it: rung 1 says the way and shows nothing, rung 2 solves it together, rung 3 lights the answer. */
const LADDER = (way: string, key: string, steps: object[], lit: object[] = [{ do: 'pulseAnswer' }]) =>
  ({ rungs: [{ key: way, steps: [] }, { key, steps }, { key: 'h3_show', steps: lit }] });

const TASKS = 1000;
const SIZES = [[0, 0], [2, 6], [3, 6], [3, 9]];     // colours, gems by level

describe('sort generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([1, 2, 3])(`level %i: ${TASKS} tasks share the gems equally between distinct baskets`, (level) => {
    const [howMany, gems] = SIZES[level];
    for (let i = 0; i < TASKS; i++) {
      const s = sort.generate(level, mulberry32(level * 100_000 + i)), { colors, queue } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('sort'); expect(s.level, why).toBe(level); expect(s.prompt, why).toBe('t_sort');
      expect(colors.length, why).toBe(howMany);
      expect(new Set(colors).size, why).toBe(howMany);
      expect(colors.every((c) => COLORS.includes(c)), why).toBe(true);
      expect(queue.length, why).toBe(gems);
      for (const c of colors) expect(queue.filter((q) => q === c).length, why).toBe(gems / howMany);
      const st = sort.start(s);
      expect(sort.solution(s, st), why).toEqual(queue);
      expect(queue.map((c) => sort.answer(s, st, c)), why).toEqual([...queue.slice(1).map(() => 'step'), 'right']);
      expect(sort.answer(s, st, queue[0]), `${why}: nothing is left to sort`).toBe('ignored');
    }
  });

  it('a gem into another basket is wrong and stays the current one', () => {
    const s = sort.generate(2, mulberry32(5)), st = sort.start(s), { colors, queue } = s.body;
    const elsewhere = colors.find((c) => c !== queue[0])!;
    expect(sort.answer(s, st, elsewhere)).toBe('wrong');
    expect(sort.solution(s, st)).toEqual(queue);
    expect(sort.answer(s, st, queue[0])).toBe('step');
    expect(sort.solution(s, st)).toEqual(queue.slice(1));
  });

  it('generating does not lean on the description it gave: sorting leaves the queue as it was', () => {
    const s = sort.generate(3, mulberry32(9)), copy = structuredClone(s), st = sort.start(s);
    for (const c of sort.solution(s, st)) sort.answer(s, st, c);
    expect(s).toEqual(copy);
  });

  it('the hint: the way (said only), then the gem tries the baskets together, then the basket of the current gem pulses', () => {
    expect(sort.generate(1, mulberry32(1)).hint).toEqual(LADDER('h_sort', 'h2_sort', [{ do: 'tryBaskets' }], [{ do: 'pulseNext' }]));
  });
});
