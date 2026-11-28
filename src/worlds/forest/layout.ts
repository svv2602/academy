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
/**
 * The easel (PLAY-29, src/game/easel.ts): on the north-west edge of the mushroom village, 6 m from Borovik, off its
 * paths and clear of the houses and the finds (./collect.test.ts); its picture turned to the village's middle.
 */
export const EASEL = (() => {
  const x = ZONES.village.x - 3.5 * (SCALE / DEFAULT_SCALE), z = ZONES.village.z + 4.5 * (SCALE / DEFAULT_SCALE);
  return { x, z, facing: Math.atan2(ZONES.village.x - x, ZONES.village.z - z) };
})();

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
 * The maze (WORLD-14, src/game/worldtasks/maze.ts): six lanes of paths between hedges, 6 m apart, west of
 * its zone. Its way in is north-west of the zone, where the hedgehog waits by the arch; the lanes snake south, and its
 * way out comes onto the path to the village. The fifth leaf waits at the far end, just inside the way out. The frame is
 * in metres of the task, not stretched with the map (the stretch moves it with its zone).
 */
export const MAZE_FRAME = {
  // as long as the map lets them (the edge is nearest the first two): the trunk 190 m, 35 s at a run on level 5
  origin: { x: ZONES.maze.x - 5.8, z: ZONES.maze.z + 11.8 }, along: { x: -1, z: 0 }, across: { x: 0, z: -1 }, lengths: [21, 21, 25.5, 25.5, 27.5, 27.5], gap: 6,
} as const;
/** The way in, just outside the hedge (the trunk of the maze starts here). */
export const MAZE_IN = { x: MAZE_FRAME.origin.x + 2.5, z: MAZE_FRAME.origin.z };
/** Where the leaf waits: the end of the last lane, 1.5 m inside the way out. */
export const MAZE_END = { x: MAZE_FRAME.origin.x - 1.5, z: MAZE_FRAME.origin.z - 5 * MAZE_FRAME.gap };
/** Is (x, z) within the hedge of the maze, or `margin` m round it (the outer lanes' hedge reaches 5 m past them)? */
export function inMaze(x: number, z: number, margin = 0): boolean {
  const { origin: o, lengths, gap } = MAZE_FRAME, length = Math.max(...lengths);
  return x <= o.x + 1.2 + margin && x >= o.x - length - 1.2 - margin && z <= o.z + 5 + margin && z >= o.z - 5 * gap - 5 - margin;
}
/** The owl's tree with its hollow: the second leaf lies in it. */
export const OWL_TREE = { x: ZONES.owl.x - 5, z: ZONES.owl.z - 3 };
/** The hollow on the side of that tree, where the leaf waits (walked up to in the grey build). */
export const HOLLOW = { x: OWL_TREE.x + 1.6, z: OWL_TREE.z + 1.2 };
/** The altar of the finale under the Old Oak. */
export const ALTAR = { x: ZONES.oak.x, z: ZONES.oak.z + 7 };

/**
 * The secrets of the forest (PLAY-10, docs/worlds/world-2.md «Секреты»), off the paths and away from the zones (./secrets.ts):
 * - the cave behind the little waterfall on the stream's north bank, its curtain to the stream (`face`: the heading out);
 * - the hollow of the singing fireflies, an old tree west of the way from the stream to the Ash;
 * - the ring of fairy mushrooms between the central glade's way to the village and the way to the Oak;
 * - the cave under the roots of an uprooted tree between the maze and the grove.
 * The mushroom trampoline stands in the village by one of its houses (./secrets.ts `trampolineOf`).
 * No tree of the forest grows within `clear` m of one (./scenery.ts placeTrees).
 */
export const CAVE = { ...at(36, 5), face: 0, clear: 7 };
export const SONG_TREE = { ...at(12, 26), clear: 5 };
export const FAIRY_RING = { ...at(4, -20), r: 1.9, clear: 5 };
/**
 * The cave under the roots (the customer's word of 2026-11-27: a secret place to explore): a mound under an uprooted
 * tree between the maze and the grove, east of the way between them, its opening turned to that way (`face`: the
 * heading out). The one stretch of that side the paths, the zones and the maze leave clear (./secrets.test.ts).
 */
export const ROOTS = (() => {
  const p = at(-11, 20), to = { x: (ZONES.maze.x + ZONES.grove.x) / 2, z: (ZONES.maze.z + ZONES.grove.z) / 2 };
  return { ...p, face: Math.atan2(to.x - p.x, to.z - p.z), clear: 7 };
})();
export const SECRET_CLEARINGS: readonly { x: number; z: number; clear: number }[] = [CAVE, SONG_TREE, FAIRY_RING, ROOTS];

/**
 * The places of the mysterious stars (PLAY-24, src/game/mystery.ts, ten of them a day), in metres of the chosen stretch
 * (moved with the map by another). Half of them hidden: from the nearest point of a path the star is behind a mossy
 * boulder (MYSTERY_ROCKS, one each, ./hiding.ts) - seen only on coming near; the other half in sight, aside of the
 * path, where she has to walk. None within MYSTERY_SHOW_R + 4 of the central glade, the village or the Owl glade: the
 * looks from there are the heaviest of the forest (TECH-06), and a star is drawn only that near her (./mystery.test.ts).
 */
const m = (x: number, z: number): Place => at(x / DEFAULT_SCALE, z / DEFAULT_SCALE);
/** m: the stars are drawn only while one not solved is this near her (WorldDef.mystery.showR) - as the secrets (./secrets.ts SHOW_R). */
export const MYSTERY_SHOW_R = 22;
export const MYSTERY_HIDDEN: readonly Place[] = [
  m(-26.5, 13.3), m(44, -34.4), m(47, 36.2), m(-3.2, 63.5),
  m(0.1, -21.5), m(25.7, 57.5), m(-23.8, 43), m(25, -51.3),
  m(5.7, 0.5), m(26.5, 35.8), m(8.8, 46), m(-19.7, 60.5),
];
/** The boulder each hidden place stands behind, in the order of MYSTERY_HIDDEN: baked into the things of the forest (./decor.ts). */
export const MYSTERY_ROCKS: readonly Place[] = [
  m(-28.5, 13.5), m(42, -34.5), m(45, 36), m(-3, 61.5),
  m(0, -19.5), m(25.5, 55.5), m(-24, 45), m(27, -51),
  m(6, -1.5), m(28.5, 36), m(9, 48), m(-19.5, 58.5),
];
/** A boulder: a dodecahedron of radius 1 scaled by (r, h, r), its middle 0.45 h over the ground (as the first world's). */
export const MYSTERY_ROCK = { r: 1.4, h: 2 } as const;
export const MYSTERY_OPEN: readonly Place[] = [
  m(-13.5, 0), m(-7.5, 42), m(22.5, -36), m(12, 61.5),
  m(45, 24), m(-25.5, 24), m(-15, 48), m(46.5, -43.5),
  m(9, -19.5), m(45, 45), m(28.5, -42), m(-12, 58.5),
];
export const MYSTERY_SPOTS: readonly Place[] = [...MYSTERY_HIDDEN, ...MYSTERY_OPEN];
/**
 * The room in Shustrik's tree (`hollow`, the customer's word of 2026-11-27: a secret place to explore, as the first
 * world's room of the house): far past the map, south of it, where nothing of the forest reaches (./terrain.ts holds
 * the floor flat under it and her inside its wall); the door in the trunk of the grove's great tree leads into it
 * (./tree-room.ts). Placed by HALF, so that a stretched map (?scale) never reaches it. r: the wall's radius inside.
 */
export const TREE_ROOM = { x: 0, z: -(HALF + 150), r: 4.2, y: 0 };

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
/**
 * The arch of the Great Tree on the central glade (./hub-way.ts): its turn (as the grey build's arch stood, its passage
 * toward the spawn) and how far in front of it she comes out of it from the hub - the place a child stands on that glade.
 */
export const HUB_ARCH = { facing: 0.4, out: 7 } as const;
export const ARRIVAL: Place = { x: LANDMARKS.center.x + Math.sin(HUB_ARCH.facing) * HUB_ARCH.out, z: LANDMARKS.center.z + Math.cos(HUB_ARCH.facing) * HUB_ARCH.out };

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
