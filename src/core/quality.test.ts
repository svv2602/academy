import { describe, expect, it } from 'vitest';
import { RETRY_EVERY, startTier } from './quality';

const none = { param: null, pinned: null, saved: 2, launches: 0 };

describe('startTier (TECH-04)', () => {
  it('starts a fresh save at the top tier, remembered (the automatic fallback may lower it)', () => {
    expect(startTier(none)).toEqual({ tier: 2, launches: 1, by: 'saved' });
  });

  it('starts at the tier the last session ended on', () => {
    expect(startTier({ ...none, saved: 1, launches: 3 })).toEqual({ tier: 1, launches: 4, by: 'saved' });
    expect(startTier({ ...none, saved: 0, launches: 4 })).toEqual({ tier: 0, launches: 5, by: 'saved' });
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
    expect(startTier({ ...none, saved: 1, launches: 19 })).toEqual({ tier: 2, launches: 20, by: 'saved' });
  });

  it('never goes above the top tier', () => {
    expect(startTier({ ...none, saved: 2, launches: 9 }).tier).toBe(2);
  });

  it('takes the tier the parent pinned, without the fallback and without the tenth-launch try', () => {
    expect(startTier({ ...none, pinned: 0, saved: 2, launches: 3 })).toEqual({ tier: 0, launches: 4, by: 'pin' });
    expect(startTier({ ...none, pinned: 1, saved: 0, launches: 9 })).toEqual({ tier: 1, launches: 10, by: 'pin' });
    expect(startTier({ ...none, pinned: 2, saved: 0 })).toEqual({ tier: 2, launches: 1, by: 'pin' });
  });

  it('lets ?q= win over the pinned and the saved tier', () => {
    expect(startTier({ ...none, param: '0', pinned: 2, saved: 2 })).toEqual({ tier: 0, launches: 1, by: 'param' });
    expect(startTier({ ...none, param: '2', pinned: 0, saved: 0, launches: 9 })).toEqual({ tier: 2, launches: 10, by: 'param' });
    expect(startTier({ ...none, param: '1' })).toEqual({ tier: 1, launches: 1, by: 'param' });
  });

  it('ignores a ?q= that is not a tier', () => {
    for (const param of ['', ' ', '3', '-1', '1.5', 'x', 'NaN']) {
      expect(startTier({ ...none, param, saved: 1, launches: 2 })).toEqual({ tier: 1, launches: 3, by: 'saved' });
      expect(startTier({ ...none, param, pinned: 0 })).toEqual({ tier: 0, launches: 1, by: 'pin' });
    }
  });

  it('treats broken stored values as their defaults', () => {
    for (const bad of [undefined, null, 3, -1, 1.5, '1', NaN]) {
      expect(startTier({ ...none, saved: bad }).tier).toBe(2);
      expect(startTier({ ...none, pinned: bad, saved: 1 })).toEqual({ tier: 1, launches: 1, by: 'saved' });
    }
    for (const bad of [undefined, null, -3, 2.5, '7', NaN]) expect(startTier({ ...none, launches: bad }).launches).toBe(1);
  });
});
