/**
 * The map of the Enchanted Forest, the grey build (WORLD-12; the map of docs/worlds/world-2.md, ≈90 × 90 m). Every place
 * is given at the size of the document and multiplied by SCALE: the whole map is stretched by one number, the sizes of
 * things (a character, a house, the Old Oak) stay real. SCALE comes from `?scale=` (the grey build only: the forest is
 * listed in the registry in `--mode grey`, src/worlds/index.ts), DEFAULT_SCALE without it: the customer chose 1.6 on
 * 2026-11-20 (the paths 5-13 s on foot; the time of the world is made by its tasks, not by running).
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

/** The stretch of the map the customer chose (2026-11-20, docs/worlds/world-2.md). */
export const DEFAULT_SCALE = 1.6;
/** The stretch of the map asked for in the address (`?scale=1`, for debugging), kept within 0.5-3; DEFAULT_SCALE without it or outside a page. */
export function readScale(search: string | undefined): number {
  const raw = new URLSearchParams(search ?? '').get('scale'), v = Number(raw);
  return raw !== null && Number.isFinite(v) && v > 0 ? Math.min(3, Math.max(0.5, v)) : DEFAULT_SCALE;
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

/**
 * The maze (WORLD-14, src/game/worldtasks/maze.ts): six lanes of paths between hedges, 20 m long and 6 m apart, west of
 * its zone. Its way in is north-west of the zone, where the hedgehog waits by the arch; the lanes snake south, and its
 * way out comes onto the path to the village. The fifth leaf waits at the far end, just inside the way out. The frame is
 * in metres of the task, not stretched with the map (the stretch moves it with its zone).
 */
export const MAZE_FRAME = {
  origin: { x: ZONES.maze.x - 5.8, z: ZONES.maze.z + 11.8 }, along: { x: -1, z: 0 }, across: { x: 0, z: -1 }, length: 20, gap: 6,
} as const;
/** The way in, just outside the hedge (the trunk of the maze starts here). */
export const MAZE_IN = { x: MAZE_FRAME.origin.x + 2.5, z: MAZE_FRAME.origin.z };
/** Where the leaf waits: the end of the last lane, 1.5 m inside the way out. */
export const MAZE_END = { x: MAZE_FRAME.origin.x - 1.5, z: MAZE_FRAME.origin.z - 5 * MAZE_FRAME.gap };
/** Is (x, z) within the hedge of the maze, or `margin` m round it (the outer lanes' hedge reaches 5 m past them)? */
export function inMaze(x: number, z: number, margin = 0): boolean {
  const { origin: o, length, gap } = MAZE_FRAME;
  return x <= o.x + 1.2 + margin && x >= o.x - length - 1.2 - margin && z <= o.z + 5 + margin && z >= o.z - 5 * gap - 5 - margin;
}
/** The owl's tree with its hollow: the second leaf lies in it. */
export const OWL_TREE = { x: ZONES.owl.x - 5, z: ZONES.owl.z - 3 };
/** The hollow on the side of that tree, where the leaf waits (walked up to in the grey build). */
export const HOLLOW = { x: OWL_TREE.x + 1.6, z: OWL_TREE.z + 1.2 };
/** The altar of the finale under the Old Oak. */
export const ALTAR = { x: ZONES.oak.x, z: ZONES.oak.z + 7 };

/**
 * What of each zone is seen from afar (WORLD-10, the landmark of a target): where it stands and how high its top is, m.
 * The village - the elder's tall mushroom house (its red caps alone, 3.6 m, hid behind the trees); the maze and the central glade - an arch of stones (the glade's stands where the hub's
 * arch will lead in); the grove - its great orange tree at the edge of its glade (and its crowns, taller than the forest's); the stream - its bridge's rails are low: its landmark is the Ash.
 */
export const LANDMARKS: Record<ZoneId, Place & { top: number }> = {
  center: { ...ZONES.center, top: 3.2 },
  oak: { x: ZONES.oak.x, z: ZONES.oak.z, top: 17 },
  village: { x: ZONES.village.x - 4.6, z: ZONES.village.z - 2, top: 8.5 },
  owl: { x: ZONES.owl.x - 5, z: ZONES.owl.z - 3, top: 11 },
  // the arch before its way in, 6 m out: in the first lane the camera behind her has passed it
  maze: { x: ZONES.maze.x + 2.7, z: ZONES.maze.z + 11.8, top: 3.2 },
  stream: { x: ZONES.ash.x, z: ZONES.ash.z - 2.6, top: 15 },
  grove: { x: ZONES.grove.x - 6, z: ZONES.grove.z + 4, top: 11 },
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
