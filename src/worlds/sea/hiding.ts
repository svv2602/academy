/**
 * What hides the mysterious stars of the sea (PLAY-24, src/game/mystery-hide.ts): a spire of rock in front of each
 * hidden place (./layout.ts MYSTERY_ROCKS) - the sea's own rock (./life.ts rockGeometry), stretched up. Pure: the spires
 * are drawn of these very numbers (./scenery.ts), and the test of the places (./mystery.test.ts) looks from the ways
 * through them.
 */
import type { HideWorld, Occluder } from '../../game/mystery-hide';
import { MYSTERY_ROCK, MYSTERY_ROCKS, PATHS } from './layout';
import { height } from './terrain';

/**
 * What surely hides, of a spire: the rock is a pointed lump - two short round bodies inside it, each a little within
 * its section at its top (measured of the rock: 0.63 of its width across at 0.6 of its height, 0.49 at 0.7).
 */
export const spireOccluders = (p: { x: number; z: number }): Occluder[] => [
  { x: p.x, z: p.z, r: 0.55 * MYSTERY_ROCK.w, top: 0.6 * MYSTERY_ROCK.h },
  { x: p.x, z: p.z, r: 0.4 * MYSTERY_ROCK.w, top: 0.7 * MYSTERY_ROCK.h },
];
/** The sea as the check of a hidden star sees it: its ways, its floor, its spires. */
export const HIDE: HideWorld = { paths: PATHS, height, occluders: MYSTERY_ROCKS.flatMap(spireOccluders) };
/** m: she is held this far from a spire's middle (its foot reaches 0.71 of its width). */
export const SPIRE_WALL = 0.72 * MYSTERY_ROCK.w;
