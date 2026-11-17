// Waiting for what the game does in its own time, by the game's clock (window.__game.time, ?debug only): on the slow CI
// runner a second of game time takes many of the wall clock, so a wait by the wall clock there failed while the game was
// right (tools/clock-waits.mjs lists the waits that may still count the wall clock).
// A frame counts at most 0.05 s of game time (src/game/loop.ts), so the game runs at min(1, 0.05 x frames a second):
// at 3 frames a second (the desktop sizes under software rendering on the CI runner) N s of game time take up to 6.7N s
// of the clock - set the limits with that in mind; a wait that may run to its limit on a normal path is a wait by the
// clock, not by the game.
//
//   const { gameUntil, gameFor } = gameWaits(page, { ceiling: T(600000) });   (clock: helper)
//   await gameFor(() => !__game.busy, null, 30);          // fails after 30 s of game time
//   if (!(await gameUntil(pred, arg, 5))) ...             // false after 5 s of game time
//
// A game that stands still - its time does not move for STALL_MS of the wall clock (a forgotten __game.still, a frozen
// frame, a pause) - fails at once with what holds it, instead of hanging until the wall-clock ceiling (the job of the CI
// would then end by its own limit and the cause would be lost).

/** Wall-clock ms with no step of the game's time that count as a game standing still (the slowest runner: a frame in 2-3 s). */
export const STALL_MS = 60000;

/** The waits of one page. `ceiling`: wall-clock ms for a game that keeps moving yet never comes to the condition. */
export function gameWaits(page, { ceiling = 600000, stall = STALL_MS } = {}) {
  let n = 0;
  /** Waits for `pred(arg)` in the page: true when it holds, false once `seconds` of game time have passed without it. */
  const gameUntil = async (pred, arg, seconds) => {
    const id = `__gw${++n}`;
    const t0 = await page.evaluate((id) => { window[id] = { t: __game.time, at: performance.now() }; return __game.time; }, id);
    const h = await page.waitForFunction(`(() => {
      const w = window[${JSON.stringify(id)}], now = __game.time;
      if (now !== w.t) { w.t = now; w.at = performance.now(); }
      if ((${pred})(${JSON.stringify(arg)})) return 'yes';
      if (now - ${t0} > ${seconds}) return 'no';
      if (performance.now() - w.at > ${stall}) return 'stall';
      return false;
    })()`, null, { timeout: ceiling }); /* clock: ceiling */
    const how = await h.jsonValue();
    await page.evaluate((id) => { delete window[id]; }, id).catch(() => {});
    if (how === 'stall') {
      const st = await page.evaluate(() => ({ time: __game.time, paused: !!__game.paused, still: !!__game.isStill, busy: __game.busy, hidden: document.hidden })).catch(() => null);
      const msg = `the game stands still: its time has not moved for ${stall / 1000} s of the clock (${JSON.stringify(st)})`;
      console.log(msg);   // in the log even where the caller's .catch() gives its own message
      throw new Error(msg);
    }
    return how === 'yes';
  };
  /** The same as a promise that fails once `seconds` of game time have passed without `pred` (for `.catch` and `.then`). */
  const gameFor = async (pred, arg, seconds) => {
    if (!(await gameUntil(pred, arg, seconds))) throw new Error(`not within ${seconds} s of game time`);
  };
  return { gameUntil, gameFor };
}
