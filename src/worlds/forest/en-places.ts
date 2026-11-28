/**
 * The places of Pip's command in the forest (LEARN-23, src/game/worldtasks/en-go.ts): "Find a big mushroom!". Each lies
 * 15-25 m from where Pip gives his commands, clear of the residents (./en-places.test.ts).
 *
 * The forest's big mushrooms were the gnomes' houses, 70 m from the central glade where Pip sits - no walk for a
 * command. So three stand round the glade for it: the village's mushroom without a door or a window - north-east of the
 * glade by the way to the cave, south-east of it, and south-west of it by the way to the Oak. None stands west of the
 * glade: the look from the glade to the village is the heaviest of the forest (111 draw calls of the 112 of TECH-06),
 * and nothing of these is in it. Each is a mesh of its own, so the frame draws only those she looks at, and only while
 * she is near.
 */
import type { EnPlace } from '../../game/worldtasks/en-go';
import { HUB_ARCH, ZONES } from './layout';

/** Where Pip gives his commands here: his branch by the arch of the hub, in the middle of the central glade. */
export const EN_GIVEN = { x: ZONES.center.x, z: ZONES.center.z } as const;
/**
 * Pip on a stone beside the arch (src/game/pip-world.ts), not in its passage: PIP_ASIDE m to its side, PIP_AHEAD m out
 * toward where she comes out of it, facing her as she comes.
 */
const PIP_ASIDE = 3.2, PIP_AHEAD = 1;
export const PIP_PLACE = {
  x: EN_GIVEN.x + Math.cos(HUB_ARCH.facing) * PIP_ASIDE + Math.sin(HUB_ARCH.facing) * PIP_AHEAD,
  z: EN_GIVEN.z - Math.sin(HUB_ARCH.facing) * PIP_ASIDE + Math.cos(HUB_ARCH.facing) * PIP_AHEAD,
  heading: HUB_ARCH.facing,
} as const;

/** Where the big mushrooms stand; `rot` turns each a little so no two look the same from the glade. */
export const BIG_MUSHROOMS: readonly { readonly x: number; readonly z: number; readonly rot: number }[] = [
  { x: 44, z: 6, rot: 0.4 }, { x: 44, z: -20, rot: 2.1 }, { x: 26, z: -26, rot: 4.3 },
];
/** A big mushroom: how tall, the radius of its stem (./village.ts mushroomHouse draws it: its cap is 1.95 of that). */
export const BIG_MUSHROOM = { h: 2.8, r: 0.7 } as const;
/** She is held this far from the middle of its stem, m. */
export const BIG_MUSHROOM_WALL = BIG_MUSHROOM.r + 0.3;
/**
 * A mushroom is drawn while she is within this of it, m: from the glade every one of them is, from the village none.
 * Its shadow is cast only while she is this near to it.
 */
export const BIG_MUSHROOM_SHOW = 26, BIG_MUSHROOM_SHADOW = 12;

export const EN_PLACES: readonly EnPlace[] = BIG_MUSHROOMS.map((p): EnPlace => ({ x: p.x, z: p.z, kind: 'mushroom', word: 'mushroom' }));

/** Whether mushroom `i` is drawn, and whether it casts its shadow, with her at (x, z). */
export function bigMushroomAt(i: number, x: number, z: number): { shown: boolean; shadow: boolean } {
  const d = Math.hypot(x - BIG_MUSHROOMS[i].x, z - BIG_MUSHROOMS[i].z);
  return { shown: d < BIG_MUSHROOM_SHOW, shadow: d < BIG_MUSHROOM_SHADOW };
}
