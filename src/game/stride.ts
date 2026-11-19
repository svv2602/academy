/**
 * The pace of the steps (the time scale of a walking clip) from the speed a character really moves at, so that a foot
 * that stands stays where it stands. A clip at a pace of 1 takes a standing foot back under the body at its own speed
 * over the ground; a character moving at `speed` needs the pace speed / that.
 *
 * The speeds over the ground are measured by tools/feet.mjs (2026-11-18, the models at their size in the game): the
 * clip is played in place and the speed of a standing foot going back is read. Before, the pace was guessed: the
 * heroine's walk at speed / 1.5 (its foot covered a third of the way), the cat and the pet by the distance to their
 * place, 0.8-2.2 (a standing paw slid at 85-90 % of the speed of the body).
 */
import { clamp } from '../core/util';

/** The speed over the ground of each walking clip at a pace of 1, m/s (tools/feet.mjs). */
export const GROUND = {
  heroWalk: 0.5,
  heroRun: 3.17,
  /** The cat has no other walking clip: at the heroine's run it cannot keep its paws (see CAT_PACE_MAX). */
  catWalk: 0.41,
  fawnWalk: 0.24,
  fawnGallop: 1.04,
} as const;

/**
 * The highest pace of the cat's walk: above it the legs only blur. At the heroine's run (5.4 m/s) the cat would need a
 * pace near 20; it keeps 3 and slides the rest (decision 2026-11-18; a run of its own is a question to the customer).
 */
export const CAT_PACE_MAX = 3;
/** The pace of the pet's walk at most; faster, it gallops. */
export const PET_WALK_MAX = 2.2;
/**
 * The pace of the pet's gallop at most. At the heroine's run (5.4 m/s) the fawn's gallop would need a pace near 5.2:
 * its legs whirred (the customer on the S22, 2026-11-19). 2.6 was still "jerky" to the customer; it keeps 2.1 - some 4
 * leaps a second -, and its paws slide 0.6 of the way at the top speed, the most allowed (2.0 would slide 0.62). A longer
 * leap was the other way: the clip's stride is set by the model's legs, so only a bigger fawn or a new clip would make
 * it, not a pace.
 */
export const PET_RUN_MAX = 2.1;
/** It gallops when its walk would need a pace above PET_WALK_MAX, and walks again only below this: no flicker between. */
export const PET_WALK_BACK = 1.6;
/** A pace below this looks like standing still while the body moves: the steps go on at least this fast. */
export const PACE_MIN = 0.5;

/**
 * A pace that follows its target smoothly in time (about a fifth of a second), so that a push or a short frame does not
 * jerk the legs; a new clip starts at its target.
 */
export function paceFollower() {
  let p = 0;
  return {
    /** The pace of this frame on the way to `target`. */
    next(target: number, dt: number) { p += (target - p) * Math.min(1, dt * 5); return p; },
    /** A new clip: its pace starts at its target. */
    reset(target: number) { p = target; return p; },
  };
}

/** The pace of a clip of the given speed over the ground for a body moving at `speed`, held to [PACE_MIN, max]. */
export function pace(speed: number, ground: number, max = Infinity): number {
  return clamp(speed / ground, PACE_MIN, max);
}

/**
 * The speed a character really moves at, from where it is frame by frame (collisions and pushes included), smoothed
 * over about a tenth of a second so that one short frame does not jerk the pace.
 */
export function speedometer(): (x: number, z: number, dt: number) => number {
  let px = NaN, pz = NaN, v = 0;
  return (x, z, dt) => {
    if (dt > 0 && Number.isFinite(px)) {
      const raw = Math.hypot(x - px, z - pz) / dt;
      v += (raw - v) * Math.min(1, dt * 10);
    }
    px = x; pz = z;
    return v;
  };
}
