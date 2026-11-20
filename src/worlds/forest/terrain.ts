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

export function height(x: number, z: number): number {
  let h = (fbm(x * 0.03 + 4.1, z * 0.03 + 8.7) - 0.5) * 3;
  // the paths and the glades lie a little flatter
  h *= 0.5 + 0.5 * smoothstep(1.5, 6, pathDist(x, z));
  // the stream's bed
  h -= 1.1 * (1 - smoothstep(STREAM_HALF * 0.5, STREAM_HALF + 1.2, streamDist(x, z)));
  // the rim: the ground rises past the edge into the spruces
  const d = Math.hypot(x, z), rim = smoothstep(HALF - 4, HALF + 30, d);
  return h + rim * rim * 22;
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

export interface Collider { x: number; z: number; r: number }
/** The round obstacles of the forest (trunks, houses, characters); emptied as the world is left (./index.ts). */
export const colliders: Collider[] = [];

/** Keeps a walker out of the obstacles and inside the map. */
export function resolve(p: { x: number; z: number }, radius: number) {
  for (const c of colliders) {
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
  height, resolve, raycast,
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
