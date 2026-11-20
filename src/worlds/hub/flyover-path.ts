import type { FlyoverPath } from '../../game/flyover';
import { NESTS, PORTALS, arrivalAt, trunkR } from './layout';

const SPAWN = arrivalAt(0);

/** The tour (WORLD-11): the roots, up the trunk to the first nest, round the arches, back to her at the first arch. */
export const HUB_FLYOVER: FlyoverPath = {
  seconds: 13,
  line: 'hub_tour',
  points: [
    { pos: [1.5, 1.2, 7], look: [0, 0.8, 2.4] },
    { pos: [2.5, 4.5, 6.5], look: [0, NESTS[0].y, trunkR(NESTS[0].y)] },
    { pos: [9, 8.5, 6], look: [0, 7, 0] },
    // round the arches, from between them (r 17: past the arches, inside the ring of trees)
    { pos: [16.2, 6.5, -5.3], look: [PORTALS[1].x, 2, PORTALS[1].z] },
    { pos: [0, 6, -17], look: [0, 2, PORTALS[2].z] },
    { pos: [-16.2, 5.5, -5.3], look: [PORTALS[4].x, 2, PORTALS[4].z] },
    { pos: [-4, 3, 4.5], look: [SPAWN.x, 1.2, SPAWN.z] },
  ],
};
