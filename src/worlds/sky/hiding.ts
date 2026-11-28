/**
 * What hides the mysterious stars of the sky (PLAY-24, src/game/mystery-hide.ts): a cloud bush in front of each of the
 * first hidden places (./layout.ts MYSTERY_ROCKS) - the islands' bush, larger - and the buildings of the islands: the
 * castle's walls, the observatory's tower, the windmills' towers. Pure: the bushes are drawn of these very numbers
 * (./scenery.ts), and the test of the places (./mystery.test.ts) looks from the ways through them.
 */
import type { HideWorld, Occluder } from '../../game/mystery-hide';
import { CASTLE, MILL, MILLS, MYSTERY_ROCK, MYSTERY_ROCKS, OBSERVATORY, PATHS } from './layout';
import { height } from './terrain';

/**
 * What surely hides, of a cloud bush: the islands' bush is an icosahedron of 0.7 m scaled (1.2, 0.8, 1.2) with its
 * middle 0.45 over its foot; inside it the ellipsoid of its inscribed sphere - two short round bodies within its
 * section at its middle and halfway up.
 */
export const bushOccluders = (p: { x: number; z: number }): Occluder[] => [
  { x: p.x, z: p.z, r: 0.95 * 0.667 * MYSTERY_ROCK.w, top: 0.45 * MYSTERY_ROCK.h },
  { x: p.x, z: p.z, r: 0.95 * 0.578 * MYSTERY_ROCK.w, top: 0.672 * MYSTERY_ROCK.h },
];
/** The buildings: the castle's walls (a box 1.6 r across, 4.5 m high), the observatory's tower, the windmills' towers. */
export const BUILDINGS: readonly Occluder[] = [
  { x: CASTLE.x, z: CASTLE.z, r: CASTLE.r * 0.8 * 0.95, top: 4.4 },
  { x: OBSERVATORY.x, z: OBSERVATORY.z, r: OBSERVATORY.r * 0.92, top: 12 },
  ...MILLS.map((m) => ({ x: m.x, z: m.z, r: MILL.towerR * 0.9, top: MILL.towerH - 0.5 })),
];
/** The sky as the check of a hidden star sees it: its ways, its islands, its bushes and buildings. */
export const HIDE: HideWorld = { paths: PATHS, height, occluders: [...MYSTERY_ROCKS.flatMap(bushOccluders), ...BUILDINGS] };
/** m: she is held this far from a cloud bush's middle (its widest is 0.84 of its width: her own radius makes up the rest). */
export const BUSH_WALL = 0.75 * MYSTERY_ROCK.w;
