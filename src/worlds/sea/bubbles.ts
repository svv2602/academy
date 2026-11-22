import * as THREE from 'three';
import { LANDMARKS, ZONES } from './layout';
import { height } from './terrain';

/**
 * Columns of bubbles rising from the shells, the corals and the crab's pots (docs/worlds/world-3.md; step C of the sea's
 * look): each column a stream of little clear spheres wobbling up toward the light, gone at the top. One instanced
 * mesh - one draw call - for all of them, no shadow; the magic brings more of them (`share`: 1-2 pearls).
 */

/** Where the columns rise: the garden's great shell and two of its shells, three corals of the reef, two of the crab's pots, the square: nine. */
export function bubbleSources(): THREE.Vector3[] {
  const at = (x: number, z: number, y = 0.3) => new THREE.Vector3(x, height(x, z) + y, z);
  const g = LANDMARKS.garden, r = ZONES.reef, sq = ZONES.square;
  return [
    at(g.x + 0.4, g.z + 0.6, 1.4), at(ZONES.garden.x + 3, ZONES.garden.z + 1), at(ZONES.garden.x - 2, ZONES.garden.z + 4),
    at(r.x - 7, r.z + 2), at(r.x + 1, r.z - 7), at(r.x - 3, r.z + 8),
    // the soup of two of the crab's pots (./landmarks.ts grotto) bubbles
    at(ZONES.grotto.x - 1.5, ZONES.grotto.z - 2.5, 0.55), at(ZONES.grotto.x + 1.5, ZONES.grotto.z - 2.5, 0.55), at(sq.x + 5, sq.z - 4),
  ];
}

/** Bubbles in a column; m they rise; m/s; the part of each column up with no magic. */
export const PER_COLUMN = 9, RISE = 6, SPEED = 0.9, BUBBLES_LEAST = 0.45;

export function buildBubbles(scene: THREE.Scene, sources: readonly THREE.Vector3[] = bubbleSources()) {
  const n = sources.length * PER_COLUMN;
  const mat = new THREE.MeshStandardMaterial({ color: '#eafcff', emissive: '#bff4ff', emissiveIntensity: 0.25, roughness: 0.1, transparent: true, opacity: 0.55, depthWrite: false });
  mat.name = 'sea-bubbles';
  const mesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.06, 1), mat, Math.max(1, n));
  mesh.name = 'sea-bubbles'; mesh.frustumCulled = false; mesh.castShadow = false; mesh.receiveShadow = false;
  scene.add(mesh);
  let share = BUBBLES_LEAST;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
  const update = (time: number) => {
    const each = Math.max(1, Math.round(PER_COLUMN * share));
    let i = 0;
    sources.forEach((src, c) => {
      for (let b = 0; b < each; b++) {
        // spread over the column evenly in time: a bubble every RISE / SPEED / PER_COLUMN s
        const k = ((time * SPEED) / RISE + b / PER_COLUMN + c * 0.137) % 1, y = k * RISE;
        const w = Math.sin(time * 3 + b * 1.7 + c) * 0.08 * (0.3 + k);
        p.set(src.x + w, src.y + y, src.z + Math.cos(time * 2.6 + b) * 0.06 * (0.3 + k));
        // they grow a little as they rise, and are gone at the top
        s.setScalar((0.6 + k * 0.8 + (b % 3) * 0.25) * (k > 0.9 ? (1 - k) * 10 : 1));
        mesh.setMatrixAt(i++, m.compose(p, q, s));
      }
    });
    mesh.count = i; mesh.instanceMatrix.needsUpdate = true;
  };
  update(0);
  return { mesh, update, share: (k: number) => { share = BUBBLES_LEAST + (1 - BUBBLES_LEAST) * Math.min(1, Math.max(0, k)); } };
}
