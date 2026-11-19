/**
 * What hides the mysterious stars of the first world (PLAY-24, src/game/mystery.ts): half of their places stand behind
 * something - the fairy house, the rocks of the glade, big boulders - so that from the path the star is not
 * seen, and coming near, it is. Pure: the glade's rocks (./secrets.ts) and the boulders are built of these very lists,
 * and the test of the places (./mystery.test.ts) looks from the path through them.
 */
import { CASTLE, GLADE, HOUSE } from './layout';
import { height, nearestOnPath } from './terrain';

/** Something round that hides what stands behind it: its middle, radius and top, m over the ground at its foot. */
export interface Occluder { x: number; z: number; r: number; top: number }

/** A rock of the glade or a boulder: a dodecahedron of radius 1 scaled by (r, h, r), its middle 0.45 h over the ground. */
export interface Rock { x: number; z: number; r: number; h: number; spin: number }
/** What surely hides, of a rock: most of its radius, and its top short of the highest point (a face, not a vertex). */
const rockOccluder = (k: Rock): Occluder => ({ x: k.x, z: k.z, r: 0.8 * k.r, top: 1.3 * k.h });

/** The way out of the glade (towards the valley's middle) and the radius of its ring of rocks. */
export const GLADE_FACE = Math.atan2(-GLADE.x, -GLADE.z), GLADE_RING_R = GLADE.r + 1.4;
/** Half the angle of the glade's entrance, rad. */
const GAP = 0.42;
/** The ring of rocks of the glade behind the waterfall and the two pillars of its entrance (./secrets.ts builds them). */
export function gladeRocks(): Rock[] {
  const out: Rock[] = [];
  for (let i = 0; i < 18; i++) {
    const a = GLADE_FACE + GAP + (i / 17) * (Math.PI * 2 - GAP * 2);
    out.push({ x: GLADE.x + Math.sin(a) * GLADE_RING_R, z: GLADE.z + Math.cos(a) * GLADE_RING_R, r: 1.25 + (i % 3) * 0.25, h: 2.4 + ((i * 7) % 5) * 0.35, spin: i * 1.7 });
  }
  const side = (s: number) => GLADE_FACE + s * (GAP + 0.08);
  for (const s of [-1, 1]) out.push({ x: GLADE.x + Math.sin(side(s)) * GLADE_RING_R, z: GLADE.z + Math.cos(side(s)) * GLADE_RING_R, r: 1.15, h: 4.2, spin: s * 2 });
  return out;
}

/** Big boulders a mysterious star hides behind (with the glade's rocks: one instanced mesh, ./secrets.ts). */
export const BOULDERS: readonly Rock[] = [
  { x: -22.4, z: -59.3, r: 1.4, h: 2, spin: 0 }, { x: -46.4, z: -28.9, r: 1.4, h: 2, spin: 1.3 }, { x: -35.8, z: 23.6, r: 1.4, h: 2, spin: 2.6 },
  { x: 31.3, z: -55.4, r: 1.4, h: 2, spin: 3.9 }, { x: -20.9, z: -27.4, r: 1.4, h: 2, spin: 5.2 }, { x: -1.7, z: -43.5, r: 1.4, h: 2, spin: 6.5 },
  { x: 49.3, z: -10.3, r: 1.4, h: 2, spin: 7.8 }, { x: -16.4, z: 20.5, r: 1.4, h: 2, spin: 9.1 }, { x: 26.9, z: -20.5, r: 1.4, h: 2, spin: 10.4 },
  { x: 29.8, z: 22.2, r: 1.4, h: 2, spin: 11.7 },
];

/**
 * Everything that hides a star: the castle and the house (their bodies, a little inside their colliders of
 * ./scenery.ts - the castle is wider than round, its circle is short of its walls), the rocks of the glade and the boulders.
 */
export function occluders(): Occluder[] {
  return [
    { x: CASTLE.x, z: CASTLE.z - 4, r: 9, top: 8 },
    { x: HOUSE.x, z: HOUSE.z, r: 2.6, top: 6 },
    ...gladeRocks().map(rockOccluder), ...BOULDERS.map(rockOccluder),
  ];
}

/** m: the eye looking from the path - the camera behind the heroine stands this high over the ground (5.2 m at 0.36 rad). */
export const PATH_EYE = 3.3;

/**
 * Whether the star at x, z (its body from `low` to `high` m over the ground, `half` m to each side) is hidden from the
 * nearest point of the path: every line from the eye there to the star's middle, top and both sides passes through an
 * occluder below its top.
 */
export function hiddenFromPath(x: number, z: number, low: number, high: number, half: number, occ: readonly Occluder[] = occluders()): boolean {
  const p = nearestOnPath(x, z), eye = height(p.x, p.z) + PATH_EYE, g = height(x, z);
  const len = Math.hypot(x - p.x, z - p.z), sx = -(z - p.z) / len, sz = (x - p.x) / len;
  const targets = [[x, z, g + (low + high) / 2], [x, z, g + high], [x + sx * half, z + sz * half, g + (low + high) / 2], [x - sx * half, z - sz * half, g + (low + high) / 2]];
  return targets.every(([tx, tz, ty]) => occ.some((o) => {
    // the part of the line inside the occluder's circle: the line is hidden if it is below the top anywhere there
    const dx = tx - p.x, dz = tz - p.z, fx = p.x - o.x, fz = p.z - o.z;
    const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - o.r * o.r, disc = b * b - 4 * a * c;
    if (disc <= 0) return false;
    const t0 = Math.max(0, (-b - Math.sqrt(disc)) / (2 * a)), t1 = Math.min(1, (-b + Math.sqrt(disc)) / (2 * a));
    if (t0 >= t1) return false;
    const top = height(o.x, o.z) + o.top;
    return [t0, (t0 + t1) / 2, t1].some((t) => eye + (ty - eye) * t < top);
  }));
}
