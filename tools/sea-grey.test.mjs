/**
 * The budget of the sea's grey walkthrough (./sea-grey.mjs): a point over it fails the run at the stretch of the map the
 * game plays only; the other stretch is measured to compare and its numbers are only told.
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_SCALE } from '../src/worlds/sea/layout';
import { SHIPPED_SCALE, budgetFails, readArgs } from './sea-grey.mjs';

describe('the budget of the sea grey walkthrough', () => {
  const over = [{ at: 'secret whale', calls: 113, tris: 251000 }];
  it('is the scale of the game', () => {
    expect(SHIPPED_SCALE).toBe(DEFAULT_SCALE);
    expect(readArgs([]).scales).toContain(SHIPPED_SCALE);
  });
  it('a point over it fails the run at the scale of the game', () => {
    expect(budgetFails({ scale: SHIPPED_SCALE, over })).toBe(true);
    expect(budgetFails({ scale: SHIPPED_SCALE, over: [] })).toBe(false);
  });
  it('at the scale turned down it is only told', () => {
    expect(budgetFails({ scale: 1, over })).toBe(false);
  });
});

describe('--budget (the CI job "budget"): the draw at the scale of the game only', () => {
  it('leaves out the walkthrough, the water and the scale turned down', () => {
    expect(readArgs(['--budget'])).toMatchObject({ budget: true, pass: false, water: false, measure: true, scales: [SHIPPED_SCALE] });
    expect(readArgs([])).toMatchObject({ budget: false, pass: true, water: true, scales: [1, SHIPPED_SCALE] });
  });
});
