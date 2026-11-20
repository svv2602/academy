import type { FlyoverPath } from '../../game/flyover';
import { CASTLE, CHEST, CRYSTAL, POND, SPAWN } from './layout';

/**
 * The tour of the Fairy Kingdom (WORLD-11): from above the spawn meadow over the pond to the castle, back over the
 * shrine of the crystal and the birches of the chest, down to the heroine. Metres; `look` is where the camera looks.
 */
export const FAIRY_FLYOVER: FlyoverPath = {
  seconds: 12,
  line: 'tour',
  points: [
    { pos: [SPAWN.x, 9, SPAWN.z + 16], look: [SPAWN.x, 2, SPAWN.z - 8] },
    { pos: [POND.x + 6, 10, POND.z + 22], look: [POND.x, 1, POND.z] },
    { pos: [CASTLE.x - 14, 11, CASTLE.z + 30], look: [CASTLE.x + 6, 2, CASTLE.z + 16] },  // the castle, the queen, the falls, the pond (WORLD-10)
    { pos: [CRYSTAL.x - 24, 12, CRYSTAL.z - 20], look: [CRYSTAL.x, 1.5, CRYSTAL.z] },
    { pos: [CHEST.x + 6, 10, CHEST.z + 13], look: [CHEST.x, 1, CHEST.z] },  // through the opening of the grove (WORLD-10)
    { pos: [SPAWN.x - 12, 6, SPAWN.z + 10], look: [SPAWN.x, 1.5, SPAWN.z] },
  ],
};
