import * as THREE from 'three';
import { fbm, smoothstep } from '../../core/util';
import type { WorldGround } from '../../game/world';
import { EDGE, HALF, PATHS, ZONES, type Place } from './layout';

/**
 * The sea floor of the grey build (WORLD-12): gentle sand dunes, the dark trench sunk in its corner, the rim of rock
 * rising past the edge of the map, the ways and the colliders. Nothing here knows the size of the map but through
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
/** m: the length of a line of points. */
export const lineLength = (line: readonly Place[]) => line.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - line[i].x, p.z - line[i].z), 0);

/** m: the radius of the dark trench's hollow. */
export const TRENCH_R = 9;

export function height(x: number, z: number): number {
  // dunes of sand, flatter along the ways
  let h = (fbm(x * 0.035 + 2.3, z * 0.035 + 5.9) - 0.5) * 2.4;
  h *= 0.45 + 0.55 * smoothstep(1.5, 6, pathDist(x, z));
  // the trench: a bowl a few metres deep, not dark - lit by its lights (docs/worlds/world-3.md: nowhere without light)
  const t = Math.hypot(x - ZONES.trench.x, z - ZONES.trench.z);
  h -= 3 * (1 - smoothstep(TRENCH_R * 0.4, TRENCH_R, t));
  // the rim: the floor rises past the edge into rocks and tall kelp
  const d = Math.hypot(x, z), rim = smoothstep(HALF - 4, HALF + 30, d);
  return h + rim * rim * 22;
}

const C = (hex: string) => new THREE.Color(hex);
// the sand under water: warm and light, under turquoise water (the customer, 2026-11-21)
const sand = C('#f0dfa8'), sand2 = C('#e6d092'), way = C('#f8edc8'), deep = C('#5b8c9a'), rock = C('#7d8f99');
/** The colour of the floor: sand, the ways lighter, the trench blue-grey, the rim grey (grey build). */
export function groundColor(x: number, z: number, out: THREE.Color): THREE.Color {
  out.copy(sand).lerp(sand2, smoothstep(0.35, 0.7, fbm(x * 0.08, z * 0.08, 2)));
  out.lerp(way, 1 - smoothstep(0.9, 1.8, pathDist(x, z)));
  out.lerp(deep, 1 - smoothstep(TRENCH_R * 0.3, TRENCH_R, Math.hypot(x - ZONES.trench.x, z - ZONES.trench.z)));
  return out.lerp(rock, smoothstep(HALF, HALF + 20, Math.hypot(x, z)));
}

export interface Collider { x: number; z: number; r: number }
/** The round obstacles of the sea (rocks, corals, towers, characters); emptied as the world is left (./index.ts). */
export const colliders: Collider[] = [];

/** Keeps a swimmer out of the obstacles and inside the map. */
export function resolve(p: { x: number; z: number }, radius: number) {
  for (const c of colliders) {
    const dx = p.x - c.x, dz = p.z - c.z, min = c.r + radius, d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2); p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
  }
  const d = Math.hypot(p.x, p.z), max = HALF - EDGE;
  if (d > max) { p.x *= max / d; p.z *= max / d; }
}

/** Where a camera ray meets the floor (tap-to-swim): steps along the ray, then halves the last step. */
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

/** The floor as one mesh, coloured by vertex: the map and the rim around it. */
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
  mesh.name = 'sea-ground';
  return mesh;
}
