import * as THREE from 'three';
import { fbm, smoothstep } from '../../core/util';
import type { WorldGround } from '../../game/world';
import { EDGE, HALF, PATHS, STREAM, STREAM_HALF, type Place } from './layout';

/**
 * The ground of the forest, the grey build (WORLD-12): a gentle relief, the stream's bed, the rim rising past the edge
 * of the map, the paths and the colliders. Nothing here knows the size of the map but through ./layout.ts (SCALE).
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
/** m: the nearest path. */
export const pathDist = (x: number, z: number) => Math.min(...PATHS.map((p) => lineDist(p, x, z)));
/** m: the middle of the stream. */
export const streamDist = (x: number, z: number) => lineDist(STREAM, x, z);
/** m: the length of a line of points. */
export const lineLength = (line: readonly Place[]) => line.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - line[i].x, p.z - line[i].z), 0);

/** The surface of the water, m. */
export const WATER_Y = -0.35;

/** Where the paths cross the stream: there the bridges lie (computed once: the ground reads them at every point). */
export function bridges(): (Place & { yaw: number })[] {
  const out: (Place & { yaw: number })[] = [];
  for (const line of PATHS) for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], n = Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.5);
    let best: Place | null = null, bd = Infinity;
    for (let k = 0; k <= n; k++) {
      const x = a.x + ((b.x - a.x) * k) / n, z = a.z + ((b.z - a.z) * k) / n, d = streamDist(x, z);
      if (d < bd) { bd = d; best = { x, z }; }
    }
    if (best && bd < 0.6 && !out.some((p) => Math.hypot(p.x - best!.x, p.z - best!.z) < 4)) out.push({ ...best, yaw: Math.atan2(b.x - a.x, b.z - a.z) });
  }
  return out;
}


/** m: the bridges' width, the height of their arch and how high their ends lie over the water. */
export const BRIDGE_W = 2.4;
export const BRIDGE_H = 0.45;
export const BRIDGE_BASE = WATER_Y + 0.1;
/** m: a bridge's length along its path: the stream's width and a step more. */
export const BRIDGE_L = (STREAM_HALF + 1.2) * 2;
/**
 * Kenney's round bridge has a flat deck between its rails: its planks lie at DECK_TOP of its height (0.2 of its 0.45,
 * measured on its vertices; its walk runs along its z, the rails on its x sides). The ground under it lies DECK_SINK
 * under the planks: its mesh stays hidden (level with the planks its colour showed through them), her feet a few cm in.
 */
export const DECK_TOP = 0.44;
export const DECK_SINK = 0.08;
let crossings: (Place & { yaw: number })[] | null = null;
/**
 * The deck of a bridge under (x, z), or -Infinity off every bridge: she walks over the stream on it, not through the
 * water (Kenney's bridge, ./decor.ts: flat at DECK_TOP of its height, down to its ends over its last tenth).
 */
export function deckY(x: number, z: number): number {
  crossings ??= bridges();
  let best = -Infinity;
  for (const b of crossings) {
    const ax = Math.sin(b.yaw), az = Math.cos(b.yaw), dx = x - b.x, dz = z - b.z;
    const along = dx * ax + dz * az, across = -dx * az + dz * ax;
    if (Math.abs(along) > BRIDGE_L / 2 || Math.abs(across) > BRIDGE_W / 2) continue;
    const k = Math.abs((2 * along) / BRIDGE_L);
    best = Math.max(best, BRIDGE_BASE + BRIDGE_H * DECK_TOP * Math.min(1, (1 - k) / 0.2) - DECK_SINK);
  }
  return best;
}

export function height(x: number, z: number): number {
  let h = (fbm(x * 0.03 + 4.1, z * 0.03 + 8.7) - 0.5) * 3;
  // the paths and the glades lie a little flatter
  h *= 0.5 + 0.5 * smoothstep(1.5, 6, pathDist(x, z));
  // the stream's bed
  h -= 1.1 * (1 - smoothstep(STREAM_HALF * 0.5, STREAM_HALF + 1.2, streamDist(x, z)));
  // the rim: the ground rises past the edge into the spruces
  const d = Math.hypot(x, z), rim = smoothstep(HALF - 4, HALF + 30, d);
  // over the stream a bridge is the ground
  return Math.max(h + rim * rim * 22, deckY(x, z));
}

const C = (hex: string) => new THREE.Color(hex);
const moss = C('#6f9a5a'), moss2 = C('#86ad62'), path = C('#cdb48a'), water = C('#5aa7b8'), rim = C('#6d8a78');
/** The colour of the ground: moss, the paths sandy, the stream's bed blue-green, the rim grey-green (grey build). */
export function groundColor(x: number, z: number, out: THREE.Color): THREE.Color {
  out.copy(moss).lerp(moss2, smoothstep(0.35, 0.7, fbm(x * 0.08, z * 0.08, 2)));
  out.lerp(path, 1 - smoothstep(0.9, 1.8, pathDist(x, z)));
  out.lerp(water, 1 - smoothstep(STREAM_HALF * 0.6, STREAM_HALF + 0.4, streamDist(x, z)));
  return out.lerp(rim, smoothstep(HALF, HALF + 20, Math.hypot(x, z)));
}

/** A round obstacle; `top` - over this height (m) a walker is above it (on a roof) and it does not hold her. */
export interface Collider { x: number; z: number; r: number; top?: number }
/** The round obstacles of the forest (trunks, houses, characters); emptied as the world is left (./index.ts). */
export const colliders: Collider[] = [];

/** Keeps a walker out of the obstacles and inside the map. */
export function resolve(p: { x: number; z: number; y?: number }, radius: number) {
  for (const c of colliders) {
    if (c.top !== undefined && p.y !== undefined && p.y > c.top) continue;
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

/**
 * A top she can stand on (WorldGround.support): round, `r` m across from (x, z), its height at `d` m from the middle
 * `top(d)` (over the sea level, not the ground); she gets onto it from `from` m below at most (a jump), from lower she
 * is beside it. `spring`: landing on it throws her up at this speed (WorldGround.bounce). Emptied as the world is left.
 */
export interface Top { x: number; z: number; r: number; top(d: number): number; from: number; spring?: number }
export const tops: Top[] = [];

/** The highest top under (x, z) she can be on with her feet at `feet`, null where there is none. */
export function support(x: number, z: number, feet: number): number | null {
  let best: number | null = null;
  for (const t of tops) {
    const d = Math.hypot(x - t.x, z - t.z);
    if (d > t.r) continue;
    const h = t.top(d);
    if (feet >= h - t.from && (best === null || h > best)) best = h;
  }
  return best;
}

/** The speed a springy top throws her up at, when (x, z) is on one; null where there is none. */
export function bounce(x: number, z: number): number | null {
  for (const t of tops) if (t.spring && Math.hypot(x - t.x, z - t.z) <= t.r) return t.spring;
  return null;
}

export const ground: WorldGround = {
  height, resolve, raycast, support, bounce,
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
  mesh.name = 'forest-ground';
  return mesh;
}
