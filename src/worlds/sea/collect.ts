import type { CollectDef, CollectItem } from '../../game/collections';
import { DEFAULT_SCALE, SCALE } from './layout';

/**
 * The collections of the sea (PLAY-25, the customer's word of 2026-11-23): spiral shells and coral twigs, six of each,
 * lying on the sand 3-7 m off the ways - seen from a way, a few strokes aside to take; she swims over them and takes them
 * (src/game/collections.ts floorOf). Their places are checked by ./collect.test.ts: off the ways, the zones, the
 * landmarks, the secrets and the corals, kelp and rocks of the floor.
 */

/** The places below are the map's metres at its chosen stretch (./layout.ts DEFAULT_SCALE): at another they stretch with it. */
const S = SCALE / DEFAULT_SCALE;
/** On the sand: she swims over it. */
const lies = (kind: 'shell' | 'coral', x: number, z: number): CollectItem => ({ kind, way: 'run', x: x * S, z: z * S, y: 0.2 });

/** The 12 finds; their order is their number in the save (ws.found): only ever added to at the end. */
export const COLLECT: CollectDef = {
  items: [
    // shells: by the ways reef - garden, garden - gate, grotto - gate and square - grotto
    lies('shell', -40.4, 2.1), lies('shell', -29.8, 15.8), lies('shell', -14.8, 38.5), lies('shell', 12.7, 30.8),
    lies('shell', 39.2, 17.5), lies('shell', 28.1, 0.8),
    // coral twigs: by the ways reef - trench and square - ship, and by the current
    lies('coral', -33.9, -20.3), lies('coral', -40.8, -40.7), lies('coral', 26.7, -27.1), lies('coral', 40.4, -45.9),
    lies('coral', -7.7, -17.8), lies('coral', 10.4, -16.3),
  ],
};

/**
 * The places of the find of the day (PLAY-26, src/game/daily-find.ts): one of them a day, off the ways as the finds, one
 * in every part of the map, 6 m from every find and 12 m apart (./collect.test.ts).
 */
export const DAILY_PLACES: readonly { x: number; z: number }[] = [
  [37.9, -34.1], [-32.5, -34.1], [22.3, -14.6], [-12.5, -8.3], [-40.4, 12.3], [30, 12.3], [-6.7, 31.6], [24.1, 25.4],
].map(([x, z]) => ({ x: x * S, z: z * S }));
