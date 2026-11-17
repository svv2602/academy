import { afterEach, describe, expect, it } from 'vitest';
import { gameWaits } from './game-wait.mjs';

/** A page stand-in: its scripts run here, against a made-up __game whose time the test moves (or holds). */
function fakePage() {
  globalThis.window = globalThis;
  globalThis.__game = { time: 0, busy: false };
  return {
    evaluate: async (fn, arg) => fn(arg),
    waitForFunction: (expr, _arg, { timeout }) => new Promise((resolve, reject) => {
      const t0 = Date.now();
      const tick = () => {
        let v;
        try { v = (0, eval)(expr); } catch (e) { reject(e); return; }
        if (v) { resolve({ jsonValue: async () => v }); return; }
        if (Date.now() - t0 > timeout) { reject(new Error('the wall-clock ceiling')); return; }
        setTimeout(tick, 2);
      };
      tick();
    }),
  };
}

afterEach(() => { delete globalThis.__game; });

describe('waits by the game\'s clock (tools/game-wait.mjs)', () => {
  it('a condition that comes true while the game plays: true', async () => {
    const page = fakePage();
    const { gameUntil } = gameWaits(page, { ceiling: 2000, stall: 1000 });
    const timer = setInterval(() => { __game.time += 0.05; if (__game.time > 0.5) __game.busy = true; }, 2);
    try { expect(await gameUntil(() => __game.busy, null, 5)).toBe(true); } finally { clearInterval(timer); }
  });

  it('its seconds of game time pass without the condition: false, and gameFor fails', async () => {
    const page = fakePage();
    const { gameUntil, gameFor } = gameWaits(page, { ceiling: 2000, stall: 1000 });
    const timer = setInterval(() => { __game.time += 0.05; }, 2);
    try {
      expect(await gameUntil(() => __game.busy, null, 1)).toBe(false);
      await expect(gameFor(() => __game.busy, null, 1)).rejects.toThrow(/not within 1 s of game time/);
    } finally { clearInterval(timer); }
  });

  it('a game whose time stands still fails at once, saying so - not at the wall-clock ceiling', async () => {
    const page = fakePage();
    const { gameUntil } = gameWaits(page, { ceiling: 3000, stall: 60 });
    const t0 = Date.now();
    await expect(gameUntil(() => __game.busy, null, 5)).rejects.toThrow(/the game stands still/);
    expect(Date.now() - t0).toBeLessThan(1500);
  });
});
