/**
 * The map of the Sweet Land, the grey build (WORLD-12; the map of docs/worlds/world-4.md, ≈90 × 90 m). Every place is
 * given at the size of the document and multiplied by SCALE: the whole map is stretched by one number, the sizes of
 * things (a character, the cake palace, the mill) stay real. SCALE comes from `?scale=` (the grey build only: the Sweet
 * Land is listed in the registry in `--mode grey`, src/worlds/index.ts), DEFAULT_SCALE without it - the stretch the
 * customer chose for the forest and the sea (2026-11-20), taken for this world by the lead's decision of 2026-11-22.
 *
 *      [Candy garden - Polosatik]                    [Cake palace - the shrine of the Ruby]
 *                   |                                              |
 *      [Gingerbread town - Imbir] ------ caramel path ------ [Square of the carousel - Pastila, the way in]
 *                   |                                              |
 *      [Marmalade market - Tyanuchka]                [Chocolate river and the mill - Kakao]
 *                   \__________ [Shape bridge over the river] ____________/
 *
 * x to the east, z to the south (the top of the drawing is -z, as in the first world). The chocolate river runs in the
 * bottom of the map from past its south edge up between the market and the mill to the mill's pond: it is crossed only
 * by the shape bridge (./terrain.ts keeps her out of it everywhere else).
 */

/** The stretch of the map (the forest's and the sea's, chosen by the customer 2026-11-20; this world's by the lead 2026-11-22). */
export const DEFAULT_SCALE = 1.6;
/** The stretch of the map asked for in the address (`?scale=1`), kept within 0.5-3; DEFAULT_SCALE without it or outside a page. */
export function readScale(search: string | undefined): number {
  const raw = new URLSearchParams(search ?? '').get('scale'), v = Number(raw);
  return raw !== null && Number.isFinite(v) && v > 0 ? Math.min(3, Math.max(0.5, v)) : DEFAULT_SCALE;
}
export const SCALE = readScale(typeof location === 'undefined' ? undefined : location.search);

export interface Place { x: number; z: number }
/** A place of the drawing at the scale of the build. */
const at = (x: number, z: number): Place => ({ x: x * SCALE, z: z * SCALE });

/** m: the half of the map (the walkable part is a circle of this radius; whipped-cream hills and lollipops stand past it). */
export const HALF = 45 * SCALE;
/** m: a walker stays this far inside HALF. */
export const EDGE = 2;

/** The zones of the map: their middles (docs/worlds/world-4.md, the drawing's units times SCALE). */
export const ZONES = {
  square: at(24, -2),      // the square of the carousel: the way in, Pastila (pink carousel)
  palace: at(22, -30),     // the cake palace: the shrine of the Ruby of joy, where the finale is
  garden: at(-22, -30),    // the candy garden: Polosatik (red-white stripes)
  town: at(-24, -2),       // the gingerbread town: Imbir (brown gingerbread, white icing)
  market: at(-22, 22),     // the marmalade market with the scales: Tyanuchka (green and yellow marmalade)
  mill: at(22, 22),        // the chocolate river and the mill: Kakao (chocolate and waffles)
  bridge: at(0, 28),       // the shape bridge over the river (WORLD-20 later; walkable as it is in step 1)
} as const;
export type ZoneId = keyof typeof ZONES;

/** Where she appears: on the square, south-east of its middle, facing -z (every entry's heading) - into the world, the palace's candle ahead. */
export const SPAWN = at(26, 3);

/** The ways of the map, each a line of points from one zone to another (the drawing's lines). */
export const PATHS: readonly (readonly Place[])[] = [
  [ZONES.town, at(0, -4), ZONES.square],              // the caramel path
  [ZONES.town, at(-23, -16), ZONES.garden],
  [ZONES.square, at(23, -16), ZONES.palace],
  [ZONES.town, at(-23, 10), ZONES.market],
  [ZONES.square, at(23, 10), ZONES.mill],
  [ZONES.market, at(-8, 28), ZONES.bridge],           // east to the bridge on the market's bank
  [ZONES.bridge, at(8, 28), ZONES.mill],              // and on from it on the mill's bank
];

/**
 * The chocolate river: its middle line, from past the south edge of the map north through the bridge (x = 0 in the
 * drawing: the bridge lies across it, east to west), then east to the mill's pond. The market is on its west bank, the
 * mill on its east one.
 */
export const RIVER: readonly Place[] = [at(0, 56), at(0, 20), at(14, 16)];
/** m: the half width of the river (its colliders keep her this far from its middle line, and her own radius more). */
export const RIVER_HALF = 2.4;
/** The shape bridge: across the river at its zone, along the line perpendicular to the river there. */
export const BRIDGE = { x: ZONES.bridge.x, z: ZONES.bridge.z, yaw: Math.PI / 2, len: (RIVER_HALF + 2) * 2, w: 3.2 };

/** The cake palace: three tiers and a candle tower behind the shrine (the zone's middle, where the finale is), seen from everywhere (WORLD-10). */
export const CAKE = { x: ZONES.palace.x, z: ZONES.palace.z - 9, tiers: [{ r: 7, h: 3 }, { r: 5, h: 2.6 }, { r: 3.2, h: 2.2 }], candleR: 0.7, top: 18 } as const;
/** The foot of the cake where the rubies gather and the candle is lit: the finale (WORLD-08, docs/worlds/world-4.md). */
export const SHRINE = { x: ZONES.palace.x, z: ZONES.palace.z };
/** The mill of Kakao on the river's bank: its tower, its wings ≈12 m across turning by code, its millstone by the door. */
export const MILL = { x: ZONES.mill.x + 7, z: ZONES.mill.z - 2, towerR: 2.6, towerH: 8, roofH: 3, wingR: 6 } as const;
/** The millstone before the mill's door, on its south side: ruby 4 lies in it (WORLD-08; the action opens it - the grey build's stand-in). */
export const MILLSTONE = { x: MILL.x, z: MILL.z + MILL.towerR + 2 };
/** The carousel: east of the square's middle, out of the ways that meet there. */
export const CAROUSEL = { x: ZONES.square.x + 9, z: ZONES.square.z - 1, r: 3.6, top: 6.5 } as const;
/** Imbir's gingerbread house, the one that fell apart (WORLD-21 later assembles it): ruby 2 lies inside, at its door. */
export const HOUSE = { x: ZONES.town.x - 6, z: ZONES.town.z + 5, w: 4, d: 4, h: 3.2 } as const;
/** The door of the house, on its east side toward Imbir: the action there takes ruby 2 (the grey build's stand-in). */
export const HOUSE_DOOR = { x: HOUSE.x + HOUSE.w / 2 + 0.9, z: HOUSE.z };
/**
 * The arch back to the Great Tree on the square (./hub-way.ts): south-east of its middle, by the spawn and out of the
 * ways - the camera behind her as she comes out of it stands on the square.
 */
export const TREE_ARCH = { x: ZONES.square.x + 8, z: ZONES.square.z + 12 };

/**
 * What of each zone is seen from afar (WORLD-10, the landmark of a target): where it stands and how high its top is, m.
 * The square - its carousel; the palace - the cake's candle tower; the garden - its tallest lollipop; the town - the
 * gingerbread tower; the market - the scales on their post; the mill - its tower and roof (its wings turn over it); the bridge - a post of it on the market's bank.
 */
export const LANDMARKS: Record<ZoneId, Place & { top: number }> = {
  square: { x: CAROUSEL.x, z: CAROUSEL.z, top: CAROUSEL.top },
  palace: { x: CAKE.x, z: CAKE.z, top: CAKE.top },
  garden: { x: ZONES.garden.x - 4, z: ZONES.garden.z - 3, top: 7 },
  town: { x: ZONES.town.x - 4, z: ZONES.town.z - 5, top: 9 },
  market: { x: ZONES.market.x - 4, z: ZONES.market.z + 3, top: 6 },
  mill: { x: MILL.x, z: MILL.z, top: MILL.towerH + MILL.roofH },   // the top of its roof; the wings turn higher, beside it
  // a post of the bridge on the market's bank, north side: the middle of the deck is open, a ray there meets nothing
  bridge: { x: BRIDGE.x - Math.sin(BRIDGE.yaw) * (BRIDGE.len / 2 - 0.2) - Math.cos(BRIDGE.yaw) * (BRIDGE.w / 2), z: BRIDGE.z - Math.cos(BRIDGE.yaw) * (BRIDGE.len / 2 - 0.2) + Math.sin(BRIDGE.yaw) * (BRIDGE.w / 2), top: 3.2 },
};
/** The order she walks through the zones in the measurement of WORLD-12: every way of the map once, the palace last. */
export const ROUTE: readonly ZoneId[] = ['square', 'town', 'garden', 'town', 'market', 'bridge', 'mill', 'square', 'palace'];

/** The legs of a route: consecutive zones, each pair once (tools/sweet-grey.mjs walks them; tools/forest-grey.mjs has its own copy). */
export function routeLegs(route: readonly ZoneId[]): [ZoneId, ZoneId][] {
  const legs: [ZoneId, ZoneId][] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    if (!legs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) legs.push([a, b]);
  }
  return legs;
}
/** The way of the map from zone `a` to zone `b` (either way round), or null. */
export function pathBetween(a: ZoneId, b: ZoneId): readonly Place[] | null {
  for (const p of PATHS) {
    if (p[0] === ZONES[a] && p[p.length - 1] === ZONES[b]) return p;
    if (p[0] === ZONES[b] && p[p.length - 1] === ZONES[a]) return [...p].reverse();
  }
  return null;
}
