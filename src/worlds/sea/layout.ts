/**
 * The map of the Underwater Kingdom, the grey build (WORLD-12; the map of docs/worlds/world-3.md, ≈90 × 90 m). Every
 * place is given at the size of the document and multiplied by SCALE: the whole map is stretched by one number, the
 * sizes of things (a character, the castle, the ship) stay real. SCALE comes from `?scale=` (the grey build only: the sea
 * is listed in the registry in `--mode grey`, src/worlds/index.ts), DEFAULT_SCALE without it - the customer chose 1.6
 * by the pictures of the grey build on 2026-11-20.
 *
 *      [Dark trench - the lantern fish]          [Sunken ship - the turtle]
 *                   |                                     |
 *      [Coral reef - the dragon] ---- current ---- [Square before the castle, the way in]
 *                   |                                     |
 *        [Shell garden - the pet]                 [Crab's grotto]
 *                   \______________ [Castle gate: the shell lock] ______________/
 *                                            |
 *                               [Throne hall - the shrine of the Pearl]
 *
 * x to the east, z to the south (the top of the drawing is -z, as in the first world).
 */

/** The stretch of the map the customer chose (2026-11-20, docs/worlds/world-3.md), the forest's too. */
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

/** m: the half of the map (the swimmable part is a circle of this radius; rocks and tall kelp stand past it). */
export const HALF = 45 * SCALE;
/** m: a swimmer stays this far inside HALF. */
export const EDGE = 2;

/** The zones of the map: their middles. */
export const ZONES = {
  square: at(20, -6),       // the square before the mermaids' castle: the way in (later the arch of the hub)
  ship: at(22, -32),        // the sunken ship, the turtle Pantsyr
  trench: at(-22, -32),     // the dark trench, the lantern fish Iskorka (turquoise lights)
  reef: at(-24, -6),        // the coral reef, the sea dragon Bulk (pink and orange corals)
  garden: at(-22, 16),      // the shell garden (mother-of-pearl): where the pet hides
  grotto: at(22, 16),       // the crab's grotto, Kleshnya the cook (red claws and pots)
  gate: at(0, 24),          // the gate of the castle with the shell lock
  throne: at(0, 35),        // the throne hall: the shrine of the Pearl of the Deep
} as const;
export type ZoneId = keyof typeof ZONES;

/** Where she appears: on the square, facing the castle. */
export const SPAWN = at(17, 0);

/** The ways of the map, each a line of points from one zone to another (the drawing's lines). */
export const PATHS: readonly (readonly Place[])[] = [
  [ZONES.square, at(21, -19), ZONES.ship],
  [ZONES.reef, at(-23, -19), ZONES.trench],
  [ZONES.square, at(-2, -9), ZONES.reef],           // the current
  [ZONES.reef, at(-23, 5), ZONES.garden],
  [ZONES.square, at(21, 5), ZONES.grotto],
  [ZONES.garden, at(-11, 21), ZONES.gate],
  [ZONES.grotto, at(11, 21), ZONES.gate],
  [ZONES.gate, ZONES.throne],
];

/** The castle of the mermaids: its towers stand behind the gate, around the throne hall; seen from everywhere (WORLD-10). */
export const CASTLE = { x: ZONES.throne.x, z: ZONES.throne.z, towerR: 1.6, towerH: 16, ring: 7 };
/** The sunken ship: its hull lies on its side by the turtle, its mast stands up - the second landmark. */
export const SHIP = { x: ZONES.ship.x + 4, z: ZONES.ship.z - 4, len: 14, mastH: 13 };
/** The door of the captain's cabin, on the side of the ship's stern: the third pearl lies behind it (WORLD-08). */
export const CABIN = { x: SHIP.x - SHIP.len / 2 + 2, z: SHIP.z + 4.2 };
/** In the corals of the reef, at the end of Bulk's search: the second pearl (WORLD-08). */
export const CORAL_NEST = { x: ZONES.reef.x - 5, z: ZONES.reef.z - 3 };
/**
 * The secrets' rocks (docs/worlds/world-3.md «Секреты»; ./secrets.ts): the rock of the bubble lift, a pillar off the
 * ways between the square and the ship, its top flat; the lookout at the east edge, a mound she swims up onto, its top
 * facing the open water where the whale passes. r: the flat top's radius, h: its height over the floor, m; slope: how
 * far its side runs down (0: a cliff).
 */
export const LIFT_ROCK = { ...at(6, -17), r: 1.7, h: 5, slope: 0 };
export const LOOKOUT = { ...at(37, -12), r: 2, h: 3.2, slope: 6 };
/** The shell of the throne where the pearls come together: the finale. */
export const THRONE = { x: ZONES.throne.x, z: ZONES.throne.z };

/**
 * What of each zone is seen from afar (WORLD-10, the landmark of a target): where it stands and how high its top is, m.
 * The square - the arch of the way in (where the hub's arch will stand; the castle is behind her from the grotto); the throne - the castle's towers; the gate - its lintel; the ship - its mast; the reef - its tall fan corals; the trench - the
 * glowing arch of rock over it; the garden - its great shell; the grotto - the rock of the grotto with its chimney.
 */
/** The arch of the way in on the square, east of its middle and out of the way of the camera behind her there: its two pillars stand `w` apart across x. */
export const SQUARE_ARCH = { x: ZONES.square.x + 10, z: ZONES.square.z + 1, top: 9, w: 3.6 };
/** The towers of the castle, round the throne hall: six, the gate between the two of the north. */
export const TOWERS: readonly Place[] = Array.from({ length: 6 }, (_, i) => {
  const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
  return { x: CASTLE.x + Math.sin(a) * CASTLE.ring, z: CASTLE.z - Math.cos(a) * CASTLE.ring };
});
export const LANDMARKS: Record<ZoneId, Place & { top: number }> = {
  square: { x: SQUARE_ARCH.x - SQUARE_ARCH.w / 2, z: SQUARE_ARCH.z, top: SQUARE_ARCH.top },   // a pillar of the arch: its middle is open
  ship: { x: SHIP.x, z: SHIP.z, top: SHIP.mastH },
  trench: { x: ZONES.trench.x - 3, z: ZONES.trench.z - 4, top: 9 },
  reef: { x: ZONES.reef.x - 4, z: ZONES.reef.z - 2, top: 7 },
  garden: { x: ZONES.garden.x - 4, z: ZONES.garden.z + 3, top: 5 },
  grotto: { x: ZONES.grotto.x + 4, z: ZONES.grotto.z + 3, top: 9 },
  gate: { x: CASTLE.x, z: CASTLE.z - CASTLE.ring, top: 5.2 },        // the lintel of the gate
  // the shell of the throne itself, where she swims from the gate: the tower behind the hall stood 18 m off past the
  // gate's wall, its top above the picture from 4 m before the gate, its foot behind the lintel (2026-11-22)
  throne: { ...THRONE, top: 0.75 },
};
/** The order she swims through the zones in the measurement of WORLD-12: every way of the map once, the throne last. */
export const ROUTE: readonly ZoneId[] = ['square', 'ship', 'square', 'reef', 'trench', 'reef', 'garden', 'gate', 'grotto', 'square', 'grotto', 'gate', 'throne'];

/** The legs of a route: consecutive zones, each pair once (tools/sea-grey.mjs swims them; it has its own copy). */
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
