/**
 * Whether a mysterious star (PLAY-24, ./mystery.ts) is hidden from the path, for the worlds after the first (the first
 * world has its own, over its terrain: src/worlds/fairy/hiding.ts). Pure: a world hands in its paths, its relief and
 * what hides (its houses, rocks, hedges - each a round body with a top), and its test of the places looks from the
 * path through them.
 */
import { MYSTERY_STAR } from './mystery';

/** Something round that hides what stands behind it: its middle, radius and top, m over the ground at its foot. */
export interface Occluder { x: number; z: number; r: number; top: number }
interface Place { readonly x: number; readonly z: number }

/** m: the eye looking from the path - the camera behind the heroine stands this high over the ground. */
export const PATH_EYE = 3.3;

/** The star's body as it is drawn (./mystery-stars.ts): from its float to its top at the highest of its bob, and its half width. */
export const STAR_BODY = (() => {
  const { model, scale, float, bob } = MYSTERY_STAR;
  return { low: float, high: float + model * scale + bob, half: (model * scale) / 2 };
})();

/** The point of the paths (polylines) nearest to x, z. */
export function nearestOn(paths: readonly (readonly Place[])[], x: number, z: number): Place {
  let best = { x: paths[0][0].x, z: paths[0][0].z }, bd = Infinity;
  for (const line of paths) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1], b = line[i], dx = b.x - a.x, dz = b.z - a.z, l2 = dx * dx + dz * dz;
      const t = l2 ? Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / l2)) : 0;
      const px = a.x + dx * t, pz = a.z + dz * t, d = Math.hypot(x - px, z - pz);
      if (d < bd) { bd = d; best = { x: px, z: pz }; }
    }
  }
  return best;
}

/** What a world hands in: its paths, the height of its ground and what hides. */
export interface HideWorld {
  readonly paths: readonly (readonly Place[])[];
  height(x: number, z: number): number;
  readonly occluders: readonly Occluder[];
  /** The point she looks from (default: the nearest of the paths) - a world of islands looks from where she can stand. */
  from?(x: number, z: number): Place;
}

/**
 * Whether the star at x, z is hidden from the nearest point of the path: every line from the eye there to the star's
 * middle, top and both sides passes through an occluder below its top. `occ` replaces the world's occluders (the
 * test that the check is not blind passes none).
 */
export function hiddenFromPath(w: HideWorld, x: number, z: number, occ: readonly Occluder[] = w.occluders): boolean {
  const { low, high, half } = STAR_BODY;
  const p = w.from ? w.from(x, z) : nearestOn(w.paths, x, z), eye = w.height(p.x, p.z) + PATH_EYE, g = w.height(x, z);
  const len = Math.hypot(x - p.x, z - p.z);
  if (len < 1e-6) return false;
  const sx = -(z - p.z) / len, sz = (x - p.x) / len, mid = g + (low + high) / 2;
  const targets = [[x, z, mid], [x, z, g + high], [x + sx * half, z + sz * half, mid], [x - sx * half, z - sz * half, mid]];
  return targets.every(([tx, tz, ty]) => occ.some((o) => {
    // the part of the line inside the occluder's circle: the line is hidden if it is below the top anywhere there
    const dx = tx - p.x, dz = tz - p.z, fx = p.x - o.x, fz = p.z - o.z;
    const a = dx * dx + dz * dz, b = 2 * (fx * dx + fz * dz), c = fx * fx + fz * fz - o.r * o.r, disc = b * b - 4 * a * c;
    if (disc <= 0) return false;
    const t0 = Math.max(0, (-b - Math.sqrt(disc)) / (2 * a)), t1 = Math.min(1, (-b + Math.sqrt(disc)) / (2 * a));
    if (t0 >= t1) return false;
    const top = w.height(o.x, o.z) + o.top;
    return [t0, (t0 + t1) / 2, t1].some((t) => eye + (ty - eye) * t < top);
  }));
}
