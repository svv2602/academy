import { describe, expect, it } from 'vitest';
import {
  COOL_GAP_MS, DOWN_FPS, DOWN_SECONDS, TRIAL_S, UP_FAILS, UP_FPS, UP_GAP_S, UP_SECONDS, WARM_S, RETRY_EVERY,
  autoMayRaise, autoRaise, autoSecond, autoStart, startTier, upGap, type Auto, type Tier,
} from './quality';
import { RESET_GAP_MS } from '../game/session';

const none = { param: null, pinned: null, saved: 2, launches: 0 };

describe('startTier (TECH-04)', () => {
  it('starts a fresh save at the top tier, remembered (the automatic fallback may lower it)', () => {
    expect(startTier(none)).toEqual({ tier: 2, launches: 1, by: 'saved', raised: false });
  });

  it('starts at the tier the last session ended on', () => {
    expect(startTier({ ...none, saved: 1, launches: 3 })).toEqual({ tier: 1, launches: 4, by: 'saved', raised: false });
    expect(startTier({ ...none, saved: 0, launches: 4 })).toEqual({ tier: 0, launches: 5, by: 'saved', raised: false });
  });

  it('counts every launch', () => {
    let launches = 0;
    for (let i = 1; i <= 25; i++) { launches = startTier({ ...none, launches }).launches; expect(launches).toBe(i); }
  });

  it('tries one tier higher on every tenth launch only', () => {
    expect(RETRY_EVERY).toBe(10);
    const tiers = Array.from({ length: 30 }, (_, n) => startTier({ ...none, saved: 0, launches: n }).tier);
    // launches 10, 20, 30 (counted before: 9, 19, 29) try tier 1; every other launch stays at 0
    expect(tiers.map((t, n) => (t === 1 ? n + 1 : 0)).filter(Boolean)).toEqual([10, 20, 30]);
    expect(startTier({ ...none, saved: 1, launches: 19 })).toEqual({ tier: 2, launches: 20, by: 'saved', raised: true });
  });

  it('never goes above the top tier', () => {
    expect(startTier({ ...none, saved: 2, launches: 9 }).tier).toBe(2);
  });

  it('takes the tier the parent pinned, without the fallback and without the tenth-launch try', () => {
    expect(startTier({ ...none, pinned: 0, saved: 2, launches: 3 })).toEqual({ tier: 0, launches: 4, by: 'pin', raised: false });
    expect(startTier({ ...none, pinned: 1, saved: 0, launches: 9 })).toEqual({ tier: 1, launches: 10, by: 'pin', raised: false });
    expect(startTier({ ...none, pinned: 2, saved: 0 })).toEqual({ tier: 2, launches: 1, by: 'pin', raised: false });
  });

  it('lets ?q= win over the pinned and the saved tier', () => {
    expect(startTier({ ...none, param: '0', pinned: 2, saved: 2 })).toEqual({ tier: 0, launches: 1, by: 'param', raised: false });
    expect(startTier({ ...none, param: '2', pinned: 0, saved: 0, launches: 9 })).toEqual({ tier: 2, launches: 10, by: 'param', raised: false });
    expect(startTier({ ...none, param: '1' })).toEqual({ tier: 1, launches: 1, by: 'param', raised: false });
  });

  it('ignores a ?q= that is not a tier', () => {
    for (const param of ['', ' ', '3', '-1', '1.5', 'x', 'NaN']) {
      expect(startTier({ ...none, param, saved: 1, launches: 2 })).toEqual({ tier: 1, launches: 3, by: 'saved', raised: false });
      expect(startTier({ ...none, param, pinned: 0 })).toEqual({ tier: 0, launches: 1, by: 'pin', raised: false });
    }
  });

  it('treats broken stored values as their defaults', () => {
    for (const bad of [undefined, null, 3, -1, 1.5, '1', NaN]) {
      expect(startTier({ ...none, saved: bad }).tier).toBe(2);
      expect(startTier({ ...none, pinned: bad, saved: 1 })).toEqual({ tier: 1, launches: 1, by: 'saved', raised: false });
    }
    for (const bad of [undefined, null, -3, 2.5, '7', NaN]) expect(startTier({ ...none, launches: bad }).launches).toBe(1);
  });
});

describe('startTier after a break (TECH-16)', () => {
  it('a launch half an hour or more after the last frame of play tries one tier higher, on trial', () => {
    expect(COOL_GAP_MS).toBe(RESET_GAP_MS);   // the same break that starts a new session (src/game/session.ts)
    expect(startTier({ ...none, saved: 1, launches: 3, gapMs: COOL_GAP_MS })).toEqual({ tier: 2, launches: 4, by: 'saved', raised: true });
    expect(startTier({ ...none, saved: 0, launches: 3, gapMs: 5 * 3600_000 })).toEqual({ tier: 1, launches: 4, by: 'saved', raised: true });
  });
  it('a shorter break, or none known, keeps the remembered tier', () => {
    for (const gapMs of [COOL_GAP_MS - 1, 0, -5, null, undefined, NaN]) {
      expect(startTier({ ...none, saved: 1, launches: 3, gapMs })).toEqual({ tier: 1, launches: 4, by: 'saved', raised: false });
    }
  });
  it('never above the top tier, and never over ?q= or the parent\'s pin', () => {
    expect(startTier({ ...none, saved: 2, gapMs: COOL_GAP_MS })).toEqual({ tier: 2, launches: 1, by: 'saved', raised: false });
    expect(startTier({ ...none, param: '0', gapMs: COOL_GAP_MS }).tier).toBe(0);
    expect(startTier({ ...none, pinned: 1, saved: 0, gapMs: COOL_GAP_MS }).tier).toBe(1);
  });
});

/** Plays seconds of `fps` (a number for each, or [fps, n]) from `a`; `closed` - every one of them behind a closed frame. */
function play(a: Auto, ...steps: (number | [number, number])[]): Auto {
  for (const st of steps) {
    const [fps, n] = typeof st === 'number' ? [st, 1] : st;
    for (let i = 0; i < n; i++) a = autoSecond(a, fps);
  }
  return a;
}
const settled = (tier: Tier, raised = false) => play(autoStart(tier, raised), [60, WARM_S]);   // past the warm-up
/** A change of world: its frame closed for a second, a try up made if allowed, as src/core/renderer.ts does. */
const travel = (a: Auto) => { const up = autoMayRaise(a) ? autoRaise(a) : a; return autoSecond(up, 10, { closed: true }); };

describe('the game keeps its own tier (TECH-16, the measure of 2026-11-20)', () => {
  it('has the numbers the customer took', () => {
    expect([DOWN_FPS, DOWN_SECONDS, UP_FPS, UP_SECONDS, UP_GAP_S, UP_FAILS]).toEqual([45, 5, 58, 30, 180, 2]);
    expect([upGap(0), upGap(1)]).toEqual([180, 360]);
  });

  it('lowers after five slow seconds in a row, not four', () => {
    expect(play(settled(2), [36, 5]).tier).toBe(1);
    expect(play(settled(2), [36, 4], 60, [36, 4]).tier).toBe(2);
    expect(play(settled(2), [44.9, 5]).tier).toBe(1);
    expect(play(settled(2), [45, 600]).tier).toBe(2);   // 45 is not slow
  });

  it('a steady 46 for ten minutes changes nothing', () => {
    expect(play(settled(2), [46, 600]).tier).toBe(2);
    const low = play(settled(1), [46, 600]);
    expect(low.tier).toBe(1);
    expect(autoMayRaise(low)).toBe(false);
  });

  it('counts nothing in the first seconds after a change, nor behind a closed frame, nor on a hidden page', () => {
    expect(play(autoStart(2), [10, WARM_S], [10, DOWN_SECONDS - 1]).tier).toBe(2);
    let a = settled(2);
    for (let i = 0; i < 20; i++) a = autoSecond(a, 5, { closed: true });
    expect(a.tier).toBe(2);
    expect(play(a, [10, WARM_S], [10, DOWN_SECONDS - 1]).tier).toBe(2);   // the closed frame starts the count over
    const hidden = settled(2);
    let h = hidden;
    for (let i = 0; i < 60; i++) h = autoSecond(h, 5, { hidden: true });
    expect(h).toEqual(hidden);
  });

  it('never goes below 0 or above 2', () => {
    expect(play(settled(0), [5, 100]).tier).toBe(0);
    const top = play(settled(2), [60, 400]);
    expect(autoMayRaise(top)).toBe(false);
    expect(autoRaise(top).tier).toBe(2);
  });

  it('raises only after 30 good seconds, 3 minutes since the change, and behind the closed frame of a change of world', () => {
    const down = play(settled(2), [36, 5]);
    expect(down.tier).toBe(1);
    // two minutes of 60 fps: good enough, too soon
    const early = play(down, [60, 120]);
    expect(autoMayRaise(early)).toBe(false);
    expect(travel(early).tier).toBe(1);
    // three minutes: allowed - but only at a change of world (the caller asks while the frame is closed)
    const ready = play(down, [60, UP_GAP_S]);
    expect(autoMayRaise(ready)).toBe(true);
    expect(ready.tier).toBe(1);
    expect(travel(ready).tier).toBe(2);
    // 29 good seconds after a slow one are not enough
    expect(autoMayRaise(play(down, [60, UP_GAP_S], 40, [60, UP_SECONDS - 1]))).toBe(false);
  });

  it('a raise that falls back within its trial failed: the next try waits 6 minutes; after two failures none', () => {
    let a = travel(play(play(settled(2), [36, 5]), [60, UP_GAP_S]));
    expect(a.tier).toBe(2);
    a = play(a, [60, WARM_S], [40, DOWN_SECONDS]);   // the frame opens, settles, and the phone is too warm
    expect(a.tier).toBe(1);
    expect(a.fails).toBe(1);
    expect(travel(play(a, [60, UP_GAP_S])).tier).toBe(1);   // 3 minutes: not yet
    a = play(a, [60, upGap(1)]);
    expect(autoMayRaise(a)).toBe(true);
    a = play(travel(a), [60, WARM_S], [40, DOWN_SECONDS]);
    expect([a.tier, a.fails]).toEqual([1, 2]);
    expect(autoMayRaise(play(a, [60, 3600]))).toBe(false);   // no other try this session
  });

  it('a fall after the trial is an ordinary one: no failure counted', () => {
    let a = travel(play(play(settled(2), [36, 5]), [60, UP_GAP_S]));
    a = play(a, [60, WARM_S], [60, TRIAL_S + 1], [40, DOWN_SECONDS]);
    expect([a.tier, a.fails]).toEqual([1, 0]);
  });

  it('a raise at the launch is on trial: falling back counts as the first failed try (decision 2026-11-20)', () => {
    const start = startTier({ param: null, pinned: null, saved: 1, launches: 3, gapMs: COOL_GAP_MS });
    let a = play(autoStart(start.tier, start.raised), [60, WARM_S], [40, DOWN_SECONDS]);
    expect([a.tier, a.fails]).toEqual([1, 1]);
    expect(travel(play(a, [60, UP_GAP_S])).tier).toBe(1);
    a = play(a, [60, upGap(1)]);
    expect(travel(a).tier).toBe(2);
    // the tenth launch's try is on trial the same way
    const tenth = startTier({ param: null, pinned: null, saved: 0, launches: RETRY_EVERY - 1 });
    expect(tenth).toMatchObject({ tier: 1, raised: true });
  });

  it('flipping between 44 and 58 every second for an hour changes nothing (the hysteresis)', () => {
    let a = settled(1);
    for (let i = 0; i < 3600; i++) { a = autoSecond(a, i % 2 ? 44 : 58); if (i % 600 === 0) a = travel(a); }
    expect(a.tier).toBe(1);
    let b = settled(2);
    for (let i = 0; i < 3600; i++) b = autoSecond(b, i % 2 ? 44 : 58);
    expect(b.tier).toBe(2);
  });

  it('a long warm session: down once, tries at most twice, never more often than the gaps allow', () => {
    // the phone gives 40 on q2 and 60 on q1, a change of world every minute, for an hour
    let a = settled(2), changes = 0;
    for (let s = 0; s < 3600; s++) {
      const before = a.tier;
      if (s % 60 === 0) a = travel(a);
      a = autoSecond(a, a.tier === 2 ? 40 : 60);
      if (a.tier !== before) changes++;
    }
    expect(a.tier).toBe(1);
    expect(a.fails).toBe(UP_FAILS);
    expect(changes).toBe(1 + 2 * UP_FAILS);   // the first fall, then two tries up and their falls
  });
});
