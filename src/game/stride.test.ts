import { describe, expect, it } from 'vitest';
import { CAT_PACE_MAX, GROUND, PACE_MIN, pace, speedometer } from './stride';

describe('the pace of the steps (src/game/stride.ts)', () => {
  it('is the speed over its clip\'s speed over the ground: a standing foot keeps its place', () => {
    expect(pace(GROUND.heroRun * 1.5, GROUND.heroRun)).toBeCloseTo(1.5);
    expect(pace(1, GROUND.heroWalk)).toBeCloseTo(1 / GROUND.heroWalk);
  });

  it('holds to its bounds: never slower than PACE_MIN, the cat never above CAT_PACE_MAX', () => {
    expect(pace(0, GROUND.catWalk)).toBe(PACE_MIN);
    expect(pace(5.4, GROUND.catWalk, CAT_PACE_MAX)).toBe(CAT_PACE_MAX);
  });

  it('reads the speed from where a character is, smoothed over about a tenth of a second', () => {
    const v = speedometer();
    expect(v(0, 0, 1 / 60)).toBe(0);   // the first frame has nothing to compare with
    let s = 0;
    for (let i = 1; i <= 120; i++) s = v(i * 0.05, 0, 1 / 60);   // 3 m/s for two seconds
    expect(s).toBeCloseTo(3, 1);
    expect(v(6, 0, 1 / 60)).toBeLessThan(3);   // it stopped: the speed falls, not at once
  });
});
