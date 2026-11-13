import * as THREE from 'three';
import { fbm, lerp, smoothstep, vnoise } from '../core/util';

/** Layout of the Fairy Kingdom slice, in metres. +Z is "towards the camera" at spawn. */
export const WORLD_R = 74;
export const SPAWN = { x: 0, z: 14 };
export const POND = { x: 15, z: -19, r: 9.5 };
export const CASTLE = { x: -8, z: -60 };
export const UNICORN = { x: 5.2, z: -11.5 };
export const PATCH = { x: -1.5, z: -15.5 };   // flower patch where the task butterflies fly
export const CRYSTAL = { x: 2.2, z: -9.2 };
export const CHEST = { x: -31, z: 6 };        // optional secret behind the birches
const POND_LEVEL = 0.2;
export const WATER_Y = POND_LEVEL - 0.38;
const PATH: [number, number][] = [[0, 16], [1, 5], [3.5, -5], [2, -13], [-4, -27], [-8, -42], [-8, -53]];

export function pathDist(x: number, z: number) {
  let best = 1e9;
  for (let i = 0; i < PATH.length - 1; i++) {
    const [ax, az] = PATH[i], [bx, bz] = PATH[i + 1];
    const dx = bx - ax, dz = bz - az;
    const t = Math.max(0, Math.min(1, ((x - ax) * dx + (z - az) * dz) / (dx * dx + dz * dz)));
    best = Math.min(best, Math.hypot(x - ax - dx * t, z - az - dz * t));
  }
  return best + (vnoise(x * 0.5, z * 0.5) - 0.5) * 0.9;
}

export function height(x: number, z: number) {
  let h = (fbm(x * 0.028 + 7.3, z * 0.028 + 2.1) - 0.5) * 6 + (fbm(x * 0.12, z * 0.12, 2) - 0.5) * 0.5;
  const d = Math.hypot(x, z);
  const rim = smoothstep(WORLD_R - 6, WORLD_R + 40, d);
  h += rim * rim * 26 + smoothstep(WORLD_R - 6, WORLD_R + 10, d) * 2.5;
  const dc = Math.hypot(x - CASTLE.x, z - CASTLE.z);
  h = lerp(h, 4.5, 1 - smoothstep(11, 30, dc));
  const dp = Math.hypot(x - POND.x, z - POND.z);
  h = lerp(h, POND_LEVEL, 1 - smoothstep(POND.r + 1, POND.r + 11, dp));
  h -= 1.9 * (1 - smoothstep(POND.r - 4.5, POND.r + 0.6, dp));
  return h;
}

const C = (hex: string) => new THREE.Color(hex);
const grassA = C('#74c655'), grassB = C('#a6dd62'), grassC = C('#57b458'), pathC = C('#ecd49a'),
  sand = C('#f3e4b4'), bed = C('#4fa8a0'), far = C('#8fc7b4'), farTop = C('#b9dcd6');

export function groundColor(x: number, z: number, out: THREE.Color) {
  const n = fbm(x * 0.07 + 3, z * 0.07 + 9, 3), n2 = vnoise(x * 0.9, z * 0.9);
  out.copy(grassA).lerp(grassB, smoothstep(0.35, 0.7, n)).lerp(grassC, smoothstep(0.55, 0.9, n2) * 0.35);
  out.lerp(pathC, 1 - smoothstep(0.9, 1.9, pathDist(x, z)));
  const dp = Math.hypot(x - POND.x, z - POND.z);
  out.lerp(sand, 1 - smoothstep(POND.r + 0.2, POND.r + 2.2, dp + (n2 - 0.5)));
  out.lerp(bed, 1 - smoothstep(POND.r - 3.5, POND.r - 0.6, dp));
  const d = Math.hypot(x, z);
  out.lerp(far, smoothstep(WORLD_R, WORLD_R + 30, d)).lerp(farTop, smoothstep(WORLD_R + 25, WORLD_R + 70, d));
  return out;
}

/** Tiling painterly mottling multiplied over the vertex colours, so the ground isn't one flat tone up close. */
function detailTexture() {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d')!;
  g.fillStyle = '#e4e4e4'; g.fillRect(0, 0, N, N);
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const wrap = (draw: (dx: number, dy: number) => void) => { for (const dx of [-N, 0, N]) for (const dy of [-N, 0, N]) draw(dx, dy); };
  for (let i = 0; i < 260; i++) { // soft light/dark blotches
    const x = rnd() * N, y = rnd() * N, r = 14 + rnd() * 46, light = rnd() > 0.5;
    wrap((dx, dy) => {
      const gr = g.createRadialGradient(x + dx, y + dy, 0, x + dx, y + dy, r);
      gr.addColorStop(0, light ? 'rgba(255,255,255,.16)' : 'rgba(150,170,150,.16)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x + dx - r, y + dy - r, r * 2, r * 2);
    });
  }
  g.lineCap = 'round';
  for (let i = 0; i < 1500; i++) { // short blade-like strokes
    const x = rnd() * N, y = rnd() * N, a = -1.57 + (rnd() - 0.5) * 1.2, l = 4 + rnd() * 9;
    g.strokeStyle = rnd() > 0.5 ? 'rgba(255,255,255,.22)' : 'rgba(120,150,120,.22)'; g.lineWidth = 1 + rnd() * 1.5;
    wrap((dx, dy) => { g.beginPath(); g.moveTo(x + dx, y + dy); g.lineTo(x + dx + Math.cos(a) * l, y + dy + Math.sin(a) * l); g.stroke(); });
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

export function buildTerrain(segments: number) {
  const size = 320;
  const geo = new THREE.PlaneGeometry(size, size, segments, segments);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  // Pull vertices towards the centre so the play area gets most of the triangles.
  const col = new Float32Array(pos.count * 3), c = new THREE.Color();
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    let x = pos.getX(i), z = pos.getZ(i);
    const r = Math.hypot(x, z) / (size / 2);
    const k = 0.45 + 0.55 * Math.min(1, r) ** 1.5;
    x *= k; z *= k;
    pos.setXYZ(i, x, height(x, z), z);
    uv.setXY(i, x / 7, z / 7);
    groundColor(x, z, c);
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0, map: detailTexture() }));
  mesh.receiveShadow = true;
  return mesh;
}

export interface Collider { x: number; z: number; r: number; }
export const colliders: Collider[] = [];

/** Keeps a walker out of props, deep water and the hills around the valley. */
export function resolve(p: { x: number; z: number }, radius: number) {
  for (const c of colliders) {
    const dx = p.x - c.x, dz = p.z - c.z, min = c.r + radius;
    const d2 = dx * dx + dz * dz;
    if (d2 < min * min && d2 > 1e-6) {
      const d = Math.sqrt(d2);
      p.x = c.x + (dx / d) * min; p.z = c.z + (dz / d) * min;
    }
  }
  const dp = Math.hypot(p.x - POND.x, p.z - POND.z), wade = POND.r - 1.3;
  if (dp < wade) { p.x = POND.x + ((p.x - POND.x) / dp) * wade; p.z = POND.z + ((p.z - POND.z) / dp) * wade; }
  const d = Math.hypot(p.x, p.z);
  if (d > WORLD_R - 4) { p.x *= (WORLD_R - 4) / d; p.z *= (WORLD_R - 4) / d; }
}

/** Where a camera ray hits the ground (for tap-to-walk). */
export function raycastGround(origin: THREE.Vector3, dir: THREE.Vector3, out: THREE.Vector3) {
  let prev = 0;
  for (let t = 1; t < 160; t += 1) {
    const x = origin.x + dir.x * t, y = origin.y + dir.y * t, z = origin.z + dir.z * t;
    if (y < height(x, z)) {
      let lo = prev, hi = t;
      for (let i = 0; i < 12; i++) {
        const m = (lo + hi) / 2;
        if (origin.y + dir.y * m < height(origin.x + dir.x * m, origin.z + dir.z * m)) hi = m; else lo = m;
      }
      out.set(origin.x + dir.x * hi, 0, origin.z + dir.z * hi);
      out.y = height(out.x, out.z);
      return true;
    }
    prev = t;
  }
  return false;
}
