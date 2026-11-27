import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Game } from '../../game/context';
import { petPlace } from '../../game/pets';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { LANDMARKS, TREE_ROOM, ZONES } from './layout';
import { height, inTreeRoom } from './terrain';

/**
 * The room in Shustrik's tree (`hollow`, the customer's word of 2026-11-27: a secret place to explore, as the first
 * world's room of the house and the sea's hold). A round room far past the map (TREE_ROOM, ./layout.ts); a little door
 * in the trunk of the grove's great orange tree (the grove's landmark, by Shustrik's glade) leads into it once his chain
 * is done - before, there is no door - under a short white fade, and out again by its door inside.
 *
 * Inside: the rings of the tree on the floor, the bark of the wall, a spiral of bracket fungi up it, the squirrel's
 * store in three niches (nuts, acorns, cones), his bed of orange leaves, glowing mushrooms, a round window with the light
 * of day and a lantern. The first time in is the find (./secrets.ts: 3 stars, the cat's word). The room is two meshes
 * (lit and glowing), drawn only with her in it; while she is in it the camera sees ROOM_FAR m at most - else the whole
 * forest, far off past its edge, was drawn behind its walls (the sea's hold, docs/perf.md).
 */

/** m: the wall's height; the camera's distance behind her inside; how far the camera sees inside. */
export const ROOM_H = 5, ROOM_CAM = 3.4, ROOM_FAR = 20;
/** m from the wall to where she stands inside its door (and its spot), the spot's reach there. */
export const DOOR_IN = 1.0, DOOR_IN_R = 1.5;
/** m: the door in the trunk, its width and height; how far out of the trunk's foot she stands before it (its spot). */
export const DOOR_W = 0.7, DOOR_H = 1.3, DOOR_OUT = 1.9;
/** m out of the door where she comes out, facing away from the trunk; the camera turned round her, not in the trunk. */
export const EXIT_OUT = 2.0, EXIT_CAM_TURN = -0.8;
/** s: the white fade over the change of place, out and back. */
const FADE_S = 0.3, BACK_S = 0.25;

/** The door in the trunk: the way it looks (to Shustrik's glade), its place on the bark, and where she stands before it. */
export function treeDoorOf() {
  const t = LANDMARKS.grove, face = Math.atan2(ZONES.grove.x - t.x, ZONES.grove.z - t.z);
  const fx = Math.sin(face), fz = Math.cos(face);
  return { face, tree: { x: t.x, z: t.z }, door: { x: t.x + fx * 0.96, z: t.z + fz * 0.96 }, stand: { x: t.x + fx * DOOR_OUT, z: t.z + fz * DOOR_OUT } };
}

/** Its places inside: where she stands inside the door (by the wall to +z), the niches of the store, the bed. */
export function roomOf() {
  const R = TREE_ROOM.r;
  const doorIn = { x: TREE_ROOM.x, z: TREE_ROOM.z + R - DOOR_IN };
  /** The niches: their angle round the middle (from +z, the door), m up the wall. */
  const niches = [{ a: 1.6, y: 1.1 }, { a: 2.5, y: 1.6 }, { a: -2.2, y: 1.0 }];
  const bed = { x: TREE_ROOM.x - 2.2, z: TREE_ROOM.z - 1.6 };
  return { doorIn, niches, bed };
}

/** One geometry of vertex colours: each part painted its colour, placed by its matrix. */
function paint(parts: readonly [THREE.BufferGeometry, string, THREE.Matrix4?][]): THREE.BufferGeometry {
  const c = new THREE.Color();
  return mergeGeometries(parts.map(([g, col, m]) => {
    const n = g.index ? g.toNonIndexed() : g.clone();
    if (m) n.applyMatrix4(m);
    n.deleteAttribute('uv');
    if (n.getAttribute('normal')) n.deleteAttribute('normal');
    c.set(col);
    const k = n.attributes.position.count, a = new Float32Array(k * 3);
    for (let i = 0; i < k; i++) a.set([c.r, c.g, c.b], i * 3);
    n.setAttribute('color', new THREE.BufferAttribute(a, 3));
    return n;
  }))!;
}

/** A matrix of the room: (x, y, z) from its middle on its floor, turned `ry` round the up axis. */
const roomAt = (x: number, y: number, z: number, ry = 0) => new THREE.Matrix4().makeRotationY(ry).setPosition(TREE_ROOM.x + x, TREE_ROOM.y + y, TREE_ROOM.z + z);
/** On the wall at angle `a` (from +z), `y` up, `inset` m in from it: faced to the middle. */
const onWall = (a: number, y: number, inset: number) => roomAt(Math.sin(a) * (TREE_ROOM.r - inset), y, Math.cos(a) * (TREE_ROOM.r - inset), a + Math.PI);

/** The room, lit: floor and its rings, the wall from inside, the ceiling from under it, the fungi, the store, the bed, the door. */
export function roomGeometry(): THREE.BufferGeometry {
  const R = TREE_ROOM.r, H = ROOM_H;
  const parts: [THREE.BufferGeometry, string, THREE.Matrix4?][] = [];
  parts.push([new THREE.CircleGeometry(R, 24).rotateX(-Math.PI / 2), '#c08a55', roomAt(0, 0, 0)]);
  // the rings of the tree on the floor
  for (let r = 0.5; r < R - 0.2; r += 0.6) parts.push([new THREE.RingGeometry(r, r + 0.06, 24).rotateX(-Math.PI / 2), '#8f5e34', roomAt(0, 0.005, 0)]);
  // the wall, seen from inside only (turned inside out): the camera behind her, when it stands outside, sees her through
  // it; the ceiling seen from under it only
  parts.push([new THREE.CylinderGeometry(R, R, H, 20, 1, true).translate(0, H / 2, 0).scale(-1, 1, 1), '#8a5e3a', roomAt(0, 0, 0)]);
  parts.push([new THREE.CircleGeometry(R, 20).rotateX(Math.PI / 2), '#6e4a2c', roomAt(0, H, 0)]);
  // the ridges of the bark up the wall: flat, faced in (seen from outside they stood as bars before the camera)
  for (let i = 0; i < 14; i++) { const a = (i / 14) * Math.PI * 2 + 0.11; if (Math.abs(Math.sin(a / 2)) < 0.12) continue; parts.push([new THREE.PlaneGeometry(0.14, H), i % 2 ? '#74492a' : '#7d5232', onWall(a, H / 2, 0.03)]); }
  // a spiral of bracket fungi up the wall, from the left of the door round to the window
  for (let i = 0; i < 8; i++) {
    const a = -0.9 - i * 0.42, y = 0.45 + i * 0.48;
    parts.push([new THREE.CylinderGeometry(0.55, 0.62, 0.12, 8, 1, false, -Math.PI / 2, Math.PI), i % 2 ? '#d9a066' : '#e3b27a', onWall(a, y, 0)]);
  }
  // the store: three niches, dark in the wall, nuts and acorns and cones in them
  for (const [k, n] of roomOf().niches.entries()) {
    parts.push([new THREE.PlaneGeometry(0.95, 0.6), '#3a2616', onWall(n.a, n.y + 0.3, 0.02)]);
    parts.push([new THREE.BoxGeometry(1.05, 0.07, 0.32), '#a5764a', onWall(n.a, n.y, 0.16)]);
    for (let j = 0; j < 5; j++) {
      const side = (j - 2) * 0.17, m = new THREE.Matrix4().multiplyMatrices(onWall(n.a, n.y + 0.1, 0.2), new THREE.Matrix4().makeTranslation(side, 0, (j % 2) * 0.06));
      if (k === 0) parts.push([new THREE.IcosahedronGeometry(0.08, 0), '#a8743a', m]);
      else if (k === 1) { parts.push([new THREE.SphereGeometry(0.075, 6, 4), '#c89a52', m]); parts.push([new THREE.SphereGeometry(0.08, 6, 3, 0, Math.PI * 2, 0, Math.PI / 2), '#6b4a2a', new THREE.Matrix4().multiplyMatrices(m, new THREE.Matrix4().makeTranslation(0, 0.04, 0))]); }
      else parts.push([new THREE.ConeGeometry(0.07, 0.2, 6), '#7a5232', m]);
    }
  }
  // the squirrel's bed of orange leaves, a few nuts round it on the floor
  const { bed } = roomOf();
  parts.push([new THREE.SphereGeometry(0.85, 8, 4).scale(1, 0.32, 0.8), '#e8873a', roomAt(bed.x - TREE_ROOM.x, 0.12, bed.z - TREE_ROOM.z)]);
  parts.push([new THREE.SphereGeometry(0.55, 7, 3).scale(1, 0.3, 0.9), '#f0a24a', roomAt(bed.x - TREE_ROOM.x + 0.2, 0.25, bed.z - TREE_ROOM.z - 0.1)]);
  for (const [x, z] of [[1.4, -2.2], [1.8, -1.6], [-0.6, -2.9]]) parts.push([new THREE.IcosahedronGeometry(0.09, 0), '#a8743a', roomAt(x, 0.08, z)]);
  // the door inside, by the wall to +z: a dark arch in a frame of bark - flat, faced into the room only (the camera
  // behind her by the door stands outside the wall: a box there stood between it and her)
  parts.push([new THREE.PlaneGeometry(DOOR_W + 0.24, DOOR_H + 0.16), '#5a3a22', onWall(0, (DOOR_H + 0.16) / 2, 0.02)]);
  parts.push([new THREE.CircleGeometry(DOOR_W / 2, 12, 0, Math.PI).scale(1, 0.6, 1).translate(0, DOOR_H, 0), '#1d120a', onWall(0, 0, 0.05)]);
  parts.push([new THREE.PlaneGeometry(DOOR_W, DOOR_H).translate(0, DOOR_H / 2, 0), '#1d120a', onWall(0, 0, 0.05)]);
  // the window's frame, the lantern's chain and cap
  parts.push([new THREE.TorusGeometry(0.5, 0.07, 5, 16), '#6b4a2a', onWall(Math.PI, 2.7, 0.04)]);
  parts.push([new THREE.CylinderGeometry(0.02, 0.02, 0.8, 4), '#3a2a1c', roomAt(0.9, H - 0.4, 0.4)]);
  parts.push([new THREE.ConeGeometry(0.2, 0.18, 6), '#3a2a1c', roomAt(0.9, H - 0.85, 0.4)]);
  return paint(parts);
}

/** What glows inside: the window's light of day, the lantern's glass, the mushrooms by the wall. Unlit. */
export function roomGlowGeometry(): THREE.BufferGeometry {
  const parts: [THREE.BufferGeometry, string, THREE.Matrix4?][] = [];
  parts.push([new THREE.CircleGeometry(0.45, 16), '#d8f2ff', onWall(Math.PI, 2.7, 0.03)]);
  parts.push([new THREE.CylinderGeometry(0.15, 0.15, 0.32, 6), '#ffcf6a', roomAt(0.9, ROOM_H - 1.1, 0.4)]);
  const shrooms: [number, number, number, string][] = [[-1.3, 0, 1, '#7ff0e0'], [-1.05, 0, 0.7, '#b48cff'], [2.2, 0, 0.9, '#9dff9a'], [2.0, 0, 0.6, '#7fd8ff'], [3.6, 0, 0.8, '#ffb8f0']];
  for (const [a, , k, col] of shrooms) {
    const m = onWall(a, 0, 0.35);
    parts.push([new THREE.CylinderGeometry(0.05 * k, 0.07 * k, 0.3 * k, 5).translate(0, 0.15 * k, 0), '#e8f4ee', m]);
    parts.push([new THREE.SphereGeometry(0.2 * k, 8, 3, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.6, 1).translate(0, 0.28 * k, 0), col, m]);
  }
  return paint(parts);
}

/** The door in the trunk from outside: a dark arch in a rim of bark, faced to the glade. Lit. */
export function treeDoorGeometry(): THREE.BufferGeometry {
  const d = treeDoorOf(), y = height(d.door.x, d.door.z);
  const m = new THREE.Matrix4().makeRotationY(d.face).setPosition(d.door.x, y, d.door.z);
  return paint([
    [new THREE.BoxGeometry(DOOR_W + 0.22, DOOR_H + 0.14, 0.08).translate(0, (DOOR_H + 0.14) / 2, 0), '#5a3a22', m],
    [new THREE.PlaneGeometry(DOOR_W, DOOR_H).translate(0, DOOR_H / 2, 0.045), '#1d120a', m],
    [new THREE.CircleGeometry(DOOR_W / 2, 12, 0, Math.PI).scale(1, 0.6, 1).translate(0, DOOR_H, 0.045), '#1d120a', m],
    [new THREE.SphereGeometry(0.05, 6, 4).translate(DOOR_W * 0.3, DOOR_H * 0.5, 0.08), '#f2c45a', m],
  ]);
}

export interface TreeRoom {
  readonly spots: readonly Spot[];
  /** Whether she is in the room now. */
  inside(): boolean;
  /** Where she stands before the door outside (the item's place), and inside its door. */
  readonly doorOut: THREE.Vector3;
  readonly doorIn: THREE.Vector3;
  /** A frame: the door shown near her once open, the room and its camera with her in it. */
  update(near: (p: { x: number; z: number }) => boolean): void;
}

/**
 * The room in the scene. `open` - whether the door is there (Shustrik's chain done); `lit`, `glow` - the materials of
 * the forest's painted things (./secrets.ts); `inFirst` - she came in for the first time (the find).
 */
export function createTreeRoom(g: Game, scope: WorldScope, o: { open: () => boolean; lit: THREE.Material; glow: THREE.Material; inFirst: () => void; told: () => boolean }): TreeRoom {
  const { scene, hero, cat, camera } = g;
  const room = new THREE.Group();
  room.name = 'forest-tree-room';
  const walls = new THREE.Mesh(roomGeometry(), o.lit);
  walls.receiveShadow = true;
  room.add(walls, new THREE.Mesh(roomGlowGeometry(), o.glow));
  room.visible = false;
  scene.add(room);
  const door = new THREE.Mesh(treeDoorGeometry(), o.lit);
  door.name = 'forest-tree-door';
  door.visible = false;
  scene.add(door);
  const d = treeDoorOf(), r = roomOf();
  const doorOut = new THREE.Vector3(d.stand.x, height(d.stand.x, d.stand.z), d.stand.z);
  const doorIn = new THREE.Vector3(r.doorIn.x, TREE_ROOM.y, r.doorIn.z);
  const hp = hero.root.position;

  // the short fade to and from white over the change of place, as the sea's hold
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .25s;z-index:30';
  document.body.appendChild(veil);
  scope.own(() => { veil.remove(); });
  let moving = false;
  function moveTo(to: { x: number; z: number }, y: number, facing: number, inside: boolean, camTurn = 0) {
    if (moving) return;
    moving = true; g.busy = true;
    veil.style.opacity = '1';
    scope.timeout(() => {
      hp.set(to.x, y, to.z); hero.heading = facing; hero.root.rotation.y = facing;
      cat.root.position.set(to.x + Math.cos(facing) * 0.9, y, to.z - Math.sin(facing) * 0.9);
      const pet = g.pets.follower;
      if (pet) pet.root.position.copy(petPlace(to, facing)).setY(y);
      g.cam.target.set(to.x, y + 1.5, to.z); g.cam.yaw = facing + Math.PI + camTurn;
      g.camOverride = inside ? ROOM_CAM : null;
      veil.style.opacity = '0';
      scope.timeout(() => {
        moving = false; g.busy = false;
        if (inside && !o.told()) o.inFirst();
      }, BACK_S * 1000);
    }, FADE_S * 1000);
  }
  const out = () => ({ x: d.tree.x + Math.sin(d.face) * EXIT_OUT, z: d.tree.z + Math.cos(d.face) * EXIT_OUT });

  // the camera sees the room only while she is in it; its distance there is the room's
  const farOut = camera.far;
  let wasIn = false;
  scope.own(() => { if (wasIn) { camera.far = farOut; camera.updateProjectionMatrix(); if (g.camOverride === ROOM_CAM) g.camOverride = null; } });

  return {
    spots: [
      { pos: doorOut, r: 1.8, label: 'forest_hollow', on: () => o.open() && !moving, run: () => moveTo(r.doorIn, TREE_ROOM.y, Math.PI, true) },
      { pos: doorIn, r: DOOR_IN_R, label: 'forest_out', on: () => !moving, run: () => { const p = out(); moveTo(p, height(p.x, p.z), d.face, false, EXIT_CAM_TURN); } },
    ],
    inside: () => inTreeRoom(hp.x, hp.z),
    doorOut, doorIn,
    update(near) {
      const inside = inTreeRoom(hp.x, hp.z);
      room.visible = inside;
      door.visible = !inside && o.open() && near(d.tree);
      if (inside !== wasIn) {
        wasIn = inside;
        camera.far = inside ? ROOM_FAR : farOut; camera.updateProjectionMatrix();
        // brought in or out not by its doors (the walkthrough's teleport): the camera's distance follows
        if (inside) g.camOverride = ROOM_CAM; else if (g.camOverride === ROOM_CAM) g.camOverride = null;
      }
    },
  };
}
