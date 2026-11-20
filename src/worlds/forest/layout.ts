/**
 * The map of the Enchanted Forest, the grey build (WORLD-12; the map of docs/worlds/world-2.md, ≈90 × 90 m). Every place
 * is given at the size of the document and multiplied by SCALE: the whole map is stretched by one number, the sizes of
 * things (a character, a house, the Old Oak) stay real. SCALE comes from `?scale=` (the grey build only: the forest is
 * listed in the registry in `--mode grey`, src/worlds/index.ts), 1 by default - the customer compares 1 and 1.6.
 *
 *            [Owl glade]                    [Old Oak - the shrine of the Emerald]
 *                 |                                 |
 *   [Gnome village] ------ path ------ [Central glade, the way in]
 *                 |                                 |
 *      [Maze of paths]                      [Stream and bridges]
 *                 |                                 |
 *         [Squirrel grove] ------ tracks ------ [Talking tree]
 *
 * x to the east, z to the south (the top of the drawing is -z, as in the first world).
 */

/** The stretch of the map asked for in the address (`?scale=1.6`), kept within 0.5-3; 1 without it or outside a page. */
export function readScale(search: string | undefined): number {
  const v = Number(new URLSearchParams(search ?? '').get('scale'));
  return Number.isFinite(v) && v > 0 ? Math.min(3, Math.max(0.5, v)) : 1;
}
export const SCALE = readScale(typeof location === 'undefined' ? undefined : location.search);

export interface Place { x: number; z: number }
/** A place of the drawing at the scale of the build. */
const at = (x: number, z: number): Place => ({ x: x * SCALE, z: z * SCALE });

/** m: the half of the map (the walkable part is a circle of this radius; the spruces and the haze stand past it). */
export const HALF = 45 * SCALE;
/** m: a walker stays this far inside HALF. */
export const EDGE = 2;

/** The zones of the map: their middles. */
export const ZONES = {
  center: at(20, -4),       // the central glade: the way in (later the arch of the hub)
  oak: at(22, -31),         // the Old Oak, the shrine of the Emerald of Wisdom: seen from everywhere
  village: at(-24, -8),     // the gnomes' mushroom village (red caps)
  owl: at(-22, -31),        // the Owl glade (blue fireflies)
  maze: at(-22, 12),        // the entrance of the maze of paths
  stream: at(22, 13),       // the stream and its bridges
  grove: at(-22, 32),       // the squirrel grove (orange leaves)
  ash: at(22, 32),          // the talking tree, Old Ash
} as const;
export type ZoneId = keyof typeof ZONES;

/** Where she appears: on the central glade, facing the Oak. */
export const SPAWN = at(20, 2);

/** The paths of the map, each a line of points from one zone to another (the drawing's lines). */
export const PATHS: readonly (readonly Place[])[] = [
  [ZONES.center, at(21, -16), ZONES.oak],
  [ZONES.center, at(0, -7), ZONES.village],
  [ZONES.village, at(-24, -20), ZONES.owl],
  [ZONES.village, at(-23, 2), ZONES.maze],
  [ZONES.maze, at(-24, 22), ZONES.grove],
  [ZONES.center, at(21, 5), ZONES.stream],
  [ZONES.stream, at(23, 22), ZONES.ash],
  [ZONES.grove, at(0, 34), ZONES.ash],         // the squirrel's tracks
];

/** The stream: a line from the east edge to the south-west edge; the paths cross it on bridges. */
export const STREAM: readonly Place[] = [at(48, 4), at(32, 11), at(16, 15), at(6, 23), at(-3, 33), at(-8, 48)];
/** m: the half-width of the stream's bed. */
export const STREAM_HALF = 1.6;

/** The maze (WORLD-14, later): its stones lie in a square here; the fifth leaf waits at its far end. */
export const MAZE = { x: ZONES.maze.x - 9 * SCALE, z: ZONES.maze.z + 3 * SCALE, half: 6 };
export const MAZE_END = { x: MAZE.x - MAZE.half + 1.2, z: MAZE.z + MAZE.half - 1.2 };
/** The owl's tree with its hollow: the second leaf lies in it. */
export const OWL_TREE = { x: ZONES.owl.x - 5, z: ZONES.owl.z - 3 };
/** The hollow on the side of that tree, where the leaf waits (walked up to in the grey build). */
export const HOLLOW = { x: OWL_TREE.x + 1.6, z: OWL_TREE.z + 1.2 };
/** The altar of the finale under the Old Oak. */
export const ALTAR = { x: ZONES.oak.x, z: ZONES.oak.z + 7 };

/**
 * What of each zone is seen from afar (WORLD-10, the landmark of a target): where it stands and how high its top is, m.
 * The village - the elder's tall mushroom house (its red caps alone, 3.6 m, hid behind the trees); the maze and the central glade - an arch of stones (the glade's stands where the hub's
 * arch will lead in); the grove - its orange crowns, taller than the forest's; the stream - its bridge's rails are low: its landmark is the Ash.
 */
export const LANDMARKS: Record<ZoneId, Place & { top: number }> = {
  center: { ...ZONES.center, top: 3.2 },
  oak: { x: ZONES.oak.x, z: ZONES.oak.z, top: 17 },
  village: { x: ZONES.village.x - 4.6, z: ZONES.village.z - 2, top: 8.5 },
  owl: { x: ZONES.owl.x - 5, z: ZONES.owl.z - 3, top: 11 },
  maze: { x: ZONES.maze.x - 2, z: ZONES.maze.z, top: 3.2 },
  stream: { x: ZONES.ash.x, z: ZONES.ash.z - 2.6, top: 15 },
  grove: { ...ZONES.grove, top: 9.5 },
  ash: { x: ZONES.ash.x, z: ZONES.ash.z - 2.6, top: 15 },
};
/** The order she goes through the zones in the measurement of WORLD-12: every path of the map once, the Oak last. */
export const ROUTE: readonly ZoneId[] = ['center', 'village', 'owl', 'village', 'maze', 'grove', 'ash', 'stream', 'center', 'oak'];

/** The legs of a route: consecutive zones, each pair once (tools/forest-grey.mjs walks them; it has its own copy). */
export function routeLegs(route: readonly ZoneId[]): [ZoneId, ZoneId][] {
  const legs: [ZoneId, ZoneId][] = [];
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    if (!legs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) legs.push([a, b]);
  }
  return legs;
}
/** The path of the map from zone `a` to zone `b` (either way round), or null. */
export function pathBetween(a: ZoneId, b: ZoneId): readonly Place[] | null {
  for (const p of PATHS) {
    if (p[0] === ZONES[a] && p[p.length - 1] === ZONES[b]) return p;
    if (p[0] === ZONES[b] && p[p.length - 1] === ZONES[a]) return [...p].reverse();
  }
  return null;
}

/** The Old Oak: m. Its crown is over every other tree of the forest: it is the landmark of the map (WORLD-10). */
export const OAK = { trunkR: 1.8, trunkH: 9, crownR: 7.5, crownY: 13 };
