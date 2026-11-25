/**
 * The two landmarks of the Sky Islands seen from far (WORLD-10, docs/worlds/world-5.md «Карта»), the grey build: the
 * observatory's tower with its clock and dome on the stargazer's island, seen from everywhere, and the airship at the
 * pier with its balloon raised. Simple shapes at their real sizes; each landmark is one mesh of baked vertex colours (one
 * draw call however many parts), the clock's hands a mesh of their own, as they move. Since step 6b the airship's hull
 * is the CC0 Sail Ship (./props.ts) baked into the same mesh under our own red balloon; without the model (the unit
 * tests build the islands so) the grey build's hull stands in. The names are the ones tools/sky-grey.mjs looks for:
 * `landmark-observatory`, `clock-hands`, `landmark-pier`.
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { CLOCK, OBSERVATORY, SHIP } from './layout';
import { AIRSHIP_COLOURS, bake } from './props';
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
  /** The airship moored at the pier: ./ship.ts moves and turns it in its flight, its bow (+z) along the way. */
  ship: THREE.Mesh;
}

/** m over the airship's point where its deck is: she and the cat stand there in the flight (./ship.ts). */
export const DECK = 1.4;
/**
 * Where she and the cat stand in the flight (./ship.ts), in the airship's own metres: on the Sail Ship's poop deck at its
 * stern, she behind the helm, the cat beside it - the sails stand between the camera behind the ship and its middle.
 * The deck's height there is the model's at SHIP.len (measured; ./landmarks.test.ts checks it).
 */
export const HELM = { x: 0, y: 1.92, z: -3.9 } as const;
export const CAT_DECK = { x: -0.4, y: 1.92, z: -3.5 } as const;
/** m of the Sail Ship's own (./props.ts, measured on the model): its deck amidships over the model's origin. */
export const SAIL_SHIP = { deck: 0.74 } as const;

/**
 * The Sail Ship as the airship's hull: its length SHIP.len, centred on the airship's point, its deck at DECK, its bow
 * +z (the model's own: its rudder is at -z) - the way the grey build's hull lay and ./ship.ts turns the airship.
 */
export function shipHull(model: THREE.Object3D): THREE.BufferGeometry {
  const geo = bake(model, AIRSHIP_COLOURS), bb = geo.boundingBox!;
  const s = SHIP.len / (bb.max.z - bb.min.z);
  geo.translate(-(bb.min.x + bb.max.x) / 2, -SAIL_SHIP.deck, -(bb.min.z + bb.max.z) / 2).scale(s, s, s).translate(0, DECK, 0);
  return geo;
}

/** The observatory and the airship in the scene, and their colliders; `airship` - the Sail Ship's model (./props.ts). */
export function buildLandmarks(scene: THREE.Scene, airship?: THREE.Object3D): Landmarks {
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

  // ----- the airship at the pier: a hull (the Sail Ship, or the grey build's), its red balloon raised over it -----
  const { len, balloonR, top } = SHIP;
  // it hangs in the air by the pier's edge, its deck a little under the pier's top (the gangway leads down to it)
  const deckY = SHIP.deck;
  const balloonY = top - balloonR, rope = balloonY - balloonR * 0.8 - DECK;
  // the balloon and its four ropes down to the deck's rails (the Sail Ship is 2.4 m across; the grey hull 3.2)
  const balloon: Part[] = [[new THREE.SphereGeometry(balloonR, 14, 10).scale(1, 1, 1.35).translate(0, balloonY, 0), BALLOON]];
  for (const [x, z] of [[0.7, 2], [-0.7, 2], [0.7, -2], [-0.7, -2]] as const) {
    balloon.push([new THREE.CylinderGeometry(0.05, 0.05, rope, 4).translate(x, DECK + rope / 2, z), '#6a4a2a']);
  }
  const grey: Part[] = [
    [new THREE.CylinderGeometry(1.6, 1, len, 10, 1).rotateX(Math.PI / 2).scale(1, 0.7, 1).translate(0, 0.6, 0), HULL],
    [new THREE.BoxGeometry(2.6, 0.2, len * 0.8).translate(0, DECK, 0), '#c89060'],
    [new THREE.CylinderGeometry(0.12, 0.12, 4, 6).translate(0, 3.4, 0), '#6a4a2a'],
    [new THREE.BoxGeometry(0.1, 2.4, 2.4).translate(0, 3.6, 0.9), SAIL],
  ];
  const ship = airship
    ? new THREE.Mesh(mergeGeometries([shipHull(airship), paint(balloon)], false)!, paintMaterial())
    : new THREE.Mesh(paint([...grey, ...balloon]), paintMaterial());
  ship.name = 'landmark-pier'; ship.castShadow = true; ship.receiveShadow = true;
  ship.position.set(SHIP.x, deckY, SHIP.z); ship.rotation.y = SHIP.yaw;
  scene.add(ship);
  return {
    starTop: new THREE.Vector3(OBSERVATORY.x, height(OBSERVATORY.x, OBSERVATORY.z) + towerH + domeR + 2.5, OBSERVATORY.z),
    hands,
    ship,
  };
}
