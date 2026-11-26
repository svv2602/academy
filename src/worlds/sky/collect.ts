import type { CollectDef, CollectItem } from '../../game/collections';
import { DEFAULT_SCALE, ISLANDS, SCALE, type ZoneId } from './layout';

/**
 * The collections of the Sky Islands (PLAY-25, the lead's word of 2026-11-26): little clouds and balloons, six of each,
 * on the islands 3-7 m off the ways - seen from a way, a few steps aside to take. A little cloud hangs low over the
 * ground, a bunch of balloons floats on its string at her chest. Most lie on the castle island, the biggest, where every
 * bridge starts; the rest on the dragon island, the windmills', the pier and the stargazer's - none on the far islet
 * (the airship's) or the nooks of the secrets. Their places are checked by ./collect.test.ts: off the ways and the
 * edges, the zones, the landmarks, the secrets, the characters, Pushok's spot, the windmills and the trees.
 */

/** The places below are metres from an island's middle at the map's chosen stretch (./layout.ts DEFAULT_SCALE): at another they stretch with it. */
const S = SCALE / DEFAULT_SCALE;
const on = (isle: ZoneId, dx: number, dz: number) => ({ x: ISLANDS[isle].x + dx * S, z: ISLANDS[isle].z + dz * S });
/** A little cloud: low over the ground, she walks into it. */
const cloud = (isle: ZoneId, dx: number, dz: number): CollectItem => ({ kind: 'cloudlet', way: 'run', ...on(isle, dx, dz), y: 0.4 });
/** A bunch of balloons: its middle at her chest, its string down to the ground; she walks into it. */
const balloon = (isle: ZoneId, dx: number, dz: number): CollectItem => ({ kind: 'balloon', way: 'run', ...on(isle, dx, dz), y: 1 });

/** The 12 finds; their order is their number in the save (ws.found): only ever added to at the end. */
export const COLLECT: CollectDef = {
  items: [
    // little clouds: on the castle island (two south-west, one north-east), on the dragon island (two), on the
    // stargazer's west of the tower
    cloud('castle', -3, 6), cloud('castle', -8, 5), cloud('castle', 10, -4),
    cloud('dragon', 3, -7), cloud('dragon', 11, -3), cloud('observatory', -6, -3),
    // balloons: on the castle island by the ways to the pier and to the windmills (three), on the windmills' island,
    // the pier and the stargazer's
    balloon('castle', -4, 11), balloon('castle', 12, 3), balloon('castle', 7, 3),
    balloon('mills', -9, 3), balloon('pier', 4, -7), balloon('observatory', 5, 5),
  ],
};

/**
 * The places of the find of the day (PLAY-26, src/game/daily-find.ts): one of them a day, off the ways as the finds -
 * by every bridge's end and two on the pier, 6 m from every find and 12 m apart (./collect.test.ts).
 */
export const DAILY_PLACES: readonly { x: number; z: number }[] = [
  on('castle', 4, -8), on('dragon', 8, 7), on('mills', -9, -6), on('pier', -5, -6), on('pier', 6, 1), on('observatory', -3, 9),
];
