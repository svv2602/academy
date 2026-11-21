/**
 * "The second half" (./half.ts, WORLD-18): the description on every level of "Patterns" - exactly one valve is the
 * mirror, every wrong one differs from it, on 4-5 one of them is the pattern turned round.
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { COLS, HALF_BY_LEVEL, ROWS, alike, generateHalfBody, turned } from './half';

describe('the second half by level of "Patterns"', () => {
  it.each([1, 2, 3, 4, 5])('level %i: one mirror among the valves, every other differs from it and from each other', (level) => {
    const by = HALF_BY_LEVEL[level];
    for (let i = 0; i < 400; i++) {
      const b = generateHalfBody(level, createRng(`half-${level}-${i}`));
      expect(b.given).toHaveLength(by.figures);
      for (const f of b.given) {
        expect(f.col).toBeGreaterThanOrEqual(0); expect(f.col).toBeLessThan(COLS);
        expect(f.row).toBeGreaterThanOrEqual(0); expect(f.row).toBeLessThan(ROWS);
        expect(f.shape === 'spot').toBe(by.spots);
      }
      // no two figures in one cell
      expect(new Set(b.given.map((f) => f.col * 10 + f.row)).size).toBe(by.figures);
      expect(b.options).toHaveLength(by.options);
      expect(b.options.filter((o) => alike(o, b.given))).toHaveLength(1);
      expect(alike(b.options[b.answer], b.given)).toBe(true);
      b.options.forEach((o, k) => b.options.forEach((p, m) => { if (k < m) expect(alike(o, p)).toBe(false); }));
      if (by.turned) {
        expect(b.turned).not.toBe(b.answer);
        expect(alike(b.options[b.turned], turned(b.given))).toBe(true);
      } else expect(b.turned).toBe(-1);
    }
  });

  it('turned twice is the pattern itself; a level out of 1-5 plays its nearest', () => {
    const b = generateHalfBody(5, createRng('half-turn'));
    expect(alike(turned(turned(b.given)), b.given)).toBe(true);
    expect(generateHalfBody(0, createRng('half-low')).given).toHaveLength(HALF_BY_LEVEL[1].figures);
    expect(generateHalfBody(9, createRng('half-high')).given).toHaveLength(HALF_BY_LEVEL[5].figures);
  });
});
