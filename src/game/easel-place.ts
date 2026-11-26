/**
 * Where a world's easel stands (PLAY-29, src/game/easel.ts): the data alone, read by the description of a world
 * (src/game/describe.ts) without the easel's look.
 */

/** Where a world's easel stands: its middle, and the way its picture faces (radians from +z, as a character's heading). */
export interface EaselDef { readonly x: number; readonly z: number; readonly facing: number }

/** m: how far in front of the easel she stands to look at it (where its action spot is). */
export const EASEL_STAND = 1.4;

/** Where she stands in front of the easel `e`. */
export const easelStand = (e: EaselDef) => ({ x: e.x + Math.sin(e.facing) * EASEL_STAND, z: e.z + Math.cos(e.facing) * EASEL_STAND });
