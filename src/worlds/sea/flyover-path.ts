import type { FlyoverPath } from '../../game/flyover';
import { CASTLE, SCALE, SHIP, SPAWN, ZONES } from './layout';

/**
 * The tour of the sea's grey build (WORLD-11): from over the square to the castle's towers, across to the sunken ship,
 * over the trench and the reef, down past the shell garden to the castle's gate and the grotto, back to the heroine.
 * Silent: the grey build has no line of its own. Its heights grow with the map (SCALE).
 */
const h = (m: number) => m * Math.max(1, SCALE * 0.8);
export const SEA_FLYOVER: FlyoverPath = {
  seconds: 14,
  line: 'sea_flyover',
  points: [
    { pos: [SPAWN.x + 8, h(9), SPAWN.z - 10], look: [CASTLE.x, 8, CASTLE.z] },
    { pos: [SHIP.x - 16, h(14), SHIP.z + 14], look: [SHIP.x, 4, SHIP.z] },
    { pos: [ZONES.trench.x + 16, h(14), ZONES.trench.z + 12], look: [ZONES.reef.x, 1, ZONES.reef.z] },
    { pos: [ZONES.garden.x + 16, h(12), ZONES.garden.z - 4], look: [CASTLE.x, 5, CASTLE.z] },
    { pos: [ZONES.grotto.x - 18, h(12), ZONES.grotto.z + 4], look: [ZONES.grotto.x, 2, ZONES.grotto.z] },
    { pos: [SPAWN.x - 3, h(4.5), SPAWN.z - 7], look: [SPAWN.x, 1.5, SPAWN.z] },
  ],
};
