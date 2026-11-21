/**
 * "The search among the corals" (./corals.ts, WORLD-17): the description on every level of "Classification" - how
 * many are looked for, and look-alikes that differ the finer the higher the level, never the sample itself.
 */
import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { CORALS_BY_LEVEL, NEAR, generateCorals, sameShell } from './corals';

describe('the search among the corals by level of "Classification"', () => {
  it.each([1, 2, 3, 4, 5])('level %i: 3-5 looked for, the look-alikes never the sample and as fine as the level asks', (level) => {
    const by = CORALS_BY_LEVEL[level];
    for (let i = 0; i < 300; i++) {
      const b = generateCorals(level, createRng(`corals-${level}-${i}`));
      expect(b.hidden).toBeGreaterThanOrEqual(by.hidden[0]);
      expect(b.hidden).toBeLessThanOrEqual(by.hidden[1]);
      expect(b.alike).toHaveLength(by.alike);
      for (const a of b.alike) {
        expect(sameShell(a, b.sample)).toBe(false);
        const color = a.color !== b.sample.color, shape = a.shape !== b.sample.shape;
        if (by.differ === 'both') expect(color && shape).toBe(true);
        else expect(color !== shape).toBe(true);              // one of the two only
        if (by.differ === 'near' && color) expect(a.color).toBe(NEAR[b.sample.color]);
        if (by.differ === 'one' && color) expect(a.color).not.toBe(NEAR[b.sample.color]);
      }
    }
  });

  it('near colours go in pairs', () => {
    for (const [c, n] of Object.entries(NEAR)) expect(NEAR[n]).toBe(c);
  });
});
