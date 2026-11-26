/**
 * The map of the Sky Islands, the grey build (WORLD-12; the map of docs/worlds/world-5.md, six islands; their middles
 * APART units apart, so that a bridge takes the 15-25 s of the document on foot at the stretch 1.6: 96 m middle to
 * middle, about 18 s - 50 units gave 14 s, the measurement of 2026-11-24). Every place is given at the size of the document and multiplied by SCALE: the whole map is stretched by one
 * number, the sizes of things (a character, the castle, the observatory) stay real. SCALE comes from `?scale=` (the grey
 * build only: the islands are listed in the registry in `--mode grey`, src/worlds/index.ts), DEFAULT_SCALE without it -
 * the stretch the customer chose for the forest and the sea (2026-11-20), as the Sweet Land took it.
 *
 *                        [Stargazer's island - the observatory, the shrine of the Star]
 *                                          |  cloud bridge
 *      [Dragon island] ---- cloud bridge ---- [Cloud castle, the way in] ---- cloud bridge ---- [Windmill island]
 *                                          |  cloud bridge
 *                                [Pier of the airship]    ~~ the airship's route ~~    [Far islet]
 *
 * x to the east, z to the south (the top of the drawing is -z, as in the first world). The islands float over a sea
 * of clouds: she walks on them and on the cloud bridges between them only (./terrain.ts keeps her on them; their edges
 * are closed by cloud rails, the customer's decision 1 a of 2026-11-18). The far islet has no bridge: the airship takes
 * her there from the pier (WORLD-23 later; in step 1 an action at the pier stands in for the flight).
 */

/** The stretch of the map (the forest's and the sea's, chosen by the customer 2026-11-20; the Sweet Land's too). */
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

/** The drawing's units between the middles of two islands a bridge joins. */
export const APART = 60;
/** m: the half of the map: the fog and the sea of clouds reach past it (nobody walks there: the islands keep her). */
export const HALF = (APART + 25) * SCALE;

/** The islands: their middles, their radii (the drawing's units times SCALE) and the height of their tops, m. */
export interface Island extends Place { r: number; top: number }
const island = (x: number, z: number, r: number, top: number): Island => ({ ...at(x, z), r: r * SCALE, top });
export const ISLANDS = {
  castle: island(0, 0, 10, 0),           // the cloud castle: the way in, Lazur (white and blue)
  observatory: island(0, -APART, 8, 1.5),       // the stargazer's island: the observatory, the shrine of the Star, Mertsal
  dragon: island(-APART, 0, 9, 0.6),      // the dragon island: Gromykhalo (green and gold)
  mills: island(APART, 0, 9, 0.3),       // the windmill island: Chirika (orange sails)
  pier: island(0, APART, 7, -0.6),       // the pier of the airship: Veterok (the ship's red balloon)
  far: island(APART, APART, 5, -1),       // the far islet: ray 4 (violet flowers), by the airship only
} as const;
export type ZoneId = keyof typeof ISLANDS;
/** The zones of the map: the middles of the islands (the targets of the route). */
export const ZONES: Record<ZoneId, Place> = Object.fromEntries(Object.entries(ISLANDS).map(([k, v]) => [k, { x: v.x, z: v.z }])) as Record<ZoneId, Place>;

/** m: how far inside an island's edge she can walk: the cloud rail stands on the edge. */
export const RAIL = 1.2;
/** m: the width of a cloud bridge's deck (a real size: it does not stretch with the map). */
export const BRIDGE_W = 3.2;

/** The cloud bridges: from one island to another, straight from middle to middle (the deck lies between their edges). */
export const BRIDGES: readonly (readonly [ZoneId, ZoneId])[] = [
  ['castle', 'observatory'], ['castle', 'dragon'], ['castle', 'mills'], ['castle', 'pier'],
];

/**
 * The gap in the bridge from the castle to the dragon island (WORLD-25, the cloud bridge of Lazur's chain): `from` m
 * along the bridge from the castle island's middle, `length` m long - room for four steps (the most a level has) and
 * the far edge; `half` m to each side of the bridge's line the clouds over a step hang within (the deck's height holds
 * there, so a hop onto a side cloud never drops her). She cannot walk across it until the bridge is built.
 */
export const CLOUD_GAP = { bridge: ['castle', 'dragon'] as const, from: 40, length: 13, half: 3.6 };

/** Where she appears: on the castle island, south of the castle, facing -z (every entry's heading) - the observatory's tower ahead. */
export const SPAWN = at(1.2, 4.4);

/** The ways of the map, each a line of points from one zone to another: the bridges, middle to middle. */
export const PATHS: readonly (readonly Place[])[] = BRIDGES.map(([a, b]) => [ZONES[a], ZONES[b]]);

/** The cloud castle (the first world's castle shape, white and blue): north-west of the island's middle, out of the bridges' way. */
export const CASTLE = { ...at(-4.4, -3.8), r: 3.4, top: 11 } as const;
/**
 * The observatory: a round tower with a clock face toward the castle and a dome on its top, seen from everywhere
 * (WORLD-10). It stands north of the island's middle; the shrine of the Star - where the finale is - at its door.
 */
export const OBSERVATORY = { x: ISLANDS.observatory.x, z: ISLANDS.observatory.z - 4, r: 2.8, towerH: 14, domeR: 3.2 } as const;
/** The foot of the observatory where the rays gather into the Star (the finale, docs/worlds/world-5.md). */
export const SHRINE = { x: OBSERVATORY.x, z: OBSERVATORY.z + OBSERVATORY.r + 3 };
/** The clock of the observatory (WORLD-24 later): its face on the tower's south side; ray 3 lies in it (WORLD-08). */
export const CLOCK = { x: OBSERVATORY.x + 4.5, z: OBSERVATORY.z + 2.5 };
/**
 * The clock's puzzle (WORLD-24): the three gears she finds on the stargazer's island first, scattered round it off its
 * middle and its bridge (step 1); then the place of its two tasks before the stand - the gears on the axle (step 2), the
 * hands (step 3) - looked at toward the tower (north, -z).
 */
export const GEARS: readonly Place[] = [
  { x: ISLANDS.observatory.x - 7.5, z: ISLANDS.observatory.z + 3 },
  { x: ISLANDS.observatory.x + 8, z: ISLANDS.observatory.z - 3.5 },
  { x: ISLANDS.observatory.x - 5.5, z: ISLANDS.observatory.z - 7.5 },
];
// (east of the stand by a little: the heroine, set beside the task, stands out of Mertsal's talk - no "hello" button over it)
export const CLOCK_AT = { x: CLOCK.x + 1.5, z: CLOCK.z + 1.4, facing: Math.PI } as const;
/** The windmills of Chirika's island: three, their sails ≈8 m across turning by the magic later. */
export const MILLS: readonly (Place & { yaw: number })[] = [
  { ...at(APART + 3.75, -3.75), yaw: -0.6 },
  { ...at(APART + 5, 2.5), yaw: 0.4 },
  { ...at(APART - 1.25, -5.6), yaw: -1.2 },
];
export const MILL = { towerR: 1.8, towerH: 7, roofH: 2, wingR: 4 } as const;
/** The airship at the pier: moored at the island's south edge, its red balloon raised (the second landmark). */
export const SHIP = { x: ISLANDS.pier.x + 3, z: ISLANDS.pier.z + ISLANDS.pier.r + 5, yaw: Math.PI / 2, len: 9, balloonR: 3.4, top: 13, deck: ISLANDS.pier.top - 1.4 } as const;
/** Where she boards the airship: on the pier's south edge, by the gangway (the action there takes her to the far islet). */
export const GANGWAY = { x: ISLANDS.pier.x + 2, z: ISLANDS.pier.z + ISLANDS.pier.r - RAIL - 1.2 };
/** Where the airship sets her down on the far islet, and where she boards it back. */
export const LANDING = { x: ISLANDS.far.x - 2, z: ISLANDS.far.z - 2 };
/**
 * The airship's flight (WORLD-05, WORLD-23; the customer's decision 2026-11-18 «а»: it flies by itself, the flight a
 * reward to watch): from its mooring by the pier up and in an arc east, south of the pier, the windmill island and the
 * Star over the observatory in view, to its mooring south of the far islet; back the same way. A fixed way, whatever
 * arrows made the route. Its points on the ground plan; the height is the flight's own (./ship.ts).
 */
export const SHIP_FAR = { x: ISLANDS.far.x - 2, z: ISLANDS.far.z + ISLANDS.far.r + 5 } as const;
export const FLIGHT: readonly Place[] = [
  { x: SHIP.x, z: SHIP.z },
  { x: SHIP.x + 10, z: SHIP.z + 12 },
  { x: (SHIP.x + SHIP_FAR.x) / 2, z: SHIP.z + 20 },
  { x: SHIP_FAR.x - 14, z: SHIP_FAR.z + 12 },
  { x: SHIP_FAR.x, z: SHIP_FAR.z },
];
/** Where she steps off the airship at the far islet's mooring, and onto it there (by its gangway on the islet's south edge). */
export const ISLET_GANGWAY = { x: ISLANDS.far.x - 1, z: ISLANDS.far.z + ISLANDS.far.r - RAIL - 1.2 } as const;
/** The table of the map of the winds (WORLD-23) on the pier, by the gangway: the child looks at it toward the ship (south). */
export const WINDS_AT = { x: ISLANDS.pier.x - 3, z: ISLANDS.pier.z + ISLANDS.pier.r - RAIL - 3.5, facing: 0 } as const;

/** The spot of ray 4 on the far islet (WORLD-08): among its violet flowers. */
export const RAY_ISLET = { x: ISLANDS.far.x + 2, z: ISLANDS.far.z + 1.5 };
/**
 * The arch back to the Great Tree on the castle island (./hub-way.ts): south-east of its middle, by the spawn and out of
 * the bridges - the camera behind her as she comes out of it stands on the island.
 */
export const TREE_ARCH = at(5.6, 5);

/**
 * The easel (PLAY-29, src/game/easel.ts): on the castle island between where she appears and the arch, off the ways,
 * clear of the finds (./collect.test.ts); the trees and bushes keep off it (./scenery.ts); its picture turned to the spawn.
 */
export const EASEL = (() => {
  const { x, z } = at(3.75, 6.9);
  return { x, z, facing: Math.atan2(SPAWN.x - x, SPAWN.z - z) };
})();

/**
 * What of each zone is seen from afar (WORLD-10, the landmark of a target): where it stands and how high its top is, m,
 * over the ground there - or over `base` for one that hangs in the air (the airship beside the pier: under it the sea of
 * clouds lies far below).
 * The castle - its tallest tower; the observatory - its dome; the dragon island - the dragon's rock; the
 * windmills - the first mill's roof; the pier - the airship's balloon; the far islet - its crystal.
 */
export const LANDMARKS: Record<ZoneId, Place & { top: number; base?: number }> = {
  castle: { x: CASTLE.x, z: CASTLE.z, top: CASTLE.top },
  observatory: { x: OBSERVATORY.x, z: OBSERVATORY.z, top: OBSERVATORY.towerH + OBSERVATORY.domeR },
  dragon: { x: ISLANDS.dragon.x - 5, z: ISLANDS.dragon.z - 4, top: 6 },
  mills: { x: MILLS[0].x, z: MILLS[0].z, top: MILL.towerH + MILL.roofH },
  pier: { x: SHIP.x, z: SHIP.z, top: SHIP.top, base: SHIP.deck },
  far: { x: ISLANDS.far.x + 1, z: ISLANDS.far.z - 2, top: 4 },
};
/**
 * The order she walks through the zones in the measurement of WORLD-12: every bridge there and back, the observatory
 * last. The far islet is not walked to: the airship takes her there.
 */
export const ROUTE: readonly ZoneId[] = ['castle', 'dragon', 'castle', 'mills', 'castle', 'pier', 'castle', 'observatory'];

/** The legs of a route: consecutive zones, each pair once (tools/sky-grey.mjs walks them). */
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

/**
 * The ground of the secrets (PLAY-07, ./secrets.ts): two small discs that are no zones of the map - no target of the
 * route, no landmark, no way of the measurements - and the two straight ways that join each to its island. The tiny
 * islet lies behind the dragon island (west-south-west, away from the dragon's rock), its chest the world's chest, and a
 * short cloud deck leads to it from the dragon island; the lower ledge hangs off the windmill island's east-north-east
 * edge, under it, and the rainbow slide runs down to it from the island's edge. They are not in ISLANDS or BRIDGES: those
 * are the map the walkthrough and tools/sky-grey.mjs measure (its six zones, the 15-25 s of each bridge, the route), and
 * a secret is off the way. ./terrain.ts stands her on them as on the islands; their edges are closed by a rail too.
 */
export interface Nook extends Place { r: number; top: number }
/** m: how far inside a nook's edge she can walk (its own small rail of puffs on the edge). */
export const NOOK_RAIL = 0.8;
/** A point `d` m from the middle of `i`, in the direction `angle` (radians from +x toward +z). */
const toward = (i: Place, angle: number, d: number): Place => ({ x: i.x + Math.cos(angle) * d, z: i.z + Math.sin(angle) * d });
/** rad: the directions of the islet from the dragon island and of the ledge from the windmill island. */
export const ISLET_DIR = Math.PI - 0.35, LEDGE_DIR = -0.35;
/** m: the islet's radius, the length of its deck between the edges; the ledge's radius, the gap the slide crosses, its drop. */
const ISLET_R = 4.5, ISLET_DECK = 6, LEDGE_R = 3.6, LEDGE_GAP = 5, LEDGE_DROP = 4.5;
export const NOOKS = {
  islet: { ...toward(ISLANDS.dragon, ISLET_DIR, ISLANDS.dragon.r + ISLET_DECK + ISLET_R), r: ISLET_R, top: ISLANDS.dragon.top + 0.4 },
  ledge: { ...toward(ISLANDS.mills, LEDGE_DIR, ISLANDS.mills.r + LEDGE_GAP + LEDGE_R), r: LEDGE_R, top: ISLANDS.mills.top - LEDGE_DROP },
} as const satisfies Record<string, Nook>;
/**
 * The ways to the nooks, each straight from the middle of its island to the middle of its nook, `w` m wide; its height
 * runs from the island's top at the island's edge to the nook's top at the nook's edge - evenly on the deck to the
 * islet, steep first and flattening out on the slide (`slide`).
 */
export interface NookWay { from: Island; to: Nook; w: number; slide: boolean }
export const NOOK_WAYS = {
  islet: { from: ISLANDS.dragon, to: NOOKS.islet, w: BRIDGE_W, slide: false },
  slide: { from: ISLANDS.mills, to: NOOKS.ledge, w: 2.2, slide: true },
} as const satisfies Record<string, NookWay>;
/** Where the ways to the nooks cross the edges of their islands (the cloud rails leave them a gap, ./scenery.ts). */
export const NOOK_ENDS: readonly Place[] = Object.values(NOOK_WAYS).map((w) => {
  const d = Math.hypot(w.to.x - w.from.x, w.to.z - w.from.z);
  return { x: w.from.x + ((w.to.x - w.from.x) / d) * w.from.r, z: w.from.z + ((w.to.z - w.from.z) / d) * w.from.r };
});
