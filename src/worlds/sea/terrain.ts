import * as THREE from 'three';
import { uTier, uTime } from '../../core/materials';
import { fbm, smoothstep } from '../../core/util';
import type { WorldGround } from '../../game/world';
import { EDGE, HALF, HOLD, PATHS, ZONES, type Place } from './layout';

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

/** Inside the hold (./hold.ts): its floor and walls, not the sea's. */
export const inHold = (x: number, z: number) => Math.abs(x - HOLD.x) < HOLD.half + 2 && Math.abs(z - HOLD.z) < HOLD.half + 2;
/**
 * How far past the hold's walls its floor is the ground, m: as far as the camera behind her goes in it - the camera is
 * kept over the ground (src/game/camera.ts), and out there the floor is the rim of the sea, 22 m up.
 */
export const HOLD_CAMERA_REACH = 6;
const underHold = (x: number, z: number) => Math.abs(x - HOLD.x) < HOLD.half + HOLD_CAMERA_REACH && Math.abs(z - HOLD.z) < HOLD.half + HOLD_CAMERA_REACH;

export function height(x: number, z: number): number {
  if (underHold(x, z)) return HOLD.y;
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

/** A round obstacle; `under`: it stops only what is lower than this height (a rock she swims over the top of). */
export interface Collider { x: number; z: number; r: number; under?: number }
/** The round obstacles of the sea (rocks, corals, towers, characters); emptied as the world is left (./index.ts). */
export const colliders: Collider[] = [];

/**
 * A rock she can be on (./secrets.ts): its flat top of radius `r` at height `top`, its side running down to the floor
 * over `slope` m (0: a cliff). Emptied as the world is left.
 */
export interface Top { x: number; z: number; r: number; top: number; slope: number }
export const tops: Top[] = [];
/** m: how far under a top's height her feet may be and still be carried onto it (a mound's side; a cliff she is lifted up). */
export const TOP_FROM = 1;

/** The height of the tops at (x, z) for feet at `feet` (WorldGround.support), null where none carries her. */
export function support(x: number, z: number, feet: number): number | null {
  let best: number | null = null;
  for (const t of tops) {
    const d = Math.hypot(x - t.x, z - t.z);
    let y: number | null = null;
    if (d <= t.r) y = t.top;
    else if (t.slope > 0 && d < t.r + t.slope) {
      const floor = height(x, z);
      y = floor + (t.top - floor) * 0.5 * (1 + Math.cos(Math.PI * (d - t.r) / t.slope));
    }
    if (y !== null && feet >= y - TOP_FROM && (best === null || y > best)) best = y;
  }
  return best;
}

/** Keeps a swimmer out of the obstacles and inside the map (a point with `y` over a collider's `under` passes it). */
export function resolve(p: { x: number; z: number; y?: number }, radius: number) {
  for (const c of colliders) {
    if (c.under !== undefined && p.y !== undefined && p.y >= c.under) continue;
    const dx = p.x - c.x, dz = p.z - c.z, min = c.r + radius, d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) { const d = Math.sqrt(d2); p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min; }
  }
  // the hold: its walls, not the edge of the sea
  if (inHold(p.x, p.z)) {
    const m = HOLD.half - radius;
    p.x = Math.min(HOLD.x + m, Math.max(HOLD.x - m, p.x)); p.z = Math.min(HOLD.z + m, Math.max(HOLD.z - m, p.z));
    return;
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
  height, resolve, raycast, support,
  block: (x, z, r) => { colliders.push({ x, z, r }); },
};

/** The floor as one mesh, coloured by vertex: the map and the rim around it. */
/**
 * The colour of the caustics: a bright turquoise the sand is mixed towards on their lines (the sand itself stays warm
 * between them). Added on top, any colour went white over the bright sand.
 */
export const CAUSTIC_COLOR = '#4fd6d0';
/** How far the sand goes towards CAUSTIC_COLOR on the brightest lines (0..1). */
export const CAUSTIC_STRENGTH = 0.45;
/** The strength the floor's shader draws them at: the sea's magic dims them with no pearls (./magic.ts). */
export const uCaustic = { value: CAUSTIC_STRENGTH };
/**
 * How muted the sea's floor and kelp are (./magic.ts: with no pearls): 0 - their colours as taken, 1 - grey; below 0
 * a little richer. Their lit colour goes toward its own grey, a little cold, before the haze - the haze stays as it is.
 */
export const uMute = { value: 0 };
/** The GLSL of it, for a fragment shader's `outgoingLight` before `#include <opaque_fragment>` (uniform float uMute). */
export const MUTE_GLSL = 'outgoingLight = max(vec3(0.0), mix(outgoingLight, vec3(dot(outgoingLight, vec3(0.3, 0.59, 0.11))) * vec3(0.94, 0.99, 1.06), uMute));';

/**
 * Turquoise caustics on the sand (the customer, 2026-11-21: "д) turquoise caustics"): the light the waves above focus
 * into a net of bright lines that sways slowly. Drawn by the floor's own shader - no texture, no mesh, no draw call more:
 * three crossing waves of the world position, bent by two slow ones; the light is the thin ridges where their sum is
 * near zero. It runs on the game's time (uTime: it stands with the game). On the weakest tier (q0) it is left out - one
 * uniform branch skips it, the floor costs what it cost.
 */
export function causticMaterial<M extends THREE.MeshStandardMaterial>(m: M): M {
  const color = new THREE.Color(CAUSTIC_COLOR);
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uTier = uTier;
    sh.uniforms.uCaustic = uCaustic;
    sh.uniforms.uMute = uMute;
    sh.vertexShader = 'varying vec2 vCausticAt;\n' + sh.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n  vCausticAt = (modelMatrix * vec4(position, 1.0)).xz;');
    sh.fragmentShader = `uniform float uTime;
uniform float uTier;
uniform float uCaustic;
uniform float uMute;
varying vec2 vCausticAt;
float caustic(vec2 p, float t) {
  p *= 0.42;
  vec2 q = p + vec2(sin(t * 0.31 + p.y * 1.3), cos(t * 0.27 + p.x * 1.1)) * 0.55;
  float a = sin(q.x * 2.1 + t * 0.45) + sin(q.y * 2.3 - t * 0.38) + sin((q.x + q.y) * 1.6 + t * 0.29);
  return pow(clamp(1.0 - abs(a) * 0.9, 0.0, 1.0), 5.0);
}
` + sh.fragmentShader.replace('#include <opaque_fragment>', `if (uTier > 0.5) outgoingLight = mix(outgoingLight, vec3(${color.r.toFixed(4)}, ${color.g.toFixed(4)}, ${color.b.toFixed(4)}) * 1.2, caustic(vCausticAt, uTime) * uCaustic);
  ${MUTE_GLSL}
  #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'sea-caustics';
  return m;
}

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
  const mesh = new THREE.Mesh(geo, causticMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95 })));
  mesh.receiveShadow = true;
  mesh.name = 'sea-ground';
  return mesh;
}
