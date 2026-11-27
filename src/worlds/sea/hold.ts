import * as THREE from 'three';
import { speaking } from '../../core/audio';
import type { Game } from '../../game/context';
import { petPlace } from '../../game/pets';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { HOLD } from './layout';
import { Paint, paintMaterial } from './paint';
import { colliders, inHold } from './terrain';

/**
 * The hold of the sunken ship (the customer's word of 2026-11-27: the door on the ship's side led nowhere - a secret
 * place to explore behind it, as the first world's room of the house). A room far past the map (HOLD, ./layout.ts); the
 * door of the captain's cabin leads into it once Pantsyr's pearl is back (he says the door is open: pantsyr_half_finish),
 * under a short white fade, and out again by its door inside. Flooded, as all the sea: she swims in it too.
 *
 * Inside: planks, the ribs of the hull, the deck beams overhead, two portholes with the light of the sea, a lantern
 * hanging from a beam, a map pinned to the wall, barrels - and the world's chest (ship_chest, ./secrets.ts). The first
 * time in, the cat says where she is (sea_hold_in). The whole room is one painted mesh, drawn only with her in it; while
 * she is in it the camera sees HOLD_FAR m at most - else the whole sea, far off past its edge, was drawn behind its walls
 * (the first world's room: 309 -> 136 calls, docs/perf.md).
 */

/** m: the room's walls are this high; the camera's distance behind her inside; how far the camera sees inside. */
export const HOLD_H = 3.2, HOLD_CAM = 4.2, HOLD_FAR = 24;
/** m from the front wall to where she stands inside its door (and its spot), the spot's reach there. */
export const DOOR_IN = 1.1, DOOR_IN_R = 1.6;
/** m out from the cabin's door where she comes out, facing away from the ship; the camera turned by EXIT_CAM_TURN round her, beside the hull, not in it. */
export const EXIT_OUT = 1.8, EXIT_CAM_TURN = -1.0;
/** The flag of the cat's word the first time in (the world's part of the save). */
export const HOLD_TOLD = 'told_hold';
/** s: the cat's word waits this long at most for the line that sounds to end. */
const WORD_WAIT = 8;

/** Where she stands inside the door, and where the chest stands (at the back, to the left, its lid to the room). */
export function holdOf() {
  const doorIn = { x: HOLD.x, z: HOLD.z + HOLD.half - DOOR_IN };
  const chest = { x: HOLD.x - 2.3, z: HOLD.z - 2.4 };
  const barrels = [{ x: HOLD.x + 3.3, z: HOLD.z - 3.2 }, { x: HOLD.x + 3.4, z: HOLD.z - 2.1 }, { x: HOLD.x + 2.5, z: HOLD.z - 3.4 }];
  return { doorIn, chest, chestFacing: Math.atan2(HOLD.x - chest.x, HOLD.z - chest.z), barrels };
}

/** The room in one painted geometry: floor, walls and ribs, deck beams, the door inside, portholes, lantern, map, barrels. */
export function holdGeometry(): THREE.BufferGeometry {
  const p = new Paint(), m4 = new THREE.Matrix4(), H = HOLD_H, S = HOLD.half;
  const at = (x: number, y: number, z: number, ry = 0) => m4.makeRotationY(ry).setPosition(HOLD.x + x, HOLD.y + y, HOLD.z + z);
  // the floor: planks along the room, a dark seam between them
  p.add(new THREE.PlaneGeometry(S * 2, S * 2).rotateX(-Math.PI / 2), '#8a6240', 0, at(0, 0, 0));
  for (let x = -S + 0.55; x < S; x += 0.55) p.add(new THREE.BoxGeometry(0.04, 0.01, S * 2), '#5c3e26', 0, at(x, 0.005, 0));
  // the walls, seen from inside (planes turned in), and the ceiling of deck planks seen from under it only: the camera
  // behind her, when it stands outside, sees her through them (the first world's room)
  const wall = (ry: number) => new THREE.PlaneGeometry(S * 2, H).translate(0, H / 2, -S).rotateY(ry);
  [[0, '#7a5534'], [Math.PI / 2, '#74502f'], [Math.PI, '#7a5534'], [-Math.PI / 2, '#74502f']].forEach(([ry, c]) => p.add(wall(ry as number), c as string, 0, at(0, 0, 0)));
  p.add(new THREE.PlaneGeometry(S * 2, S * 2).rotateX(Math.PI / 2), '#6b4a2c', 0, at(0, H, 0));
  // the ribs of the hull up the side walls, the deck beams across over them
  for (let z = -S + 0.9; z < S - 0.5; z += 1.6) {
    for (const side of [-1, 1]) p.add(new THREE.BoxGeometry(0.22, H, 0.2), '#5a3d24', 0, at(side * (S - 0.11), H / 2, z));
    p.add(new THREE.BoxGeometry(S * 2, 0.22, 0.2), '#5a3d24', 0, at(0, H - 0.11, z));
  }
  // the door inside the front wall
  p.add(new THREE.BoxGeometry(1.5, 2.3, 0.08), '#4a3020', 0, at(0, 1.15, S - 0.05));
  p.add(new THREE.BoxGeometry(1.2, 1.9, 0.06), '#5e3d26', 0, at(0, 1.0, S - 0.09));
  p.add(new THREE.SphereGeometry(0.07, 8, 6), '#f2c45a', 0.6, at(0.42, 1.0, S - 0.14));
  // two portholes in the back wall: brass rings, the light of the sea in them
  for (const x of [-1.4, 1.4]) {
    p.add(new THREE.TorusGeometry(0.38, 0.07, 6, 16), '#c79a4a', 0.15, at(x, 1.9, -S + 0.06));
    p.add(new THREE.CircleGeometry(0.34, 16), '#9ff0ff', 0.9, at(x, 1.9, -S + 0.04));
  }
  // the lantern on a short chain from a beam: its glass glows warm
  p.add(new THREE.CylinderGeometry(0.02, 0.02, 0.45, 4), '#3a2a1c', 0, at(0.6, H - 0.45, 0.2));
  p.add(new THREE.ConeGeometry(0.2, 0.18, 6), '#3a2a1c', 0, at(0.6, H - 0.75, 0.2));
  p.add(new THREE.CylinderGeometry(0.15, 0.15, 0.34, 6), '#ffcf6a', 1, at(0.6, H - 1.0, 0.2));
  p.add(new THREE.CylinderGeometry(0.17, 0.17, 0.05, 6), '#3a2a1c', 0, at(0.6, H - 1.19, 0.2));
  // the map pinned to the right wall: parchment, its coasts, the red cross of the treasure
  const mapAt = (x: number, y: number) => at(S - 0.04, 1.6 + y, x, -Math.PI / 2);
  p.add(new THREE.PlaneGeometry(1.4, 1.0), '#ecd9a4', 0.1, mapAt(0, 0));
  for (const [x, y, w, r] of [[-0.3, 0.2, 0.6, 0.3], [0.25, -0.15, 0.5, -0.5], [-0.15, -0.25, 0.4, 0.1]]) p.add(new THREE.PlaneGeometry(w, 0.03).rotateZ(r), '#8a6a3a', 0, m4.copy(mapAt(x, y)).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.005)));
  for (const r of [0.7, -0.7]) p.add(new THREE.PlaneGeometry(0.2, 0.04).rotateZ(r), '#d0453a', 0.3, m4.copy(mapAt(0.35, 0.18)).multiply(new THREE.Matrix4().makeTranslation(0, 0, 0.008)));
  // barrels with dark hoops
  for (const b of holdOf().barrels) {
    p.add(new THREE.CylinderGeometry(0.42, 0.42, 0.95, 10), '#9a6b3e', 0, at(b.x - HOLD.x, 0.48, b.z - HOLD.z));
    for (const y of [0.2, 0.76]) p.add(new THREE.TorusGeometry(0.43, 0.03, 4, 12).rotateX(Math.PI / 2), '#3d2c1f', 0, at(b.x - HOLD.x, y, b.z - HOLD.z));
  }
  return p.geometry();
}

export interface SeaHold {
  readonly spots: readonly Spot[];
  /** Whether she is in the hold now. */
  inside(): boolean;
  /** The door of the cabin from outside, and where she stands inside its door. */
  readonly doorOut: THREE.Vector3;
  readonly doorIn: THREE.Vector3;
  update(dt: number, time: number): void;
}

/**
 * The hold in the scene: `door` - the spot before the cabin's door outside (./index.ts), `facing` - the way the door
 * looks out of the hull, `open` - whether it leads in (Pantsyr's pearl is back).
 */
export function createSeaHold(g: Game, scope: WorldScope, o: { door: THREE.Vector3; facing: number; open: () => boolean }): SeaHold {
  const { scene, hero, cat, ws, camera } = g;
  const h = holdOf();
  const room = new THREE.Mesh(holdGeometry(), paintMaterial());
  room.name = 'sea-hold'; room.castShadow = false; room.receiveShadow = true; room.visible = false;
  scene.add(room);
  for (const b of h.barrels) colliders.push({ x: b.x, z: b.z, r: 0.5 });
  const doorIn = new THREE.Vector3(h.doorIn.x, HOLD.y, h.doorIn.z);
  const hp = hero.root.position;

  // the short fade to and from white over the change of place, as the first world's room
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
      g.camOverride = inside ? HOLD_CAM : null;
      veil.style.opacity = '0';
      scope.timeout(() => {
        moving = false; g.busy = false;
        if (inside && ws.flags[HOLD_TOLD] !== true) { ws.flags[HOLD_TOLD] = true; g.persist(); tell(); }
      }, 250);
    }, 300);
  }
  /** The cat's word of the hold: after the line that sounds now, not over it. */
  function tell() {
    let waited = 0;
    const tryNow = () => {
      if (!speaking()) { void g.speech.line('sea_hold_in', 'hint', 5000); return; }
      if ((waited += 0.25) < WORD_WAIT) scope.timeout(tryNow, 250);
    };
    tryNow();
  }
  const out = () => ({ x: o.door.x + Math.sin(o.facing) * EXIT_OUT, z: o.door.z + Math.cos(o.facing) * EXIT_OUT });

  // the camera sees the room only while she is in it; its distance there is the room's
  const farOut = camera.far;
  let wasIn = false;
  scope.own(() => { if (wasIn) { camera.far = farOut; camera.updateProjectionMatrix(); if (g.camOverride === HOLD_CAM) g.camOverride = null; } });

  return {
    spots: [
      { pos: o.door, r: 2.6, label: 'sea_hold', on: () => o.open() && !moving, run: () => moveTo(h.doorIn, HOLD.y, Math.PI, true) },
      { pos: doorIn, r: DOOR_IN_R, label: 'sea_out', on: () => !moving, run: () => { const p = out(); moveTo(p, g.groundY(p.x, p.z), o.facing, false, EXIT_CAM_TURN); } },
    ],
    inside: () => inHold(hp.x, hp.z),
    doorOut: o.door, doorIn,
    update() {
      const inside = inHold(hp.x, hp.z);
      room.visible = inside;
      if (inside !== wasIn) {
        wasIn = inside;
        camera.far = inside ? HOLD_FAR : farOut; camera.updateProjectionMatrix();
        // brought in or out not by its doors (the walkthrough's teleport): the camera's distance follows
        if (inside) g.camOverride = HOLD_CAM; else if (g.camOverride === HOLD_CAM) g.camOverride = null;
      }
    },
  };
}
