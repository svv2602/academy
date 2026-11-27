import * as THREE from 'three';
import { speaking } from '../../core/audio';
import type { Game } from '../../game/context';
import { petPlace } from '../../game/pets';
import type { Spot } from '../../game/player';
import type { WorldScope } from '../../game/scope';
import { ROOM } from './layout';
import { paint, paintMaterial, type Part } from './landmarks';
import { colliders, inRoom } from './terrain';

/**
 * Imbir's room (the lead's offer of 2026-11-27 after the sea's hold: the secret places of the Sweet Land, plan
 * idea/proposal/sweet-secrets-2026-11-27). A room far past the map (ROOM, ./layout.ts); the door of Imbir's gingerbread
 * house leads into it once ruby 2 is taken from its doorway, under a short white fade, and out again by its door inside.
 *
 * Inside: walls of iced gingerbread, a table with a teapot and cupcakes, a stove, a shelf of jam jars, a cookie clock -
 * and the jar of gingerbread stars on a low cupboard: its action opens it, the world's secret `ginger_room` (3 stars,
 * the cat's word sweet_secret_room, ./secrets.ts). The first time in, the cat says where she is (sweet_room_in). The
 * whole room is one painted mesh, drawn only with her in it; inside the camera sees ROOM_FAR m at most.
 */

/** m: the walls' height, the camera's distance behind her inside, how far the camera sees inside. */
export const ROOM_H = 3, ROOM_CAM = 4, ROOM_FAR = 22;
/** m from the front wall to where she stands inside its door, and the reach of its spot. */
export const DOOR_IN = 1.1, DOOR_IN_R = 1.6;
/** m out from the house's door where she comes out, facing away from the house. */
export const EXIT_OUT = 1.6;
/** The flag of the cat's word the first time in (the world's part of the save). */
export const ROOM_TOLD = 'told_room';
/** The flag of the find, the id of its item of the world description and a name of WorldDef.secrets. */
export const ROOM_FLAG = 'ginger_room';
/** s: the cat's word waits this long at most for the line that sounds to end. */
const WORD_WAIT = 8;

/** Where she stands inside its door, the table, the stove, the shelf, and the jar of the find on its cupboard. */
export function roomOf() {
  const doorIn = { x: ROOM.x, z: ROOM.z + ROOM.half - DOOR_IN };
  const table = { x: ROOM.x + 0.2, z: ROOM.z - 0.4, r: 0.9 };
  const stove = { x: ROOM.x - ROOM.half + 0.7, z: ROOM.z - ROOM.half + 0.8, r: 0.7 };
  const cupboard = { x: ROOM.x + ROOM.half - 0.6, z: ROOM.z - ROOM.half + 1.6, r: 0.6 };
  return { doorIn, table, stove, cupboard, jar: { x: cupboard.x, y: 1.05, z: cupboard.z }, jarStand: { x: cupboard.x - 1.1, z: cupboard.z } };
}

/** The room in one painted geometry: floor, walls and their icing, the door inside, table, stove, shelf, clock, cupboard, jar. */
export function roomGeometry(): THREE.BufferGeometry {
  const S = ROOM.half, H = ROOM_H, r = roomOf(), parts: Part[] = [];
  const at = (g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0) => g.rotateY(ry).translate(ROOM.x + x, ROOM.y + y, ROOM.z + z);
  // the floor of gingerbread tiles, a seam of icing between them
  parts.push([at(new THREE.PlaneGeometry(S * 2, S * 2).rotateX(-Math.PI / 2), 0, 0, 0), '#b8773f']);
  for (let x = -S + 0.95; x < S; x += 0.95) parts.push([at(new THREE.BoxGeometry(0.05, 0.01, S * 2), x, 0.005, 0), '#fff2e4']);
  // the walls, seen from inside (turned in), pink icing with a white wave along their top; no ceiling - the camera
  // behind her sees her through a wall it stands behind (the first world's room)
  [[0, '#f3c6d3'], [Math.PI / 2, '#efbcca'], [Math.PI, '#f3c6d3'], [-Math.PI / 2, '#efbcca']].forEach(([ry, c]) => {
    parts.push([new THREE.PlaneGeometry(S * 2, H).translate(0, H / 2, -S).rotateY(ry as number).translate(ROOM.x, ROOM.y, ROOM.z), c as string]);
    // the icing flat on the wall, as the wall one-sided: from behind (where the camera stands) neither is drawn
    for (let k = -S + 0.3; k < S; k += 0.6) parts.push([new THREE.CircleGeometry(0.2, 8, Math.PI, Math.PI).translate(k, H - 0.12, -S + 0.02).rotateY(ry as number).translate(ROOM.x, ROOM.y, ROOM.z), '#ffffff']);
    parts.push([new THREE.PlaneGeometry(S * 2, 0.12).translate(0, H - 0.06, -S + 0.02).rotateY(ry as number).translate(ROOM.x, ROOM.y, ROOM.z), '#ffffff']);
  });
  // the door inside the front wall (flat, facing in: the camera behind her at the door sees her through it), a round
  // window of sugar glass by it
  parts.push([at(new THREE.PlaneGeometry(1.4, 2.2).rotateY(Math.PI), 0, 1.1, S - 0.02), '#7a4a26']);
  parts.push([at(new THREE.PlaneGeometry(1.1, 1.85).rotateY(Math.PI), 0, 0.98, S - 0.03), '#9a5f30']);
  parts.push([at(new THREE.CircleGeometry(0.07, 8).rotateY(Math.PI), 0.38, 1.0, S - 0.04), '#f2c45a']);
  parts.push([at(new THREE.CircleGeometry(0.42, 16).rotateY(Math.PI), -1.9, 1.7, S - 0.04), '#bfe8ff']);
  // the table: its top, four legs; a teapot and three cupcakes on it
  const t = r.table;
  parts.push([at(new THREE.CylinderGeometry(0.85, 0.85, 0.08, 16), t.x - ROOM.x, 0.75, t.z - ROOM.z), '#d9a066']);
  for (const [dx, dz] of [[0.5, 0.5], [-0.5, 0.5], [0.5, -0.5], [-0.5, -0.5]]) parts.push([at(new THREE.CylinderGeometry(0.05, 0.05, 0.72, 6), t.x - ROOM.x + dx, 0.36, t.z - ROOM.z + dz), '#8a5530']);
  parts.push([at(new THREE.SphereGeometry(0.2, 10, 8).scale(1, 0.85, 1), t.x - ROOM.x - 0.2, 0.95, t.z - ROOM.z), '#7fc9e8']);
  parts.push([at(new THREE.CylinderGeometry(0.03, 0.05, 0.22, 6).rotateZ(-0.9), t.x - ROOM.x - 0.02, 0.97, t.z - ROOM.z), '#7fc9e8']);
  for (const [dx, dz, c] of [[0.3, 0.25, '#ff8fb8'], [0.35, -0.25, '#ffe27a'], [-0.1, -0.4, '#b98cff']] as const) {
    parts.push([at(new THREE.CylinderGeometry(0.1, 0.08, 0.1, 8), t.x - ROOM.x + dx, 0.84, t.z - ROOM.z + dz), '#c98a4a']);
    parts.push([at(new THREE.SphereGeometry(0.11, 8, 6), t.x - ROOM.x + dx, 0.93, t.z - ROOM.z + dz), c]);
  }
  // the stove in the back corner: its body, its door glowing warm, a chimney up the wall
  const s = r.stove;
  parts.push([at(new THREE.BoxGeometry(1.1, 1.0, 1.0), s.x - ROOM.x, 0.5, s.z - ROOM.z), '#e8e0d8']);
  parts.push([at(new THREE.BoxGeometry(0.5, 0.35, 0.02), s.x - ROOM.x + 0.1, 0.45, s.z - ROOM.z + 0.51), '#ff9a3c']);
  parts.push([at(new THREE.BoxGeometry(0.3, H - 1, 0.3), s.x - ROOM.x - 0.2, 1 + (H - 1) / 2, s.z - ROOM.z - 0.2), '#d8cfc6']);
  // the shelf on the left wall with jam jars, the cookie clock over the table on the back wall
  parts.push([at(new THREE.BoxGeometry(0.25, 0.05, 1.8), -S + 0.14, 1.55, 0.6), '#8a5530']);
  for (const [z, c] of [[0, '#d6304a'], [0.45, '#ff9f1c'], [0.9, '#7a3fb0'], [1.35, '#43a047']] as const) parts.push([at(new THREE.CylinderGeometry(0.1, 0.1, 0.24, 8), -S + 0.16, 1.7, z - 0.1), c]);
  parts.push([at(new THREE.CylinderGeometry(0.45, 0.45, 0.06, 18).rotateX(Math.PI / 2), 0.2, 2.1, -S + 0.04), '#c98a4a']);
  parts.push([at(new THREE.BoxGeometry(0.04, 0.3, 0.02), 0.2, 2.17, -S + 0.08), '#5a3418']);
  parts.push([at(new THREE.BoxGeometry(0.22, 0.04, 0.02), 0.28, 2.1, -S + 0.08), '#5a3418']);
  // the cupboard by the right wall, the jar of gingerbread stars on it (the find), its lid
  const c = r.cupboard;
  parts.push([at(new THREE.BoxGeometry(0.9, 0.9, 0.8), c.x - ROOM.x, 0.45, c.z - ROOM.z), '#c47a3e']);
  parts.push([at(new THREE.CylinderGeometry(0.2, 0.2, 0.32, 12), c.x - ROOM.x, 1.06, c.z - ROOM.z), '#dff4ff']);
  parts.push([at(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12), c.x - ROOM.x, 1.24, c.z - ROOM.z), '#ff6fa3']);
  for (const [dx, dy] of [[-0.06, 0.98], [0.07, 1.05], [0, 1.12]]) parts.push([at(new THREE.OctahedronGeometry(0.07, 0).scale(1, 1, 0.4), c.x - ROOM.x + dx, dy, c.z - ROOM.z + 0.12), '#c98a4a']);
  return paint(parts);
}

export interface SweetRoom {
  readonly spots: readonly Spot[];
  /** Whether she is in the room now. */
  inside(): boolean;
  /** The house's door from outside, where she stands inside its door, and where the jar stands. */
  readonly doorOut: THREE.Vector3;
  readonly doorIn: THREE.Vector3;
  readonly jarAt: THREE.Vector3;
  update(): void;
}

/**
 * The room in the scene: `door` - the spot before the house's door outside, `facing` - the way the door looks out of the
 * house, `open` - whether it leads in (ruby 2 taken), `found` - the jar's action (./secrets.ts gives the find).
 */
export function createSweetRoom(g: Game, scope: WorldScope, o: { door: THREE.Vector3; facing: number; open: () => boolean; jar: { label: string; on: () => boolean; run: () => void } }): SweetRoom {
  const { scene, hero, cat, ws, camera } = g;
  const r = roomOf();
  const room = new THREE.Mesh(roomGeometry(), paintMaterial());
  room.name = 'sweet-room'; room.castShadow = false; room.receiveShadow = true; room.visible = false;
  scene.add(room);
  scope.own(() => { scene.remove(room); room.geometry.dispose(); });
  colliders.push({ x: r.table.x, z: r.table.z, r: r.table.r }, { x: r.stove.x, z: r.stove.z, r: r.stove.r }, { x: r.cupboard.x, z: r.cupboard.z, r: r.cupboard.r });
  const doorIn = new THREE.Vector3(r.doorIn.x, ROOM.y, r.doorIn.z);
  const jarAt = new THREE.Vector3(r.jarStand.x, ROOM.y, r.jarStand.z);
  const hp = hero.root.position;

  // the short fade to and from white over the change of place, as the sea's hold
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;background:#fff;opacity:0;pointer-events:none;transition:opacity .25s;z-index:30';
  document.body.appendChild(veil);
  scope.own(() => { veil.remove(); });
  let moving = false;
  function moveTo(to: { x: number; z: number }, y: number, facing: number, inside: boolean) {
    if (moving) return;
    moving = true; g.busy = true;
    veil.style.opacity = '1';
    scope.timeout(() => {
      hp.set(to.x, y, to.z); hero.heading = facing; hero.root.rotation.y = facing;
      cat.root.position.set(to.x + Math.cos(facing) * 0.9, y, to.z - Math.sin(facing) * 0.9);
      const pet = g.pets.follower;
      if (pet) pet.root.position.copy(petPlace(to, facing)).setY(y);
      g.cam.target.set(to.x, y + 1.5, to.z); g.cam.yaw = facing + Math.PI;
      g.camOverride = inside ? ROOM_CAM : null;
      veil.style.opacity = '0';
      scope.timeout(() => {
        moving = false; g.busy = false;
        if (inside && ws.flags[ROOM_TOLD] !== true) { ws.flags[ROOM_TOLD] = true; g.persist(); tell(); }
      }, 250);
    }, 300);
  }
  /** The cat's word of the room: after the line that sounds now, not over it. */
  function tell() {
    let waited = 0;
    const tryNow = () => {
      if (!speaking()) { void g.speech.line('sweet_room_in', 'hint', 5000); return; }
      if ((waited += 0.25) < WORD_WAIT) scope.timeout(tryNow, 250);
    };
    tryNow();
  }
  const out = () => ({ x: o.door.x + Math.sin(o.facing) * EXIT_OUT, z: o.door.z + Math.cos(o.facing) * EXIT_OUT });

  // the camera sees the room only while she is in it; its distance there is the room's
  const farOut = camera.far;
  let wasIn = false;
  scope.own(() => { if (wasIn) { camera.far = farOut; camera.updateProjectionMatrix(); if (g.camOverride === ROOM_CAM) g.camOverride = null; } });

  return {
    spots: [
      { pos: o.door, r: 2.2, label: 'sweet_room', on: () => o.open() && !moving, run: () => moveTo(r.doorIn, ROOM.y, Math.PI, true) },
      { pos: doorIn, r: DOOR_IN_R, label: 'sweet_out', on: () => !moving, run: () => { const p = out(); moveTo(p, g.groundY(p.x, p.z), o.facing, false); } },
      { pos: jarAt, r: 1.4, label: o.jar.label as Spot['label'], on: () => o.open() && !moving && o.jar.on(), run: o.jar.run },
    ],
    inside: () => inRoom(hp.x, hp.z),
    doorOut: o.door, doorIn, jarAt,
    update() {
      const inside = inRoom(hp.x, hp.z);
      room.visible = inside;
      if (inside !== wasIn) {
        wasIn = inside;
        camera.far = inside ? ROOM_FAR : farOut; camera.updateProjectionMatrix();
        // brought in or out not by its doors (the walkthrough's teleport): the camera's distance follows
        if (inside) g.camOverride = ROOM_CAM; else if (g.camOverride === ROOM_CAM) g.camOverride = null;
      }
    },
  };
}
