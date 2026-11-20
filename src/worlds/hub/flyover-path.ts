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
  seconds: 14,
  line: 'hub_tour',
  points: [
    { pos: [4.5, 1.4, 9.5], look: [0, 1.0, 1.5] },
    { pos: [3.5, 5.0, 8.5], look: [0, NESTS[0].y, trunkR(NESTS[0].y) + 0.35] },
    { pos: [12, 8.5, 9], look: [0, 9, 0] },
    // round the arches from the edge of the glade (r 18.5, inside the ring of trees) and over them (7.5 m: the curve
    // between two points cuts inside the circle, right over an arch, whose top with its crest is 5.3 m high)
    { pos: [18.4, 7.5, -1.9], look: [PORTALS[1].x, 2.5, PORTALS[1].z] },
    { pos: [0, 7.5, -18.5], look: [0, 2.5, PORTALS[2].z] },
    { pos: [-17.6, 7.5, -5.7], look: [PORTALS[4].x, 2.5, PORTALS[4].z] },
    // on over the arch of the sky to the fairies' side, then down behind her (past the arches, not through one)
    { pos: [-10.9, 7.5, 15], look: [PORTALS[0].x, 2.5, PORTALS[0].z] },
    { pos: [-3.5, 2.8, 12], look: [SPAWN.x, 1.2, SPAWN.z] },
  ],
};
