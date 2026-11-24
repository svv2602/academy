/**
 * The two landmarks of the Sky Islands seen from far (WORLD-10, docs/worlds/world-5.md «Карта»), the grey build: the
 * observatory's tower with its clock and dome on the stargazer's island, seen from everywhere, and the airship at the
 * pier with its balloon raised. Simple shapes at their real sizes; each landmark is one mesh of baked vertex colours (one
 * draw call however many parts), the clock's hands a mesh of their own, as they move. The names are the ones
 * tools/sky-grey.mjs looks for: `landmark-observatory`, `clock-hands`, `landmark-pier`.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CLOCK, OBSERVATORY, SHIP } from './layout';
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

/** A painted shape standing at (x, y, z) - on the ground by default - named, casting and taking shadows. */
export function paintedAt(scene: THREE.Scene, name: string, x: number, z: number, parts: readonly Part[], yaw = 0, y = height(x, z)): THREE.Mesh {
  const m = new THREE.Mesh(paint(parts), paintMaterial());
  m.name = name; m.castShadow = true; m.receiveShadow = true;
  m.position.set(x, y, z); m.rotation.y = yaw;
  scene.add(m);
  return m;
}

/** The accents of the document: the observatory white stone with a violet dome, the airship's red balloon. */
const STONE = '#eef0fa', DOME = '#9c8cf0', GOLD = '#ffd166', FACE = '#fffaf0', HULL = '#a0683c', BALLOON = '#e8483c', SAIL = '#fff4e0';

export interface Landmarks {
  /** The world point where the rays gather: over the dome of the observatory. */
  starTop: THREE.Vector3;
  /** The clock's hands: still until the finale starts the clock (./index.ts). */
  hands: THREE.Mesh;
  /** The airship moored at the pier (it flies in WORLD-23 later). */
  ship: THREE.Mesh;
}

/** The observatory and the airship in the scene, and their colliders. */
export function buildLandmarks(scene: THREE.Scene): Landmarks {
  // ----- the observatory: a round tower, a gallery, the dome with a slit; the clock's face on its south side -----
  const { r, towerH, domeR } = OBSERVATORY;
  const faceY = towerH * 0.62;
  paintedAt(scene, 'landmark-observatory', OBSERVATORY.x, OBSERVATORY.z, [
    [new THREE.CylinderGeometry(r * 0.85, r, towerH, 14).translate(0, towerH / 2, 0), STONE],
    [new THREE.TorusGeometry(r * 0.95, 0.22, 5, 16).rotateX(Math.PI / 2).translate(0, towerH, 0), GOLD],
    [new THREE.SphereGeometry(domeR, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, towerH, 0), DOME],
    [new THREE.BoxGeometry(0.5, domeR * 0.9, domeR * 2.02).translate(0, towerH + domeR * 0.45, 0), '#4a3f8a'],
    // the clock: a disc with a golden rim on the tower's face toward the castle (south, +z)
    [new THREE.CylinderGeometry(1.6, 1.6, 0.2, 20).rotateX(Math.PI / 2).translate(0, faceY, r * 0.95), FACE],
    [new THREE.TorusGeometry(1.6, 0.14, 5, 20).translate(0, faceY, r * 0.95 + 0.1), GOLD],
    [new THREE.BoxGeometry(1.4, 2.4, 0.3).translate(0, 1.2, r - 0.05), '#5a4a7a'],     // the door, south, toward the shrine
  ]);
  colliders.push({ x: OBSERVATORY.x, z: OBSERVATORY.z, r: r + 0.3 });
  const hands = new THREE.Mesh(paint([
    [new THREE.BoxGeometry(0.12, 1.2, 0.06).translate(0, 0.55, 0), '#3a2f5a'],
    [new THREE.BoxGeometry(0.16, 0.8, 0.06).translate(0, 0.35, 0).rotateZ(-1.9), '#3a2f5a'],
  ]), paintMaterial());
  hands.name = 'clock-hands';
  hands.position.set(OBSERVATORY.x, height(OBSERVATORY.x, OBSERVATORY.z) + faceY, OBSERVATORY.z + r * 0.95 + 0.2);
  scene.add(hands);
  // the gears' stand by the tower (WORLD-24 later: the clock's three steps): ray 3 comes out of it at the end
  paintedAt(scene, 'clock-stand', CLOCK.x, CLOCK.z, [
    [new THREE.CylinderGeometry(0.7, 0.8, 1, 10).translate(0, 0.5, 0), STONE],
    [new THREE.TorusGeometry(0.5, 0.12, 5, 10).translate(0, 1.4, 0), GOLD],
  ]);
  colliders.push({ x: CLOCK.x, z: CLOCK.z, r: 0.8 });

  // ----- the airship at the pier: a hull, a mast and a sail, its red balloon raised over it -----
  const { len, balloonR, top } = SHIP;
  // it hangs in the air by the pier's edge, its deck a little under the pier's top (the gangway leads down to it)
  const deckY = SHIP.deck;
  const balloonY = top - balloonR;
  const ship = paintedAt(scene, 'landmark-pier', SHIP.x, SHIP.z, [
    [new THREE.CylinderGeometry(1.6, 1, len, 10, 1).rotateX(Math.PI / 2).scale(1, 0.7, 1).translate(0, 0.6, 0), HULL],
    [new THREE.BoxGeometry(2.6, 0.2, len * 0.8).translate(0, 1.4, 0), '#c89060'],
    [new THREE.CylinderGeometry(0.12, 0.12, 4, 6).translate(0, 3.4, 0), '#6a4a2a'],
    [new THREE.BoxGeometry(0.1, 2.4, 2.4).translate(0, 3.6, 0.9), SAIL],
    [new THREE.SphereGeometry(balloonR, 14, 10).scale(1, 1, 1.35).translate(0, balloonY, 0), BALLOON],
    [new THREE.CylinderGeometry(0.05, 0.05, balloonY - balloonR - 1.4, 4).translate(1, 1.4 + (balloonY - balloonR - 1.4) / 2, 0), '#6a4a2a'],
    [new THREE.CylinderGeometry(0.05, 0.05, balloonY - balloonR - 1.4, 4).translate(-1, 1.4 + (balloonY - balloonR - 1.4) / 2, 0), '#6a4a2a'],
  ], SHIP.yaw, deckY);
  return {
    starTop: new THREE.Vector3(OBSERVATORY.x, height(OBSERVATORY.x, OBSERVATORY.z) + towerH + domeR + 2.5, OBSERVATORY.z),
    hands,
    ship,
  };
}
