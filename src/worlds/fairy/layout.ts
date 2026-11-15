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
