import * as THREE from 'three';
import { fbm, smoothstep } from '../../core/util';
import type { WorldGround } from '../../game/world';
import { BRIDGE, EDGE, HALF, PATHS, RIVER, RIVER_HALF, type Place } from './layout';

/**
 * The ground of the Sweet Land, the grey build (WORLD-12): a gentle sugary relief, the bed of the chocolate river, the
 * whipped-cream hills rising past the edge of the map, the ways and the colliders. The river keeps her out along its
 * whole length but at the shape bridge (`riverColliders`). Nothing here knows the size of the map but through
 * ./layout.ts (SCALE).
 */

/** m: the nearest distance from (x, z) to a line of points. */
export function lineDist(line: readonly Place[], x: number, z: number): number {
  let best = Infinity;
  for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    best = Math.min(best, Math.hypot(x - a.x - dx * t, z - a.z - dz * t));
  }
  return best;
}
/** m: the nearest way. */
export const pathDist = (x: number, z: number) => Math.min(...PATHS.map((p) => lineDist(p, x, z)));
/** m: the middle of the river. */
export const riverDist = (x: number, z: number) => lineDist(RIVER, x, z);
/** m: the length of a line of points. */
export const lineLength = (line: readonly Place[]) => line.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - line[i].x, p.z - line[i].z), 0);

/** (along, across) of (x, z) in the frame of the bridge: along its deck (across the river), across it (along the river). */
export function bridgeFrame(x: number, z: number): { along: number; across: number } {
  const ax = Math.sin(BRIDGE.yaw), az = Math.cos(BRIDGE.yaw), dx = x - BRIDGE.x, dz = z - BRIDGE.z;
  return { along: dx * ax + dz * az, across: -dx * az + dz * ax };
}
/** On the deck of the bridge (it lies level with the banks: she walks across the river on it, not through it). */
export const onBridge = (x: number, z: number) => {
  const { along, across } = bridgeFrame(x, z);
  return Math.abs(along) <= BRIDGE.len / 2 && Math.abs(across) <= BRIDGE.w / 2;
};

/** m: how deep the river's bed lies under the banks: a shallow stream of chocolate (it stands still at the magic 0). */
export const RIVER_DEPTH = 0.7;

export function height(x: number, z: number): number {
  let h = (fbm(x * 0.03 + 6.2, z * 0.03 + 1.7) - 0.5) * 2.2;
  // the ways and the zones lie a little flatter
  h *= 0.5 + 0.5 * smoothstep(1.5, 6, pathDist(x, z));
  // the river's bed, but under the bridge: its deck is the ground there, level with the banks
  if (!onBridge(x, z)) h -= RIVER_DEPTH * (1 - smoothstep(RIVER_HALF * 0.6, RIVER_HALF + 1, riverDist(x, z)));
  // the rim: the ground rises past the edge into the whipped-cream hills
  const d = Math.hypot(x, z), rim = smoothstep(HALF - 4, HALF + 30, d);
  return h + rim * rim * 20;
}

const C = (hex: string) => new THREE.Color(hex);
// pastel even with no ruby back (docs/worlds/world-4.md: light and sweet at the magic 0, only quiet)
const sugar = C('#f6dde6'), sugar2 = C('#f2e6d0'), way = C('#e8b070'), choc = C('#6b4226'), cream = C('#fff4ea');
/** The colour of the ground: pink and cream sugar, the ways caramel, the river chocolate, the rim whipped cream (grey build). */
export function groundColor(x: number, z: number, out: THREE.Color): THREE.Color {
  out.copy(sugar).lerp(sugar2, smoothstep(0.35, 0.7, fbm(x * 0.08, z * 0.08, 2)));
  out.lerp(way, 1 - smoothstep(0.9, 1.8, pathDist(x, z)));
  if (!onBridge(x, z)) out.lerp(choc, 1 - smoothstep(RIVER_HALF * 0.7, RIVER_HALF + 0.4, riverDist(x, z)));
  return out.lerp(cream, smoothstep(HALF, HALF + 16, Math.hypot(x, z)));
}

/** A round obstacle; `under`: a walker whose feet are this high or higher passes over it (the roof of Imbir's house, ./secrets.ts). */
export interface Collider { x: number; z: number; r: number; under?: number }
/** The round obstacles of the Sweet Land (houses, lollipops, the cake, the river, characters); emptied as the world is left (./index.ts). */
export const colliders: Collider[] = [];

/**
 * A flat top she can stand on (./secrets.ts: the roof of Imbir's house, where the cotton cloud tosses her): a rectangle
 * `w` by `d` round (x, z), axis-aligned, its top at `top`. Emptied as the world is left.
 */
export interface Top { x: number; z: number; w: number; d: number; top: number }
export const tops: Top[] = [];
/** m: how far under a top her feet may be and still land on it (she comes down onto it; walking she is far below). */
export const TOP_FROM = 0.5;

/** The height of the top under (x, z) for feet at `feet` (WorldGround.support), null where none carries her. */
export function support(x: number, z: number, feet: number): number | null {
  let best: number | null = null;
  for (const t of tops) {
    if (Math.abs(x - t.x) > t.w / 2 || Math.abs(z - t.z) > t.d / 2) continue;
    if (feet >= t.top - TOP_FROM && (best === null || t.top > best)) best = t.top;
  }
  return best;
}

/** m: the river's colliders stand this far apart along its middle line. */
export const RIVER_STEP = 0.8;
/**
 * The river as a row of round colliders along its middle line, RIVER_HALF each: none within `gap` of the bridge's axis
 * (measured along the river), so the deck is the one way over. `gap` is half the deck's width and a collider's radius:
 * the nearest collider then only touches the edge of the deck.
 */
export function riverColliders(gap = BRIDGE.w / 2 + RIVER_HALF): Collider[] {
  const out: Collider[] = [];
  for (let i = 0; i < RIVER.length - 1; i++) {
    const a = RIVER[i], b = RIVER[i + 1], n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / RIVER_STEP));
    for (let k = i === 0 ? 0 : 1; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n;
      if (Math.hypot(x - BRIDGE.x, z - BRIDGE.z) < gap) continue;
      out.push({ x, z, r: RIVER_HALF });
    }
  }
  return out;
}

/** Keeps a walker out of the obstacles and inside the map (a point with `y` over a collider's `under` passes it). */
export function resolve(p: { x: number; z: number; y?: number }, radius: number) {
  for (const c of colliders) {
    if (c.under !== undefined && p.y !== undefined && p.y >= c.under) continue;
    const dx = p.x - c.x, dz = p.z - c.z, min = c.r + radius, d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2); p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
  }
  const d = Math.hypot(p.x, p.z), max = HALF - EDGE;
  if (d > max) { p.x *= max / d; p.z *= max / d; }
}

/** Where a camera ray meets the ground (tap-to-walk): steps along the ray, then halves the last step. */
export function raycast(origin: THREE.Vector3, dir: THREE.Vector3, out: THREE.Vector3): boolean {
  if (dir.y >= 0) return false;
  let t0 = 0, t1 = 0;
  for (let i = 0; i < 400; i++) {
    t1 = t0 + 0.5;
    const x = origin.x + dir.x * t1, y = origin.y + dir.y * t1, z = origin.z + dir.z * t1;
    if (y <= height(x, z)) {
      for (let k = 0; k < 12; k++) {
        const tm = (t0 + t1) / 2, xm = origin.x + dir.x * tm, ym = origin.y + dir.y * tm, zm = origin.z + dir.z * tm;
        if (ym <= height(xm, zm)) t1 = tm; else t0 = tm;
      }
      out.copy(origin).addScaledVector(dir, t1);
      out.y = height(out.x, out.z);
      return true;
    }
    t0 = t1;
  }
  return false;
}

export const ground: WorldGround = {
  height, resolve, raycast, support,
  block: (x, z, r) => { colliders.push({ x, z, r }); },
};

/** The ground as one mesh, coloured by vertex: the map and the rim around it. */
export function buildGround(segments: number): THREE.Mesh {
  const size = (HALF + 40) * 2;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position'), col: number[] = [], c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i);
    pos.setY(i, height(x, z));
    groundColor(x, z, c); col.push(c.r, c.g, c.b);
  }
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.receiveShadow = true;
  mesh.name = 'sweet-ground';
  return mesh;
}
