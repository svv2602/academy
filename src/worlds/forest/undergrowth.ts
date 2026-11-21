import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { staticGeo } from '../../core/assets';
import { fadeAtCamera, propMaterial } from '../../core/materials';
import { mulberry32 } from '../../core/util';
import { HALF, OWL_TREE, ZONES, inMaze } from './layout';
import { colliders, height, pathDist, streamDist } from './terrain';

/**
 * The undergrowth of the forest (plan B of its look, 2026-11-21): bushes, plants, flowers, mossy stones and logs of
 * Quaternius' Ultimate Nature (CC0, the forest's own files: models-src/forest/plants/). Near her only: the map is cut
 * into cells of CELL m, every plant of a cell is baked into one geometry of flat colours (one draw call a cell, whatever
 * its kinds), and a cell is drawn only while its middle is within RANGE m (and its half-diagonal) of her. No shadow: a
 * shadow of every leaf would double what it costs, for a look the ground already gives.
 */
export const PLANTS = [
  ['plants/Bush_1', 0.9, 5], ['plants/Bush_2', 0.8, 5], ['plants/Plant_1', 0.6, 5], ['plants/Plant_4', 0.7, 4],
  ['plants/Flowers', 0.4, 6], ['plants/Rock_Moss_1', 0.45, 2], ['plants/Rock_Moss_2', 0.4, 2],
  ['plants/BushBerries_1', 0.9, 1], ['plants/WoodLog_Moss', 0.5, 1],
] as const;
/** m: the side of a cell of the undergrowth, and how far from her a cell is drawn. */
export const CELL = 16;
export const RANGE = 20;
/** m off the middle of a path: nothing grows there - the camera walks the paths behind her, a bush at its lens fills the frame. */
export const PATH_CLEAR = 2.4;
/** m² of the map a plant. */
export const PLANT_AREA = 9;

export interface Plant { k: number; x: number; z: number; s: number; rot: number }

/** Where the plants grow, deterministic: off the paths, the stream, the zones' middles, the maze and what stands. */
export function placePlants(seed = 11): Plant[] {
  const rnd = mulberry32(seed), out: Plant[] = [];
  const weights = PLANTS.map((p) => p[2]), sum = weights.reduce((a, b) => a + b, 0);
  const zones = Object.values(ZONES);
  const want = Math.round((Math.PI * HALF * HALF) / PLANT_AREA);
  for (let tries = 0; out.length < want && tries < want * 20; tries++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (HALF - 2), x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (pathDist(x, z) < PATH_CLEAR || streamDist(x, z) < 1.2 || inMaze(x, z, 1.5) || Math.hypot(OWL_TREE.x - x, OWL_TREE.z - z) < 3) continue;
    if (zones.some((p) => Math.hypot(p.x - x, p.z - z) < 3.5)) continue;
    if (colliders.some((c) => Math.hypot(c.x - x, c.z - z) < c.r + 0.3)) continue;
    let pick = rnd() * sum, k = 0;
    while ((pick -= weights[k]) > 0) k++;
    out.push({ k, x, z, s: 0.75 + rnd() * 0.6, rot: rnd() * 6.28 });
  }
  return out;
}

/** The leaves of the undergrowth as the trees' of the evening (./scenery.ts), a shade deeper: not the pack's lime. */
const LEAVES = { Green: '#467f42', DarkGreen: '#35663a' };
export const loadUndergrowth = () => Promise.all(PLANTS.map(([p, h]) => staticGeo(`forest/${p}`, h, LEAVES)));

/** The undergrowth in the scene: its cells, and `near(x, z)` - every frame, which of them are drawn. */
export function buildUndergrowth(scene: THREE.Scene, geos: THREE.BufferGeometry[], plants = placePlants()) {
  const cells = new Map<string, Plant[]>();
  for (const p of plants) {
    const key = `${Math.floor(p.x / CELL)},${Math.floor(p.z / CELL)}`;
    (cells.get(key) ?? cells.set(key, []).get(key)!).push(p);
  }
  const material = propMaterial(0.25);
  // a bush at the lens or between the camera and her is looked through, as the trees are
  const sway = material.onBeforeCompile.bind(material);
  material.onBeforeCompile = (sh, r) => { sway(sh, r); fadeAtCamera(sh); };
  material.customProgramCacheKey = () => 'forest-undergrowth|sway|fade';
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), s = new THREE.Vector3();
  const meshes: THREE.Mesh[] = [];
  for (const [key, list] of cells) {
    const baked = list.map((p) => geos[p.k].clone().applyMatrix4(m.compose(v.set(p.x, height(p.x, p.z) - 0.03, p.z), q.setFromAxisAngle(up, p.rot), s.setScalar(p.s))));
    const geo = mergeGeometries(baked, false)!;
    baked.forEach((g) => g.dispose());
    geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, material);
    mesh.name = `undergrowth:${key}`; mesh.receiveShadow = true; mesh.visible = false;
    scene.add(mesh);
    meshes.push(mesh);
  }
  const reach = RANGE + (CELL * Math.SQRT2) / 2;
  const near = (x: number, z: number) => {
    for (const mesh of meshes) { const c = mesh.geometry.boundingSphere!.center; mesh.visible = Math.hypot(c.x - x, c.z - z) < reach; }
  };
  return { meshes, near };
}
