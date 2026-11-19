/**
 * Layout of the Fairy Kingdom slice, in metres (ARCH-06/10). +Z is "towards the camera" at spawn. The world's files
 * take their places from here; ./terrain.ts builds the relief around them and re-exports them for now.
 */
export const WORLD_R = 74;
export const SPAWN = { x: 0, z: 14 };
export const POND = { x: 15, z: -19, r: 9.5 };
export const CASTLE = { x: -8, z: -60 };
export const UNICORN = { x: 5.2, z: -11.5 };
export const PATCH = { x: -1.5, z: -15.5 };   // flower patch where the task butterflies fly
export const CRYSTAL = { x: 2.2, z: -9.2 };
export const CHEST = { x: -31, z: 6 };        // optional secret behind the birches
export const SHOP_SIGN = { x: 4, z: 9.6 };   // the shop's signboard at the spawn meadow, right of the path (R10, R19)
/** The arch to the Great Tree (./tree-way.ts): at the end of the path behind the spawn, facing the valley (-z). */
export const TREE_WAY = { x: 0, z: 21.5, facing: Math.PI };
// The two secrets besides the chest (PLAY-10): a glade hidden behind a waterfall at the valley's south-east rim - its
// curtain faces the valley, the rocks around close it - and the fairy house by the well, whose door leads into a room.
export const GLADE = { x: 44, z: -40, r: 4.2 };
export const HOUSE = { x: -9.5, z: 2.5, rot: 1.2 };
/**
 * The places of the mysterious stars (PLAY-24, src/game/mystery.ts, ten of them a day), off the path, the pond and the
 * characters' places (./mystery.test.ts). Half of them are hidden: from the nearest point of the path the star is behind
 * the fairy house, the rocks of the glade or a boulder (./hiding.ts) - seen only on coming near. The other
 * half stand in sight but aside: by the trees of the forest ring, where she has to walk.
 */
export const MYSTERY_HIDDEN: readonly { x: number; z: number }[] = [
  { x: -14.3, z: 1.0 }, { x: 31.5, z: 22.5 }, { x: 51.1, z: -37.1 }, { x: -24, z: -60 }, { x: -48, z: -28.5 }, { x: -37.5, z: 24 },
  { x: 33, z: -55.5 }, { x: -22.5, z: -27 }, { x: 0, z: -43.5 }, { x: 51, z: -10.5 }, { x: -18, z: 21 }, { x: 28.5, z: -21 },
];
export const MYSTERY_OPEN: readonly { x: number; z: number }[] = [
  { x: 43.5, z: 43.5 }, { x: -28.5, z: 54 }, { x: -64.5, z: 7.5 }, { x: 64.5, z: 4.5 }, { x: 9, z: 61.5 }, { x: 19.5, z: -1.5 },
  { x: 1.5, z: 30 }, { x: 7.5, z: -64.5 }, { x: -37.5, z: 3 }, { x: -39, z: -46.5 }, { x: 28.5, z: 55.5 }, { x: 61.5, z: 21 },
];
export const MYSTERY_SPOTS: readonly { x: number; z: number }[] = [...MYSTERY_HIDDEN, ...MYSTERY_OPEN];
/** The room of the house: a closed floor far beyond the valley (no ground there), walked like the meadow. */
export const ROOM = { x: 0, z: 215, half: 4.2, y: 0 };
