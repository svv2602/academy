/**
 * What hides the mysterious stars of the forest (PLAY-24, src/game/mystery-hide.ts): a mossy boulder in front of each
 * hidden place (./layout.ts MYSTERY_ROCKS) - from the nearest point of the path the star is behind it, and coming near,
 * it is seen. Pure: the boulders are baked of these very numbers (./decor.ts), and the test of the places
 * (./mystery.test.ts) looks from the paths through them.
 */
import type { HideWorld, Occluder } from '../../game/mystery-hide';
import { MYSTERY_ROCK, MYSTERY_ROCKS, PATHS } from './layout';
import { height } from './terrain';

/** What surely hides, of a boulder: most of its radius, and its top short of the highest point (a face, not a vertex). */
export const rockOccluder = (p: { x: number; z: number }): Occluder => ({ x: p.x, z: p.z, r: 0.8 * MYSTERY_ROCK.r, top: 1.3 * MYSTERY_ROCK.h });
/** The forest as the check of a hidden star sees it: its paths, its relief, its boulders. */
export const HIDE: HideWorld = { paths: PATHS, height, occluders: MYSTERY_ROCKS.map(rockOccluder) };
/** m: she is held this far from a boulder's middle. */
export const ROCK_WALL = MYSTERY_ROCK.r * 0.9;
