/**
 * The budget's measure of the grey walkthroughs (./grey-route.mjs budgetSettle, the CI job "budget"): a point waits as
 * much game time as the full measure, in a few big steps - the same on a fast drawing and on the runner's slow one.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { BUDGET_FRAMES, BUDGET_STEP, budgetFrames, budgetSettle } from './grey-route.mjs';

/** A page whose game runs its frame first in every frame, as src/game/loop.ts (it asks for the next one at its start). */
function fakePage(real = 1) {
  let queue = [];
  const raf = (f) => { queue.push(f); };
  const game = { time: 0, frames: 0, steps: [], snapped: 0, frameStep: null, settleCamera() { this.snapped++; }, stepFrames(s) { this.frameStep = s; } };
  const frame = () => { raf(frame); const dt = game.frameStep ?? Math.min(real, 0.05); game.time += dt; game.frames++; game.steps.push(dt); };
  raf(frame);
  globalThis.__game = game;
  globalThis.requestAnimationFrame = raf;
  const tick = () => { const now = queue; queue = []; for (const f of now) f(); };
  return {
    game,
    // the frames go on while the page waits
    evaluate: (fn, arg) => new Promise((resolve, reject) => {
      const p = fn(arg);
      let n = 0;
      const run = () => { if (++n > 1000) { reject(new Error('never ends')); return; } tick(); setTimeout(run, 0); };
      Promise.resolve(p).then(resolve, reject);
      setTimeout(run, 0);
    }),
  };
}

describe('the budget\'s wait at a point', () => {
  afterEach(() => { delete globalThis.__game; delete globalThis.requestAnimationFrame; });

  it('takes BUDGET_FRAMES frames at least, steps of BUDGET_STEP s at most', () => {
    expect(budgetFrames(1.2)).toBe(BUDGET_FRAMES);
    expect(budgetFrames(0.4)).toBe(BUDGET_FRAMES);
    expect(budgetFrames(3)).toBe(10);
    expect(budgetFrames(5)).toBe(17);
    for (const s of [0.4, 0.9, 1.2, 3, 5]) expect(s / budgetFrames(s)).toBeLessThanOrEqual(BUDGET_STEP + 1e-9);
  });

  it('waits the full measure\'s game time on a slow drawing: the camera snapped once, the real time back after', async () => {
    const page = fakePage(1);
    const t0 = page.game.time, f0 = page.game.frames;
    await budgetSettle(page, 1.2);
    expect(page.game.frames - f0).toBe(4);
    expect(page.game.time - t0).toBeCloseTo(1.2);
    expect(page.game.snapped).toBe(1);
    expect(page.game.frameStep).toBe(null);
    await budgetSettle(page, 3);
    expect(page.game.time - t0).toBeCloseTo(4.2);
  });
});
