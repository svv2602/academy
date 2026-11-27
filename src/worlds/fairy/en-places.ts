/**
 * The places of Pip's commands in the valley of the fairies (LEARN-23, src/game/worldtasks/en-go.ts): "Find a red
 * flower!" and "Go to the little house!". Each lies 15-25 m from where Pip gives his commands, clear of the residents
 * (./en-places.test.ts).
 *
 * The valley had no red flower: its meadow is pink and yellow, scattered by chance all over it - "find a flower" would
 * be anywhere. So the red ones are planted for the command, three little beds of them, taller than the meadow's flowers
 * and the only red in it (./scenery.ts draws them with the valley's own flower, its petals turned red).
 */
import type { Placement } from '../../core/instancing';
import type { EnPlace } from '../../game/worldtasks/en-go';
import { HOUSE } from './layout';

/** Where Pip gives his commands here: his feeder by the path between the spawn meadow and the pond (R14). */
export const EN_GIVEN = { x: 6, z: 2 } as const;

/**
 * The middles of the beds of red flowers: two behind the spawn meadow - west of it and by the way to the Great Tree -
 * and one across the path from the unicorn's flowers. Off the path, the pond, the trees and everything with a place of
 * its own.
 */
export const RED_BEDS: readonly { readonly x: number; readonly z: number }[] = [{ x: -7, z: 16 }, { x: 7, z: 20 }, { x: -6, z: -10 }];
/** Flowers in a bed, how far from its middle the outermost stands (m), and how tall they grow against the meadow's. */
export const RED_BED = { flowers: 9, r: 1.2, scale: 1.7 } as const;

/**
 * How near to the middle of the fairy's house she has come to it: its wall keeps her 3.2 m out, its door is 4.1 m out
 * (./secrets.ts DOOR_OUT) - at the door, or anywhere by its wall, she is at the house.
 */
export const HOUSE_REACH = 6;

export const EN_PLACES: readonly EnPlace[] = [
  ...RED_BEDS.map((p): EnPlace => ({ x: p.x, z: p.z, kind: 'flower', word: 'flower' })),
  { x: HOUSE.x, z: HOUSE.z, kind: 'house', word: 'house', r: HOUSE_REACH },
];

/**
 * Every red flower of the valley, bed by bed: laid out on a spiral around the middle of its bed (the same on every
 * device - no chance in it), each a little turned and a little taller or shorter than its neighbour.
 */
export function redFlowers(): Placement[] {
  const GOLDEN = 2.399963;
  return RED_BEDS.flatMap((bed, b) => Array.from({ length: RED_BED.flowers }, (_, i) => {
    const a = i * GOLDEN + b * 1.1, r = RED_BED.r * Math.sqrt(i / (RED_BED.flowers - 1));
    return { x: bed.x + Math.cos(a) * r, z: bed.z + Math.sin(a) * r, s: RED_BED.scale * (0.9 + ((i * 7 + b * 3) % 5) * 0.05), rot: a * 1.7 };
  }));
}
