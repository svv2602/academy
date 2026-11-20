import type { FlyoverPath } from '../../game/flyover';
import { SCALE, SPAWN, ZONES } from './layout';

/**
 * The tour of the forest's grey build (WORLD-11): from over the central glade to the Old Oak, across to the Owl glade and
 * the village, down past the maze to the grove, over the stream to the talking tree, back to the heroine. Silent: the
 * grey build has no line of its own. Its heights grow with the map (SCALE).
 */
const h = (m: number) => m * Math.max(1, SCALE * 0.8);
export const FOREST_FLYOVER: FlyoverPath = {
  seconds: 14,
  line: null,
  points: [
    { pos: [SPAWN.x + 8, h(9), SPAWN.z + 12], look: [ZONES.oak.x, 8, ZONES.oak.z] },
    { pos: [ZONES.oak.x - 14, h(16), ZONES.oak.z + 16], look: [ZONES.oak.x, 9, ZONES.oak.z] },
    { pos: [ZONES.owl.x + 16, h(14), ZONES.owl.z + 10], look: [ZONES.village.x, 1, ZONES.village.z] },
    { pos: [ZONES.maze.x + 16, h(14), ZONES.maze.z + 2], look: [ZONES.grove.x, 2, ZONES.grove.z] },
    { pos: [ZONES.grove.x + 20, h(12), ZONES.grove.z - 6], look: [ZONES.ash.x, 3, ZONES.ash.z] },
    { pos: [SPAWN.x - 3, h(4.5), SPAWN.z + 7], look: [SPAWN.x, 1.5, SPAWN.z] },
  ],
};
