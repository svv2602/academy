import * as THREE from 'three';
import type { Part } from './assets';
import { propMaterial } from './materials';

export interface Placement { x: number; z: number; s: number; rot: number; }
/** The ground height of the world at x, z: every instance stands on it. */
export type Height = (x: number, z: number) => number;

const CELL = 44, SMALL_CELL = 20;
/** Meshes of small props that are only drawn while the player is within `range` of their cell. */
const ranged: { mesh: THREE.Object3D; x: number; z: number; range: number }[] = [];
let drawRange = 1;
export function setDrawRange(k: number) { drawRange = k; }
export function updateRanged(px: number, pz: number) {
  for (const r of ranged) r.mesh.visible = Math.hypot(r.x - px, r.z - pz) < r.range * drawRange;
}

/** A mesh of one ground cell and which of the placements (their indices, in their order) it holds. */
export interface Cell { mesh: THREE.InstancedMesh; idx: number[] }

/**
 * Adds instances grouped into ground cells, so three.js can frustum-cull whole groups (also in the shadow pass).
 * With `range`, cells are small and vanish beyond that distance: ground clutter is invisible from afar anyway.
 * Returns the cells: a cell keeps the order of `all`, so drawing only the first `mesh.count` of it draws a front part.
 */
export function instanced(scene: THREE.Scene, height: Height, geo: THREE.BufferGeometry, mat: THREE.Material, all: Placement[], shadow: boolean, tints?: THREE.Color[], depth?: THREE.Material, range = 0): Cell[] {
  const cells = new Map<string, number[]>();
  const size = range ? SMALL_CELL : CELL;
  all.forEach((it, i) => {
    const k = `${Math.floor(it.x / size)},${Math.floor(it.z / size)}`;
    (cells.get(k) ?? cells.set(k, []).get(k)!).push(i);
  });
  const out: Cell[] = [];
  for (const [k, idx] of cells) {
    const mesh = instancedCell(scene, height, geo, mat, idx.map((i) => all[i]), shadow, tints && idx.map((i) => tints[i]), depth);
    if (!mesh) continue;
    out.push({ mesh, idx });
    if (range) {
      const [cx, cz] = k.split(',').map(Number);
      ranged.push({ mesh, x: (cx + 0.5) * size, z: (cz + 0.5) * size, range: range + size * 0.7 });
    }
  }
  return out;
}

function instancedCell(scene: THREE.Scene, height: Height, geo: THREE.BufferGeometry, mat: THREE.Material, items: Placement[], shadow: boolean, tints?: THREE.Color[], depth?: THREE.Material) {
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

/** Instances every part of a textured model at the same placements; returns the cells of every part. */
/**
 * `saturation` below 1 greys the parts' colours toward their brightness (WORLD-10: a plant whose colour is louder than
 * the stars and the friends it would take the eye from).
 */
export function instancedParts(scene: THREE.Scene, height: Height, parts: Part[], items: Placement[], sway: number, shadow: boolean, range = 0, saturation = 1): Cell[] {
  const out: Cell[] = [];
  for (const p of parts) {
    const key = `${p.map?.uuid}|${p.cutout}|${sway}|${saturation}`;
    let mat = partMats.get(key);
    if (!mat) {
      mat = propMaterial(sway, { vertexColors: false, map: p.map, alphaTest: p.cutout ? 0.5 : 0, side: p.cutout ? THREE.DoubleSide : THREE.FrontSide, roughness: 0.9, color: p.map ? '#ffffff' : '#63c356' });
      // A leaf card is lit the same on both sides (no dark undersides); every part dissolves by the camera (NEAR_FADE).
      const base = mat.onBeforeCompile.bind(mat), cutout = p.cutout;
      mat.onBeforeCompile = (sh, r) => {
        base(sh, r);
        if (cutout) {
          sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>',
            THREE.ShaderChunk.normal_fragment_begin.replace(/gl_FrontFacing \? 1\.0 : - ?1\.0/, '1.0'));
        }
        sh.fragmentShader = sh.fragmentShader.replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
          ${NEAR_FADE_GLSL}`);
      };
      mat.customProgramCacheKey = () => `${cutout ? 'leaf' : 'part'}${sway}|near`;
      if (saturation !== 1) {
        const before = mat.onBeforeCompile, key0 = mat.customProgramCacheKey.bind(mat);
        mat.onBeforeCompile = (sh, r) => {
          before(sh, r);
          sh.fragmentShader = sh.fragmentShader.replace('#include <map_fragment>', `#include <map_fragment>
            diffuseColor.rgb = mix(vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), diffuseColor.rgb, ${saturation.toFixed(3)});`);
        };
        mat.customProgramCacheKey = () => key0() + '|sat' + saturation;
      }
      partMats.set(key, mat);
    }
    const depth = p.cutout && shadow ? new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: p.map, alphaTest: 0.5 }) : undefined;
    out.push(...instanced(scene, height, p.geo, mat, items, shadow, undefined, depth, range));
  }
  return out;
}
const partMats = new Map<string, THREE.MeshStandardMaterial>();

/**
 * m from the camera: a part of a textured model of the scenery (the leaves, the trunks and the crowns of the trees,
 * the bushes) nearer than `out` dissolves into a pattern of dots, nearer than `in` it is gone. When the camera behind
 * the heroine comes into a crown (the trees of the valley stand close; docs/perf.md, the glade 52 fps), what stands at
 * the lens no longer fills the screen - the camera keeps its place behind her, so it never comes up to the back of
 * her head. Never seen in play otherwise: the camera stands 5 m and more behind her. Shadows are not touched: they are
 * drawn by the depth materials.
 */
export const NEAR_FADE = { in: 1.0, out: 2.6 };
/**
 * The fragment code of NEAR_FADE (first in the part's material, before anything is read): the distance to the camera
 * (vViewPosition) against a 4x4 ordered dither, so a part thins evenly instead of fading through blending.
 */
export const NEAR_FADE_GLSL = `{
  float nearKeep = smoothstep(${NEAR_FADE.in.toFixed(2)}, ${NEAR_FADE.out.toFixed(2)}, length(vViewPosition));
  if (nearKeep < 1.0) {
    ivec2 q = ivec2(mod(gl_FragCoord.xy, 4.0));
    int k = q.x + q.y * 4;
    float bayer = float(k == 0 ? 0 : k == 1 ? 8 : k == 2 ? 2 : k == 3 ? 10 : k == 4 ? 12 : k == 5 ? 4 : k == 6 ? 14 : k == 7 ? 6
      : k == 8 ? 3 : k == 9 ? 11 : k == 10 ? 1 : k == 11 ? 9 : k == 12 ? 15 : k == 13 ? 7 : k == 14 ? 13 : 5) / 16.0 + 1.0 / 32.0;
    if (nearKeep < bayer) discard;
  }
}`;

/**
 * TECH-15: a world that leaves the scene takes its cells out of the distance list: `updateRanged` would go on
 * switching meshes nobody draws, and the list would hold them for good. `gone` tells which meshes left.
 */
export function forgetRanged(gone: (mesh: THREE.Object3D) => boolean): void {
  let kept = 0;
  for (const r of ranged) if (!gone(r.mesh)) ranged[kept++] = r;
  ranged.length = kept;
}

/** TECH-15: and its part materials out of the cache above, so a freed material is never handed out again. */
export function forgetPartMaterials(gone: (mat: THREE.Material) => boolean): void {
  for (const [key, mat] of partMats) if (gone(mat)) partMats.delete(key);
}
