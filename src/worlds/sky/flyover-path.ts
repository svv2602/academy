import type { FlyoverPath } from '../../game/flyover';
import { ISLANDS, OBSERVATORY, SCALE, SPAWN, ZONES } from './layout';

/**
 * The tour of the Sky Islands' grey build (WORLD-11): from over the castle up to the observatory, across to the dragon
 * island, round over the windmills to the pier and its airship with the far islet beyond, back to the heroine. Silent:
 * the grey build has no line of its own. Its heights grow with the map (SCALE).
 */
const h = (m: number) => m * Math.max(1, SCALE * 0.8);
export const SKY_FLYOVER: FlyoverPath = {
  seconds: 14,
  line: null,
  points: [
    { pos: [SPAWN.x + 6, h(10), SPAWN.z + 12], look: [OBSERVATORY.x, 12, OBSERVATORY.z] },
    { pos: [ZONES.observatory.x + 20, h(18), ZONES.observatory.z + 18], look: [OBSERVATORY.x, 10, OBSERVATORY.z] },
    { pos: [ZONES.dragon.x + 16, h(16), ZONES.dragon.z - 18], look: [ZONES.dragon.x, 2, ZONES.dragon.z] },
    { pos: [ZONES.mills.x - 18, h(16), ZONES.mills.z - 16], look: [ZONES.mills.x, 4, ZONES.mills.z] },
    { pos: [ZONES.pier.x + 20, h(14), ZONES.pier.z - 10], look: [ISLANDS.far.x, 0, ISLANDS.far.z] },
    { pos: [SPAWN.x - 3, h(4.5), SPAWN.z + 7], look: [SPAWN.x, 1.5, SPAWN.z] },
  ],
};
