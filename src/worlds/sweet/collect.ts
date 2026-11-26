import type { CollectDef, CollectItem } from '../../game/collections';
import { DEFAULT_SCALE, SCALE } from './layout';

/**
 * The collections of the Sweet Land (PLAY-25, the lead's word of 2026-11-25): swirl lollipops and jelly sweets, six of
 * each, lying on the pink ground 4-6 m off the ways - seen from a way, a few steps aside to take. The lollipops lie by
 * the northern ways (the caramel path, square - palace, town - garden), the jelly sweets by the southern ones, round
 * the marmalade market and the river (town - market, market - bridge - mill, square - mill). Their places are checked
 * by ./collect.test.ts: off the ways and the river, the zones, the landmarks, the secrets, the pet's spot and the
 * sweets, houses and trees of the land.
 */

/** The places below are the map's metres at its chosen stretch (./layout.ts DEFAULT_SCALE): at another they stretch with it. */
const S = SCALE / DEFAULT_SCALE;
/** On the ground: she walks into it. */
const lies = (kind: 'lollipop' | 'marmalade', x: number, z: number): CollectItem => ({ kind, way: 'run', x: x * S, z: z * S, y: 0.2 });

/** The 12 finds; their order is their number in the save (ws.found): only ever added to at the end. */
export const COLLECT: CollectDef = {
  items: [
    // lollipops: by the caramel path (three), the way square - palace (two) and town - garden
    lies('lollipop', -29.8, -8.5), lies('lollipop', 17.6, -0.3), lies('lollipop', -4.4, -10.6),
    lies('lollipop', 40.2, -42.4), lies('lollipop', 42.2, -14), lies('lollipop', -40.2, -42.4),
    // jelly sweets: by the ways town - market (two), market - bridge, bridge - mill (two) and square - mill
    lies('marmalade', -40.8, 23.9), lies('marmalade', -32.8, 8.4), lies('marmalade', -15, 48.9),
    lies('marmalade', 29.8, 42.5), lies('marmalade', 6, 40.2), lies('marmalade', 41.4, 16.4),
    // the pieces of the picture (PLAY-29, the customer's word of 2026-11-26): nine over the whole land, by its ways, set
    // on the easel by the carousel (./layout.ts EASEL); their order is their cell of the frame, row by row
    ...[[33.3, 7.3], [-33, -53.8], [-43.4, 16.4], [-5.7, 41.1], [42.4, -35.6], [-12.2, -12.2], [37.2, 41.1], [-43.4, -21.3], [13.8, -10.9]]
      .map(([x, z]): CollectItem => ({ kind: 'piece', way: 'run', x: x * S, z: z * S, y: 0.35 })),
  ],
  // the land from above with the cake palace, the carousel and the town: the beginning of its story, nothing told away
  picture: { image: 'story/sweet/w4_intro_1', cols: 3, rows: 3 },
};

/**
 * The places of the find of the day (PLAY-26, src/game/daily-find.ts): one of them a day, off the ways as the finds, one
 * by every way of the map, 6 m from every find and 12 m apart (./collect.test.ts).
 */
export const DAILY_PLACES: readonly { x: number; z: number }[] = [
  [-0.6, -1.7], [33.3, -8.2], [31, -41.7], [-41.2, -28.9], [-42, 9.1], [-27.4, 43.6], [12, 49.4], [40.8, 23.9],
].map(([x, z]) => ({ x: x * S, z: z * S }));
