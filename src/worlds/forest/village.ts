import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { facets, mat } from '../../core/style';

/**
 * The gnomes' mushroom houses and the elder's mushroom tower (plan B of the forest's look, 2026-11-21; the customer's
 * decision: our own shapes, docs/worlds/style.md): a stem of plaster, a red cap with white spots, a wooden door, round
 * windows lit from inside (mat.glow - no new light, WORLD-09). A shape is a few geometries, one per material, each the
 * parts of that material merged: the five houses are five instanced draws (the cap's the only shadow), the tower five meshes.
 */
export const CAP_RED = '#d8443a';
export const TOWER_RED = '#e0392f';

/** One house of height `h` (its cap's top), `r` its stem's radius: the geometries by material, standing at 0, its door to +z. */
export function mushroomHouse(h: number, r: number, windows: number): Record<'stem' | 'cap' | 'spots' | 'door' | 'glow', THREE.BufferGeometry> {
  const stemH = h * 0.62, capR = r * 1.95, capH = h - stemH + 0.35, n = facets(capR * 2);
  const stem = new THREE.CylinderGeometry(r * 0.9, r * 1.1, stemH, facets(r * 2)).translate(0, stemH / 2, 0);
  // the cap: a dome over the stem, its rim a little below the stem's top
  const cap = new THREE.SphereGeometry(1, n, Math.max(3, Math.round(n / 4)), 0, Math.PI * 2, 0, Math.PI / 2).scale(capR, capH, capR).translate(0, stemH - 0.35, 0);
  const spots: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 9; i++) {
    const a = i * 2.39996, e = 0.35 + (i % 3) * 0.22;           // round the cap, three rings of height
    const s = new THREE.SphereGeometry(capR * 0.1, 6, 3).scale(1, 0.45, 1);
    // on the dome: its point at angle e from the top, the spot turned to lie on it
    const p = new THREE.Vector3(Math.sin(a) * Math.sin(e) * capR, stemH - 0.35 + Math.cos(e) * capH, Math.cos(a) * Math.sin(e) * capR);
    s.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(p.x / capR, (p.y - stemH + 0.35) / capH, p.z / capR).normalize()));
    spots.push(s.translate(p.x, p.y, p.z));
  }
  const doorH = Math.min(1.5, stemH * 0.62);
  const door = new THREE.BoxGeometry(0.75, doorH, 0.12).translate(0, doorH / 2, r * 1.02);
  const glow: THREE.BufferGeometry[] = [];
  for (let i = 0; i < windows; i++) {
    const a = (i % 2 ? -1 : 1) * (0.9 + Math.floor(i / 2) * 0.5), y = stemH * (0.55 + Math.floor(i / 2) * 0.22);
    glow.push(new THREE.CircleGeometry(0.22, 10).translate(0, 0, 0).rotateY(a).translate(Math.sin(a) * r * 1.0, y, Math.cos(a) * r * 1.0));
  }
  return { stem, cap, spots: mergeGeometries(spots)!, door, glow: mergeGeometries(glow)! };
}

/** The materials of a house: the style's, shared (src/core/style.ts). */
const materials = (red: string) => ({
  stem: mat.cloth('plaster'), cap: mat.cloth(red as `#${string}`), spots: mat.cloth('white'), door: mat.wood('door'), glow: mat.glow('gold', 0.8),
});

/** The houses at `puts` (where, turned how): one instanced mesh a material; those of the walls and the cap cast a shadow. */
export function buildHouses(scene: THREE.Scene, puts: readonly { x: number; y: number; z: number; rot: number }[]) {
  const geos = mushroomHouse(3.6, 1.2, 2), mats = materials(CAP_RED);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), one = new THREE.Vector3(1, 1, 1);
  for (const key of Object.keys(geos) as (keyof typeof geos)[]) {
    const mesh = new THREE.InstancedMesh(geos[key], mats[key], puts.length);
    puts.forEach((p, i) => mesh.setMatrixAt(i, m.compose(new THREE.Vector3(p.x, p.y, p.z), q.setFromAxisAngle(up, p.rot), one)));
    mesh.name = `house-${key}`; mesh.castShadow = key === 'cap'; mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
}

/** The elder's tower: the same house, tall, with windows up its stem; a group named for the landmark (WORLD-10). */
export function buildTower(): THREE.Group {
  const geos = mushroomHouse(8.8, 1.45, 6), mats = materials(TOWER_RED), g = new THREE.Group();
  for (const key of Object.keys(geos) as (keyof typeof geos)[]) {
    const mesh = new THREE.Mesh(geos[key], mats[key]);
    mesh.castShadow = key === 'cap'; mesh.receiveShadow = true;
    g.add(mesh);
  }
  g.name = 'landmark-village';
  return g;
}
