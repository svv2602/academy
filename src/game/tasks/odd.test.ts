// @vitest-environment node
/** The odd-one-out generator without a page (ARCH-09, R10): one group plus one stranger, one right answer. */
import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import { FIG_COLORS, FIG_SHAPES, GROUPS, figureOf, odd, type Figure } from './odd';

/** The hint as HINTS.md has it: rung 1 says the way and shows nothing, rung 2 solves it together, rung 3 lights the answer. */
const LADDER = (way: string, key: string, steps: object[], lit: object[] = [{ do: 'pulseAnswer' }]) =>
  ({ rungs: [{ key: way, steps: [] }, { key, steps }, { key: 'h3_show', steps: lit }] });

const TASKS = 1000;
const groupOf = (s: string) => GROUPS.findIndex((g) => g.includes(s));

describe('odd generator', () => {
  it('runs without a page', () => { expect(typeof document).toBe('undefined'); });

  it.each([1, 2, 3])(`level %i: ${TASKS} tasks show one group and exactly one stranger`, (level) => {
    for (let i = 0; i < TASKS; i++) {
      const s = odd.generate(level, mulberry32(level * 100_000 + i)), { things, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('odd'); expect(s.level, why).toBe(level); expect(s.prompt, why).toBe('t_odd');
      expect(things.length, why).toBe(level === 3 ? 5 : 4);
      expect(things.every((t) => groupOf(t) >= 0), why).toBe(true);
      const stranger = things.filter((t) => things.filter((u) => groupOf(u) === groupOf(t)).length === 1);
      expect(stranger, why).toEqual([things[answer]]);
      expect(new Set(things.map(groupOf)).size, why).toBe(2);
      const rest = things.filter((_, k) => k !== answer);
      // Level 1 is "the obvious odd one": three copies of one thing. From level 2 on nothing repeats.
      expect(new Set(rest).size, why).toBe(level === 1 ? 1 : rest.length);
      expect(things.map((_, k) => k).filter((k) => odd.answer(s, odd.start(s), k) === 'right'), why).toEqual([answer]);
      expect(odd.solution(s, odd.start(s)), why).toEqual([answer]);
    }
  });

  // Level 4 (docs/11-learning.md): "odd by a feature (shape, size)" - one colour for all, exactly one figure differs,
  // and it differs in that one feature only.
  it(`level 4: ${TASKS} tasks - one colour, four figures the same, the fifth differs in the shape alone or the size alone`, () => {
    const features = new Set<string>();
    for (let i = 0; i < TASKS; i++) {
      const s = odd.generate(4, mulberry32(400_000 + i)), { things, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.type, why).toBe('odd'); expect(s.level, why).toBe(4); expect(s.prompt, why).toBe('t_odd');
      expect(things.length, why).toBe(5);
      const figs = things.map(figureOf), stranger = figs[answer], rest = things.filter((_, k) => k !== answer);
      expect(figs.every((f) => FIG_COLORS.includes(f.color) && FIG_SHAPES.includes(f.shape)), why).toBe(true);
      expect(new Set(figs.map((f) => f.color)).size, why).toBe(1);
      expect(new Set(rest).size, why).toBe(1);                                    // the four others are one and the same
      const like = figureOf(rest[0]), differs = (['shape', 'small'] as const).filter((k) => stranger[k] !== like[k]);
      expect(differs.length, why).toBe(1);                                       // exactly one feature differs
      features.add(differs[0]);
      expect(things.map((_, k) => k).filter((k) => odd.answer(s, odd.start(s), k) === 'right'), why).toEqual([answer]);
    }
    expect([...features].sort()).toEqual(['shape', 'small']);
  });

  // Level 5: "two features" - no colour and no shape is alone; the odd one is the only figure without a twin in both.
  it(`level 5: ${TASKS} tasks - two pairs and one figure that shares its colour with one pair and its shape with the other`, () => {
    const key = (f: Figure) => `${f.color} ${f.shape}`;
    for (let i = 0; i < TASKS; i++) {
      const s = odd.generate(5, mulberry32(500_000 + i)), { things, answer } = s.body, why = `seed #${i}: ${JSON.stringify(s.body)}`;
      expect(s.level, why).toBe(5); expect(s.prompt, why).toBe('t_odd');
      expect(things.length, why).toBe(5);
      const figs = things.map(figureOf), times = (f: (x: Figure) => string, v: string) => figs.filter((x) => f(x) === v).length;
      expect(figs.every((f) => !f.small), why).toBe(true);
      expect(figs.map((_, k) => k).filter((k) => times(key, key(figs[k])) === 1), why).toEqual([answer]);
      expect(figs.every((f) => times((x) => x.color, f.color) >= 2 && times((x) => x.shape, f.shape) >= 2), why).toBe(true);
      expect(new Set(figs.map((f) => f.color)).size, why).toBe(2);
      expect(new Set(figs.map((f) => f.shape)).size, why).toBe(2);
      expect(things.map((_, k) => k).filter((k) => odd.answer(s, odd.start(s), k) === 'right'), why).toEqual([answer]);
    }
  });

  it('the hint of levels 4 and 5: the way of the feature (said only), then the alike framed, then the stranger pulses', () => {
    expect(odd.generate(4, mulberry32(1)).hint).toEqual(LADDER('h1_odd_shape', 'h2_odd', [{ do: 'frameAlike' }]));
    expect(odd.generate(5, mulberry32(1)).hint).toEqual(LADDER('h1_odd_two', 'h2_odd', [{ do: 'frameAlike' }]));
  });

  it('the stranger stands anywhere in the row', () => {
    const places = new Set(Array.from({ length: 200 }, (_, i) => odd.generate(2, mulberry32(i)).body.answer));
    expect([...places].sort()).toEqual([0, 1, 2, 3]);
  });

  it('the hint: the way (said only), then the alike things framed together, then the stranger pulses', () => {
    expect(odd.generate(1, mulberry32(1)).hint).toEqual(LADDER('h_odd', 'h2_odd', [{ do: 'frameAlike' }]));
  });
});
