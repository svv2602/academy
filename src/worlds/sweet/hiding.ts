/**
 * What hides the mysterious stars of the Sweet Land (PLAY-24, src/game/mystery-hide.ts): a mound of whipped cream in
 * front of each hidden place (./layout.ts MYSTERY_ROCKS) - the cream hill of the rim, smaller and taller. Pure: the
 * mounds are drawn of these very numbers (./scenery.ts), and the test of the places (./mystery.test.ts) looks from the
 * ways through them.
 */
import type { HideWorld, Occluder } from '../../game/mystery-hide';
import { MYSTERY_ROCK, MYSTERY_ROCKS, PATHS } from './layout';
import { height } from './terrain';

/** m: a mound's radius and height (the hill's half sphere is 5 m round and 4 m high). */
export const MOUND = { r: 5 * MYSTERY_ROCK.w, h: 4 * MYSTERY_ROCK.h } as const;
/**
 * What surely hides, of a mound: four short round bodies inside its half sphere, each within its section at its top
 * (0.9 of the circle there: the hill is drawn of 10 sides round and 6 up).
 */
export const moundOccluders = (p: { x: number; z: number }): Occluder[] => [0.5, 0.7, 0.85, 0.93]
  .map((t) => ({ x: p.x, z: p.z, r: 0.9 * MOUND.r * Math.sqrt(1 - t * t), top: 0.97 * t * MOUND.h }));
/** The Sweet Land as the check of a hidden star sees it: its ways, its ground, its mounds. */
export const HIDE: HideWorld = { paths: PATHS, height, occluders: MYSTERY_ROCKS.flatMap(moundOccluders) };
/** m: she is held this far from a mound's middle. */
export const MOUND_WALL = 0.95 * MOUND.r;
