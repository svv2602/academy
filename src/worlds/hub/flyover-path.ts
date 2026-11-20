import type { FlyoverPath } from '../../game/flyover';
import { NESTS, PORTALS, arrivalAt, trunkR } from './layout';

const SPAWN = arrivalAt(0);

/**
 * The tour (WORLD-11): the roots, up the trunk to the first nest, the tree over the glade, round the arches, back to her
 * at the first arch. Set for the tree with its look (H): the grey trunk was thin, the tree now has a root flare, low
 * branches and a crown - so every point keeps 8 m and more from its axis, none stands at her head (she arrives 6 m into
 * the glade, `arrivalAt(0)`), and the arches are looked at across the glade, not past the trunk. The last point stands
 * where the camera behind her will be, so the tour hands over without a jump.
 */
export const HUB_FLYOVER: FlyoverPath = {
  seconds: 13,
  line: 'hub_tour',
  points: [
    { pos: [4.5, 1.4, 9.5], look: [0, 1.0, 1.5] },
    { pos: [3.5, 5.0, 8.5], look: [0, NESTS[0].y, trunkR(NESTS[0].y) + 0.35] },
    { pos: [12, 8.5, 9], look: [0, 9, 0] },
    // round the arches, from between them at the edge of the glade (r 17-18, inside the ring of trees)
    { pos: [17.5, 7, -2], look: [PORTALS[1].x, 2.5, PORTALS[1].z] },
    { pos: [0, 6.5, -17.5], look: [0, 2.5, PORTALS[2].z] },
    { pos: [-17, 6, -3], look: [PORTALS[4].x, 2.5, PORTALS[4].z] },
    { pos: [-3.5, 2.8, 12], look: [SPAWN.x, 1.2, SPAWN.z] },
  ],
};
