import * as THREE from 'three';
import { mulberry32 } from '../../core/util';
import { PATHS, ZONES } from './layout';
import { height, pathDist } from './terrain';

/**
 * The fireflies of the forest (plan C of its look, 2026-11-21; world-2.md: "the owl's blue fireflies", the evening):
 * warm ones over the glades and along the edges of the paths, the owl's glade blue. One instanced mesh of tiny glowing
 * balls for all of them (one draw call, no shadow, no light of their own - WORLD-09), each drifting round its place and
 * pulsing; drawn whatever the camera looks at (their bounds move), a few thousand triangles in all.
 */
export const WARM = '#ffe9a0';
export const BLUE = '#7fd0ff';
/** m: how high they float - over her head: at her height one showed on her face in the frame of the owl's steps. */
export const FLY_LOW = 2.1;
export const FLY_HIGH = 3.4;

export interface Fly { x: number; z: number; y: number; blue: boolean; phase: number; r: number }

/** Where they float, deterministic: round every glade, along the edges of the paths, a cloud of blue ones by the owl. */
export function placeFlies(seed = 23): Fly[] {
  const rnd = mulberry32(seed), out: Fly[] = [];
  const at = (x: number, z: number, blue: boolean) => out.push({ x, z, y: FLY_LOW + rnd() * (FLY_HIGH - FLY_LOW), blue, phase: rnd() * Math.PI * 2, r: 0.3 + rnd() * 0.7 });
  for (const [id, p] of Object.entries(ZONES)) {
    const n = id === 'owl' ? 16 : 6;
    for (let i = 0; i < n; i++) { const a = rnd() * Math.PI * 2, d = 2 + rnd() * 5; at(p.x + Math.cos(a) * d, p.z + Math.sin(a) * d, id === 'owl'); }
  }
  for (const line of PATHS) for (let i = 0; i < line.length - 1; i++) {
    const a = line[i], b = line[i + 1], len = Math.hypot(b.x - a.x, b.z - a.z);
    for (let d = 4; d < len; d += 7) {
      const t = d / len, side = rnd() < 0.5 ? -1 : 1, off = 2 + rnd() * 2.5;
      const x = a.x + (b.x - a.x) * t - ((b.z - a.z) / len) * off * side, z = a.z + (b.z - a.z) * t + ((b.x - a.x) / len) * off * side;
      if (pathDist(x, z) > 1.5) at(x, z, false);
    }
  }
  return out;
}

/** The fireflies in the scene; `update(time)` moves and pulses them every frame. */
export function buildFireflies(scene: THREE.Scene, flies = placeFlies()) {
  const mesh = new THREE.InstancedMesh(new THREE.SphereGeometry(0.1, 6, 4), new THREE.MeshBasicMaterial({ toneMapped: false }), flies.length);
  mesh.name = 'fireflies'; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  const warm = new THREE.Color(WARM), blue = new THREE.Color(BLUE), c = new THREE.Color();
  const base = flies.map((f) => height(f.x, f.z));
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const update = (time: number) => {
    flies.forEach((f, i) => {
      const t = time * 0.6 + f.phase;
      p.set(f.x + Math.cos(t) * f.r, base[i] + f.y + Math.sin(t * 1.7) * 0.25, f.z + Math.sin(t * 0.8) * f.r);
      // a slow pulse: never quite out, so a frame never loses them all
      const glow = 0.55 + 0.45 * Math.sin(time * 2.3 + f.phase * 3);
      mesh.setMatrixAt(i, m.compose(p, q, s.setScalar(0.7 + 0.5 * glow)));
      mesh.setColorAt(i, c.copy(f.blue ? blue : warm).multiplyScalar(0.6 + 0.6 * glow));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };
  update(0);
  scene.add(mesh);
  return { mesh, flies, update };
}
