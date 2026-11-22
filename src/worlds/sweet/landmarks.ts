/**
 * The two landmarks of the Sweet Land seen from far (WORLD-10, docs/worlds/world-4.md), the grey build: the cake
 * palace - three tiers and a candle tower CAKE.top m high behind the shrine, seen from everywhere - and Kakao's mill on
 * the river, its wings MILL.wingR m long turning by code. Simple shapes at their real sizes; each landmark is one mesh
 * of baked vertex colours (one draw call however many parts), the mill's wings and the candle's flame a mesh of their
 * own each, as they move or light. The names are the ones tools/sweet-grey.mjs looks for: `landmark-palace`,
 * `landmark-mill`, `mill-wings`.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CAKE, MILL, MILLSTONE } from './layout';
import { colliders, height } from './terrain';

/** A part of a painted shape: a geometry in the shape's own metres, and its colour. */
export type Part = [THREE.BufferGeometry, string];

/** The shared material of the painted shapes: the colour is the vertices'. */
let shared: THREE.MeshStandardMaterial | null = null;
export const paintMaterial = () => (shared ??= new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85, flatShading: true }));

/** Parts of one colour each merged into one geometry with a colour per vertex (no uv: nothing is textured). */
export function paint(parts: readonly Part[]): THREE.BufferGeometry {
  const geos = parts.map(([g, hex]) => {
    const flat = g.index ? g.toNonIndexed() : g.clone();
    flat.deleteAttribute('uv');
    if (!flat.getAttribute('normal')) flat.computeVertexNormals();
    const c = new THREE.Color(hex), n = flat.getAttribute('position').count, col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
    flat.setAttribute('color', new THREE.BufferAttribute(col, 3));
    return flat;
  });
  return mergeGeometries(geos, false)!;
}

/** A painted shape standing on the ground at (x, z), named, casting and taking shadows. */
export function paintedAt(scene: THREE.Scene, name: string, x: number, z: number, parts: readonly Part[], yaw = 0): THREE.Mesh {
  const m = new THREE.Mesh(paint(parts), paintMaterial());
  m.name = name; m.castShadow = true; m.receiveShadow = true;
  m.position.set(x, height(x, z), z); m.rotation.y = yaw;
  scene.add(m);
  return m;
}

/** Zone accents of the document: the palace pastel cake and cream, the river and the mill chocolate and waffles. */
const CAKE_COLOURS = ['#f8c8d8', '#fff1d6', '#f7b2c9'] as const, CREAM = '#fffaf2', CANDLE = '#ff8fb1', CHOC = '#6b4226', WAFFLE = '#d9a45b';

export interface Landmarks {
  /** The candle's flame: lit at the finale (the Ruby gathered on it). */
  flame: THREE.Mesh;
  /** The world point where the rubies gather: the top of the candle. */
  candleTop: THREE.Vector3;
  /** Turns the mill's wings by `turns` radians a second over `dt` s (stands still at 0). */
  turn(dt: number, speed: number): void;
}

/** The cake palace and the mill in the scene, and their colliders. */
export function buildLandmarks(scene: THREE.Scene): Landmarks {
  // ----- the cake palace: tiers one on another, cream rims, the candle tower on the top -----
  const parts: Part[] = [];
  let y = 0;
  CAKE.tiers.forEach((t, i) => {
    parts.push([new THREE.CylinderGeometry(t.r, t.r, t.h, 20).translate(0, y + t.h / 2, 0), CAKE_COLOURS[i]]);
    parts.push([new THREE.TorusGeometry(t.r, 0.28, 5, 20).rotateX(Math.PI / 2).translate(0, y + t.h, 0), CREAM]);
    y += t.h;
  });
  const candleH = CAKE.top - y - 0.4;   // the wick's top at CAKE.top
  parts.push([new THREE.CylinderGeometry(CAKE.candleR, CAKE.candleR, candleH, 10).translate(0, y + candleH / 2, 0), CANDLE]);
  // the candle's stripes: white rings up the tower, as a birthday candle
  for (let k = 1; k < 6; k++) parts.push([new THREE.TorusGeometry(CAKE.candleR + 0.02, 0.09, 4, 10).rotateX(Math.PI / 2).translate(0, y + (candleH * k) / 6, 0), CREAM]);
  const wick = y + candleH;
  parts.push([new THREE.CylinderGeometry(0.06, 0.06, 0.4, 5).translate(0, wick + 0.2, 0), '#4a3020']);
  const cake = paintedAt(scene, 'landmark-palace', CAKE.x, CAKE.z, parts);
  for (const t of CAKE.tiers.slice(0, 1)) colliders.push({ x: CAKE.x, z: CAKE.z, r: t.r + 0.3 });
  // the flame: dark until the finale lights it (./index.ts)
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.9, 8).translate(0, 0.45, 0),
    new THREE.MeshStandardMaterial({ color: '#ffd27a', emissive: '#ff9d2e', emissiveIntensity: 1.4, roughness: 0.4 }));
  flame.name = 'candle-flame';
  flame.position.set(CAKE.x, cake.position.y + wick + 0.35, CAKE.z);
  flame.visible = false;
  scene.add(flame);

  // ----- the mill: a chocolate tower with a waffle roof by the river, its wings on a hub facing the river and the square -----
  const roofH = MILL.roofH;
  paintedAt(scene, 'landmark-mill', MILL.x, MILL.z, [
    [new THREE.CylinderGeometry(MILL.towerR * 0.8, MILL.towerR, MILL.towerH, 10).translate(0, MILL.towerH / 2, 0), CHOC],
    [new THREE.ConeGeometry(MILL.towerR * 1.15, roofH, 10).translate(0, MILL.towerH + roofH / 2, 0), WAFFLE],
    [new THREE.BoxGeometry(1.2, 2, 0.3).translate(0, 1, MILL.towerR - 0.05), '#3a2414'],      // the door, south, toward the millstone
  ]);
  colliders.push({ x: MILL.x, z: MILL.z, r: MILL.towerR + 0.3 });
  // the wings: four waffle sails on a hub out of the tower's west side, the side of the square and the river
  const wingParts: Part[] = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2;
    wingParts.push([new THREE.BoxGeometry(0.16, MILL.wingR, 1.3).translate(0, MILL.wingR / 2 + 0.5, 0).rotateX(a), WAFFLE]);
  }
  wingParts.push([new THREE.CylinderGeometry(0.45, 0.45, 0.6, 8).rotateZ(Math.PI / 2), CHOC]);
  const wings = new THREE.Mesh(paint(wingParts), paintMaterial());
  wings.name = 'mill-wings'; wings.castShadow = true;
  const hubY = height(MILL.x, MILL.z) + MILL.towerH;
  wings.position.set(MILL.x - MILL.towerR - 0.4, hubY, MILL.z);
  scene.add(wings);
  // the millstone by the door: ruby 4 lies in it (WORLD-08; ./index.ts RUBIES)
  paintedAt(scene, 'millstone', MILLSTONE.x, MILLSTONE.z, [
    [new THREE.CylinderGeometry(1, 1, 0.45, 14).translate(0, 0.22, 0), '#a08a78'],
    [new THREE.CylinderGeometry(0.22, 0.22, 0.5, 8).translate(0, 0.25, 0), '#5a4a3c'],
  ]);
  colliders.push({ x: MILLSTONE.x, z: MILLSTONE.z, r: 0.9 });

  return {
    flame,
    candleTop: new THREE.Vector3(CAKE.x, cake.position.y + wick + 0.6, CAKE.z),
    turn: (dt, speed) => { wings.rotation.x += dt * speed; },
  };
}
