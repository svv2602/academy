import type { CollectDef, CollectItem } from '../../game/collections';
import { DEFAULT_SCALE, SCALE } from './layout';

/**
 * The collections of the Enchanted Forest (PLAY-25, the customer's word of 2026-11-22, «А»): spruce cones and
 * bilberries, six of each, and the nine pieces of its picture (PLAY-29), lying on the moss 3-7 m off the paths - seen from the path, a few steps aside to take. Their
 * places are checked by ./collect.test.ts: off the paths, the stream, the zones, the secrets, the maze and the trees.
 * The trades of the forest's characters (PLAY-28) ask for them.
 */

/** The places below are the map's metres at its chosen stretch (./layout.ts DEFAULT_SCALE): at another they stretch with it. */
const S = SCALE / DEFAULT_SCALE;
/** On the moss: she walks into it. */
const lies = (kind: 'cone' | 'berry', x: number, z: number): CollectItem => ({ kind, way: 'run', x: x * S, z: z * S, y: 0.2 });

/** The 12 finds; their order is their number in the save (ws.found): only ever added to at the end. */
export const COLLECT: CollectDef = {
  items: [
    // cones: by the ways to the Oak, to the Owl, to the grove, to the Ash and to the maze
    lies('cone', 37.1, -19), lies('cone', 30.1, -32.9), lies('cone', -41.6, -36.7), lies('cone', -33.7, 38.3),
    lies('cone', 41.9, 39.7), lies('cone', -33.4, -3.2),
    // bilberries: by the ways from the central glade to the village and to the stream, and on the way to the Oak
    lies('berry', 9.7, -5.7), lies('berry', -9.8, -15.6), lies('berry', 38.6, 2.9), lies('berry', 40.3, 30.3),
    lies('berry', 28.8, -16.7), lies('berry', -42.4, -25.8),
    // the pieces of the picture (PLAY-29, the customer's word of 2026-11-26): nine over the whole forest, by its ways, set
    // on the easel in the village (./layout.ts EASEL); their order is their cell of the frame, row by row
    ...[[-0.5, -4.4], [-27.8, 58], [26.8, 45], [41.1, -40.8], [-34.3, -25.2], [30.7, 9.9], [-30.4, 6], [2.1, 60.6], [21.6, -14.8]]
      .map(([x, z]): CollectItem => ({ kind: 'piece', way: 'run', x: x * S, z: z * S, y: 0.35 })),
  ],
  // the heroine at the arch into the sleeping forest: the beginning of its story, nothing told away
  picture: { image: 'story/forest/w2_intro_3', cols: 3, rows: 3 },
};

/**
 * The places of the find of the day (PLAY-26, src/game/daily-find.ts): one of them a day, off the paths as the finds,
 * 6 m from every find and 12 m apart (./collect.test.ts).
 */
export const DAILY_PLACES: readonly { x: number; z: number }[] = [
  [37.9, -29.3], [13.8, -13.2], [-10.2, -6.1], [-22.2, -6.6], [-32.3, -35], [-43, 40.2], [39.6, 11.3], [32.3, 31.2],
].map(([x, z]) => ({ x: x * S, z: z * S }));
