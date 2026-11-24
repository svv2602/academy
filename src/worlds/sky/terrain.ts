import * as THREE from 'three';
import { fbm, smoothstep } from '../../core/util';
import type { WorldGround } from '../../game/world';
import { BRIDGES, BRIDGE_W, HALF, ISLANDS, PATHS, RAIL, type Island, type Place, type ZoneId } from './layout';

/**
 * The ground of the Sky Islands, the grey build (WORLD-12): the flat tops of the six islands with a gentle relief, the
 * cloud bridges between them, the sea of clouds far below. She stands on the islands and the bridges only: `resolve`
 * keeps every walker inside them, as the first world keeps her inside its border - the edges are closed (the customer's
 * decision 1 a of 2026-11-18: no fall, no new code of the heroine or the camera). The far islet is one of the islands;
 * no bridge leads to it. Nothing here knows the size of the map but through ./layout.ts (SCALE).
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
/** m: the nearest way (the middle line of a bridge). */
export const pathDist = (x: number, z: number) => Math.min(...PATHS.map((p) => lineDist(p, x, z)));
/** m: the length of a line of points. */
export const lineLength = (line: readonly Place[]) => line.slice(1).reduce((n, p, i) => n + Math.hypot(p.x - line[i].x, p.z - line[i].z), 0);

/** m: the height of the sea of clouds under the islands (it is seen, never stood on). */
export const CLOUD_SEA = -22;

const islands = Object.entries(ISLANDS) as [ZoneId, Island][];

/** The island (x, z) is on, within its edge, or null. */
export function islandAt(x: number, z: number): ZoneId | null {
  for (const [id, i] of islands) if (Math.hypot(x - i.x, z - i.z) <= i.r) return id;
  return null;
}

/** A bridge in its own frame: (along, across) of (x, z) from the middle of island `a` toward `b`, its length between the middles. */
function bridgeFrame(a: Island, b: Island, x: number, z: number) {
  const len = Math.hypot(b.x - a.x, b.z - a.z), ax = (b.x - a.x) / len, az = (b.z - a.z) / len, dx = x - a.x, dz = z - a.z;
  return { along: dx * ax + dz * az, across: -dx * az + dz * ax, len, ax, az };
}
/** The bridge (x, z) is on, as the pair of its islands, or null: its deck lies between the islands' edges, BRIDGE_W wide. */
export function bridgeAt(x: number, z: number): readonly [ZoneId, ZoneId] | null {
  for (const pair of BRIDGES) {
    const f = bridgeFrame(ISLANDS[pair[0]], ISLANDS[pair[1]], x, z);
    if (f.along >= 0 && f.along <= f.len && Math.abs(f.across) <= BRIDGE_W / 2) return pair;
  }
  return null;
}

/** What she can stand on: an island or a bridge. */
export const onGround = (x: number, z: number) => islandAt(x, z) !== null || bridgeAt(x, z) !== null;

/** m: the top of an island at (x, z): its height and a gentle relief, flat toward its middle and its bridges. */
function islandTop(i: Island, x: number, z: number): number {
  const relief = (fbm(x * 0.06 + 3.1, z * 0.06 + 7.4) - 0.5) * 0.8;
  return i.top + relief * smoothstep(2, 6, pathDist(x, z)) * (1 - smoothstep(i.r - 3, i.r, Math.hypot(x - i.x, z - i.z)));
}

export function height(x: number, z: number): number {
  const on = islandAt(x, z);
  if (on) return islandTop(ISLANDS[on], x, z);
  const b = bridgeAt(x, z);
  if (b) {
    // the deck runs straight from the top of one island to the other, with a soft sag in the middle
    const a = ISLANDS[b[0]], c = ISLANDS[b[1]], f = bridgeFrame(a, c, x, z), u = f.along / f.len;
    return a.top + (c.top - a.top) * u - Math.sin(u * Math.PI) * 0.3;
  }
  return CLOUD_SEA;
}

const C = (hex: string) => new THREE.Color(hex);
const grass = C('#cfe8b4'), grass2 = C('#e6f0c8'), stone = C('#d9d4e8'), cloud = C('#ffffff');
/** The accent of each island's top (docs/worlds/world-5.md «Карта»): the castle white and blue, the dragons' green and gold… */
const ACCENT: Record<ZoneId, string> = { castle: '#dbe9ff', observatory: '#e4dcff', dragon: '#c8e6a0', mills: '#ffe2b8', pier: '#ffd6d0', far: '#e8d0ff' };
/** The colour of the ground: soft grass with the island's accent, its edge stone, the bridges cloud-white (grey build). */
export function groundColor(x: number, z: number, out: THREE.Color): THREE.Color {
  const on = islandAt(x, z);
  if (!on) return out.copy(cloud);
  const i = ISLANDS[on];
  out.copy(grass).lerp(grass2, smoothstep(0.35, 0.7, fbm(x * 0.08, z * 0.08, 2))).lerp(C(ACCENT[on]), 0.45);
  out.lerp(cloud, 1 - smoothstep(1.2, 2.2, pathDist(x, z)));
  return out.lerp(stone, smoothstep(i.r - RAIL - 0.6, i.r - 0.2, Math.hypot(x - i.x, z - i.z)));
}

export interface Collider { x: number; z: number; r: number }
/** The round obstacles of the islands (the castle, the towers, the mills, characters); emptied as the world is left (./index.ts). */
export const colliders: Collider[] = [];

/**
 * The nearest place to `p` a walker of `radius` stands on whole: inside an island by RAIL and its radius (the cloud rail
 * on the edge), or on a bridge's deck by its radius. The islands and the decks are round and straight shapes, so the
 * nearest point of each is taken and the nearest of them kept.
 */
export function keepOn(p: { x: number; z: number }, radius: number): void {
  let best: { x: number; z: number } | null = null, bestD = Infinity;
  for (const [, i] of islands) {
    const max = i.r - RAIL - radius, dx = p.x - i.x, dz = p.z - i.z, d = Math.hypot(dx, dz);
    if (d <= max) return;
    const q = d > 1e-9 ? { x: i.x + (dx / d) * max, z: i.z + (dz / d) * max } : { x: i.x, z: i.z };
    const e = Math.hypot(q.x - p.x, q.z - p.z);
    if (e < bestD) { bestD = e; best = q; }
  }
  for (const [ka, kb] of BRIDGES) {
    const a = ISLANDS[ka], b = ISLANDS[kb], f = bridgeFrame(a, b, p.x, p.z), half = BRIDGE_W / 2 - radius;
    const along = Math.max(0, Math.min(f.len, f.along)), across = Math.max(-half, Math.min(half, f.across));
    if (along === f.along && across === f.across) return;
    const q = { x: a.x + f.ax * along - f.az * across, z: a.z + f.az * along + f.ax * across };
    const e = Math.hypot(q.x - p.x, q.z - p.z);
    if (e < bestD) { bestD = e; best = q; }
  }
  if (best) { p.x = best.x; p.z = best.z; }
}

/** Keeps a walker out of the obstacles and on the islands and the bridges. */
export function resolve(p: { x: number; z: number }, radius: number) {
  for (const c of colliders) {
    const dx = p.x - c.x, dz = p.z - c.z, min = c.r + radius, d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2); p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
  }
  keepOn(p, radius);
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

/** The tops of the islands as one mesh, coloured by vertex: a disc of rings for each, at its relief. */
export function buildGround(rings = 14, sectors = 40): THREE.Mesh {
  const pos: number[] = [], col: number[] = [], idx: number[] = [], c = new THREE.Color();
  for (const [, i] of islands) {
    const base = pos.length / 3;
    const put = (x: number, z: number) => { pos.push(x, height(x, z), z); groundColor(x, z, c); col.push(c.r, c.g, c.b); };
    put(i.x, i.z);
    for (let r = 1; r <= rings; r++) for (let s = 0; s < sectors; s++) {
      const a = (s / sectors) * Math.PI * 2, d = (i.r * r) / rings * 0.999;
      put(i.x + Math.sin(a) * d, i.z + Math.cos(a) * d);
    }
    const at = (r: number, s: number) => base + 1 + (r - 1) * sectors + (s % sectors);
    for (let s = 0; s < sectors; s++) idx.push(base, at(1, s + 1), at(1, s));
    for (let r = 1; r < rings; r++) for (let s = 0; s < sectors; s++) idx.push(at(r, s), at(r, s + 1), at(r + 1, s + 1), at(r, s), at(r + 1, s + 1), at(r + 1, s));
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 }));
  mesh.receiveShadow = true;
  mesh.name = 'sky-ground';
  return mesh;
}

/** m: the sea of clouds reaches this far past the half of the map, into the fog. */
export const SEA_REACH = HALF * 2.5;
