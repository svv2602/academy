import type { FlyoverPath } from '../../game/flyover';
import { CAKE, MILL, SCALE, SPAWN, ZONES } from './layout';

/**
 * The tour of the Sweet Land's grey build (WORLD-11): from over the square of the carousel to the cake palace, across
 * to the candy garden and down over the gingerbread town, over the marmalade market to the shape bridge and the mill,
 * back to the heroine. The cat names the land and its cake palace (sweet_flyover). Its heights grow with the map (SCALE).
 */
const h = (m: number) => m * Math.max(1, SCALE * 0.8);
export const SWEET_FLYOVER: FlyoverPath = {
  seconds: 14,
  line: 'sweet_flyover',
  points: [
    { pos: [SPAWN.x + 6, h(9), SPAWN.z + 10], look: [CAKE.x, 10, CAKE.z] },
    { pos: [ZONES.palace.x - 18, h(16), ZONES.palace.z + 16], look: [CAKE.x, 9, CAKE.z] },
    { pos: [ZONES.garden.x + 18, h(14), ZONES.garden.z + 12], look: [ZONES.town.x, 2, ZONES.town.z] },
    { pos: [ZONES.town.x + 16, h(14), ZONES.town.z + 10], look: [ZONES.market.x, 2, ZONES.market.z] },
    { pos: [ZONES.market.x + 18, h(12), ZONES.market.z - 8], look: [MILL.x, 6, MILL.z] },
    { pos: [SPAWN.x - 3, h(4.5), SPAWN.z + 7], look: [SPAWN.x, 1.5, SPAWN.z] },
  ],
};
