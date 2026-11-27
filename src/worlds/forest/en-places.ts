/**
 * The places of Pip's command in the forest (LEARN-23, src/game/worldtasks/en-go.ts): "Find a big mushroom!". Each lies
 * 15-25 m from where Pip gives his commands, clear of the residents (./en-places.test.ts).
 *
 * The forest's big mushrooms were the gnomes' houses, 70 m from the central glade where Pip sits - no walk for a
 * command. So three stand round the glade for it: the village's mushroom without a door or a window, west of the glade,
 * south-west of it by the way to the Oak, and north-east of it by the way to the cave. Away from the village on
 * purpose: its frame is the closest to the budget of draw calls (TECH-06), and these are drawn only near the glade.
 */
import type { EnPlace } from '../../game/worldtasks/en-go';
import { ZONES } from './layout';

/** Where Pip gives his commands here: his branch by the arch of the hub, in the middle of the central glade. */
export const EN_GIVEN = { x: ZONES.center.x, z: ZONES.center.z } as const;

/** Where the big mushrooms stand; `rot` turns each a little so no two look the same from the glade. */
export const BIG_MUSHROOMS: readonly { readonly x: number; readonly z: number; readonly rot: number }[] = [
  { x: 14, z: 0, rot: 0.4 }, { x: 26, z: -26, rot: 2.1 }, { x: 44, z: 6, rot: 4.3 },
];
/** A big mushroom: how tall, the radius of its stem (./village.ts mushroomHouse draws it: its cap is 1.95 of that). */
export const BIG_MUSHROOM = { h: 2.8, r: 0.7 } as const;
/** She is held this far from the middle of its stem, m. */
export const BIG_MUSHROOM_WALL = BIG_MUSHROOM.r + 0.3;
/**
 * They are drawn while she is within this of the middle of the glade, m: at the glade, and on the whole way to each of
 * them and a little past it - nowhere near the village. Their shadow is cast only while she is this near to one of them.
 */
export const BIG_MUSHROOMS_SHOW = 30, BIG_MUSHROOMS_SHADOW = 12;

export const EN_PLACES: readonly EnPlace[] = BIG_MUSHROOMS.map((p): EnPlace => ({ x: p.x, z: p.z, kind: 'mushroom', word: 'mushroom' }));

/** Whether the mushrooms are drawn, and whether they cast their shadow, with her at (x, z). */
export function bigMushroomsAt(x: number, z: number): { shown: boolean; shadow: boolean } {
  const shown = Math.hypot(x - EN_GIVEN.x, z - EN_GIVEN.z) < BIG_MUSHROOMS_SHOW;
  return { shown, shadow: shown && BIG_MUSHROOMS.some((m) => Math.hypot(x - m.x, z - m.z) < BIG_MUSHROOMS_SHADOW) };
}
