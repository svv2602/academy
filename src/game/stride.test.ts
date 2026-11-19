import { describe, expect, it } from 'vitest';
import { TUNING_DEFAULTS } from '../core/tuning';
import { CAT_RUN_MAX, CAT_WALK_BACK, CAT_WALK_MAX, GROUND, PACE_MIN, PET_RUN_MAX, PET_WALK_BACK, PET_WALK_MAX, pace, paceFollower, speedometer } from './stride';

describe('the pace of the steps (src/game/stride.ts)', () => {
  it('is the speed over its clip\'s speed over the ground: a standing foot keeps its place', () => {
    expect(pace(GROUND.heroRun * 1.5, GROUND.heroRun)).toBeCloseTo(1.5);
    expect(pace(1, GROUND.heroWalk)).toBeCloseTo(1 / GROUND.heroWalk);
  });

  it('holds to its bounds: never slower than PACE_MIN, never above its max', () => {
    expect(pace(0, GROUND.catWalk)).toBe(PACE_MIN);
    expect(pace(5.4, GROUND.catWalk, CAT_WALK_MAX)).toBe(CAT_WALK_MAX);
  });

  it('the cat runs at the heroine\'s run with its paws in place, and walks again only well below where it runs', () => {
    expect(pace(5.4, GROUND.catRun, CAT_RUN_MAX)).toBeCloseTo(5.4 / GROUND.catRun);   // not held: no slide
    expect(CAT_WALK_BACK).toBeLessThan(CAT_WALK_MAX * 0.8);
  });

  it('the fawn\'s gallop at the heroine\'s run: under half the strides it would need, its paws sliding at most 0.6 of the way', () => {
    const run = TUNING_DEFAULTS.speed;
    expect(pace(run, GROUND.fawnGallop)).toBeGreaterThan(5);   // what a standing paw would need: the legs whirred
    expect(pace(run, GROUND.fawnGallop, PET_RUN_MAX)).toBe(PET_RUN_MAX);
    expect(PET_RUN_MAX).toBeLessThanOrEqual(pace(run, GROUND.fawnGallop) / 2.4);
    expect(1 - (PET_RUN_MAX * GROUND.fawnGallop) / run).toBeLessThanOrEqual(0.6);
  });

  it('the pet walks again only well below where it starts to gallop', () => {
    expect(PET_WALK_BACK).toBeLessThan(PET_WALK_MAX * 0.8);
  });

  it('a pace follows its target in about a fifth of a second; a new clip starts at its target', () => {
    const f = paceFollower();
    expect(f.reset(1)).toBe(1);
    let p = 1;
    for (let i = 0; i < 6; i++) p = f.next(2, 1 / 60);   // a tenth of a second
    expect(p).toBeGreaterThan(1.3); expect(p).toBeLessThan(1.5);
    for (let i = 0; i < 60; i++) p = f.next(2, 1 / 60);
    expect(p).toBeCloseTo(2, 1);
    expect(f.next(5, 1 / 60)).toBeLessThan(2.3);           // a jump of the target is not a jump of the legs
    expect(f.reset(0.7)).toBe(0.7);
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
