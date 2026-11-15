import * as THREE from 'three';
import type { Part } from '../core/assets';
import { propMaterial } from './materials';
import { height } from './terrain';

export interface Placement { x: number; z: number; s: number; rot: number; }

const CELL = 44, SMALL_CELL = 20;
/** Meshes of small props that are only drawn while the player is within `range` of their cell. */
const ranged: { mesh: THREE.Object3D; x: number; z: number; range: number }[] = [];
let drawRange = 1;
export function setDrawRange(k: number) { drawRange = k; }
export function updateRanged(px: number, pz: number) {
  for (const r of ranged) r.mesh.visible = Math.hypot(r.x - px, r.z - pz) < r.range * drawRange;
}

/**
 * Adds instances grouped into ground cells, so three.js can frustum-cull whole groups (also in the shadow pass).
 * With `range`, cells are small and vanish beyond that distance: ground clutter is invisible from afar anyway.
 */
export function instanced(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, all: Placement[], shadow: boolean, tints?: THREE.Color[], depth?: THREE.Material, range = 0) {
  const cells = new Map<string, number[]>();
  const size = range ? SMALL_CELL : CELL;
  all.forEach((it, i) => {
    const k = `${Math.floor(it.x / size)},${Math.floor(it.z / size)}`;
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(i);
  });
  for (const [k, idx] of cells) {
    const mesh = instancedCell(scene, geo, mat, idx.map((i) => all[i]), shadow, tints && idx.map((i) => tints[i]), depth);
    if (mesh && range) {
      const [cx, cz] = k.split(',').map(Number);
      ranged.push({ mesh, x: (cx + 0.5) * size, z: (cz + 0.5) * size, range: range + size * 0.7 });
    }
  }
}

function instancedCell(scene: THREE.Scene, geo: THREE.BufferGeometry, mat: THREE.Material, items: Placement[], shadow: boolean, tints?: THREE.Color[], depth?: THREE.Material) {
  if (!items.length) return;
  const mesh = new THREE.InstancedMesh(geo, mat, items.length);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  items.forEach((it, i) => {
    q.setFromAxisAngle(up, it.rot);
    m.compose(new THREE.Vector3(it.x, height(it.x, it.z) - 0.05, it.z), q, new THREE.Vector3(it.s, it.s, it.s));
    mesh.setMatrixAt(i, m);
    if (tints) mesh.setColorAt(i, tints[i]);
  });
  mesh.castShadow = shadow; mesh.receiveShadow = true;
  if (depth) mesh.customDepthMaterial = depth;
  mesh.computeBoundingSphere();
  scene.add(mesh);
  return mesh;
}

/** Instances every part of a textured model at the same placements. */
export function instancedParts(scene: THREE.Scene, parts: Part[], items: Placement[], sway: number, shadow: boolean, range = 0) {
  for (const p of parts) {
    const key = `${p.map?.uuid}|${p.cutout}|${sway}`;
    let mat = partMats.get(key);
    if (!mat) {
      mat = propMaterial(sway, { vertexColors: false, map: p.map, alphaTest: p.cutout ? 0.5 : 0, side: p.cutout ? THREE.DoubleSide : THREE.FrontSide, roughness: 0.9, color: p.map ? '#ffffff' : '#63c356' });
      if (p.cutout) {
        // Both sides of a leaf card are lit the same (no dark undersides).
        const wind = mat.onBeforeCompile;
        mat.onBeforeCompile = (sh, r) => {
          wind(sh, r);
          sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
            THREE.ShaderChunk.normal_fragment_begin.replace(/gl_FrontFacing \? 1\.0 : - ?1\.0/, '1.0'));
        };
        mat.customProgramCacheKey = () => 'leaf' + sway;
      }
      partMats.set(key, mat);
    }
    const depth = p.cutout && shadow ? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: p.map, alphaTest: 0.5 }) : undefined;
    instanced(scene, p.geo, mat, items, shadow, undefined, depth, range);
  }
}
const partMats = new Map<string, THREE.MeshStandardMaterial>();
