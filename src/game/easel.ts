import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sfx } from '../core/audio';
import { mat } from '../core/style';
import { showPicture } from '../ui/picture';
import { openEasel } from '../ui/easel';
import { COLLECT_KINDS, EASEL_ITEM, EASEL_LED, cellFlag, easelSign, easelWaits, foundOf, leadsToEasel, looseCells, pictureSet, piecesFound, piecesOf, setCells } from './collections';
import type { Game } from './context';
import { easelStand } from './easel-place';
import type { Spot } from './player';

/**
 * The easel of a world (PLAY-29, the customer's word of 2026-11-26: «кусочки пазла спрятаны по миру … у мольберта
 * показываются уже найденные — ребёнок ставит их на картину сам»). The pieces of the world's picture are finds of its
 * collections (kind `piece`, src/game/collect-items.ts): found, they lie by the easel until she sets each on its cell
 * (src/ui/easel.ts). She may set some and leave at any time; what is set stays (the world's flags `pic_<cell>`). The last
 * one set, the picture comes alive (src/ui/picture.ts), the cat says so, and the world gives one star - once.
 *
 * A world has one where WorldDef.easel puts it, and only with a picture (CollectDef.picture). Made anew for every world
 * entered (src/game/context.ts `enter`), taken out with it (src/game/travel.ts). Never a step of a chain: the rule of
 * three tasks a character (src/worlds/chains.test.ts) does not see it.
 */

export type { EaselDef } from './easel-place';

/** m: how near she opens the easel (round where she stands in front of it, src/game/easel-place.ts). */
export const EASEL_SPOT_R = 2.2;
/** m: what the easel keeps clear around it. */
const EASEL_R = 0.55;
/** s: how long the sparkles lead to the easel after the world's first piece (or till she is at it). */
export const EASEL_LEAD_S = 20;
/** m: the sign over the easel, its height over the ground. */
const SIGN_Y = 2.45;

export interface EaselInWorld {
  /** Its action spot ("easel"), joined to the world's in the frame (src/game/loop.ts); none without an easel. */
  readonly spots: readonly Spot[];
  /** Opens its card, as the action button does (the walkthrough, ?debug); false - the world has none or it is open. */
  open(): boolean;
  /** Where the cat's sparkles lead when every piece is found and the picture is not set (a world's goal()); null else. */
  goal(): THREE.Vector3 | null;
  /** Where they lead for a while after the world's first piece (over the world's own goal); null else. */
  leading(): THREE.Vector3 | null;
  /** A frame: the sign over it turns and glows, a first piece found starts the lead. */
  update(time: number): void;
  /** What the walkthrough reads (?debug): the sign, the goal, the lead. */
  state(): { sign: 'off' | 'on' | 'flicker'; goal: boolean; leading: boolean; led: boolean };
  dispose(): void;
}

/** What of the game the easel uses; read live through it. */
export type EaselHost = Pick<Game, 'scene' | 'ws' | 'world' | 'ground' | 'groundY' | 'hero' | 'speech' | 'addStars' | 'above' | 'persist' | 'paused' | 'busy'>;


/** The easel of the world `g.world`, or nothing when it has none (no WorldDef.easel or no picture). */
export function createEasel(g: EaselHost): EaselInWorld {
  const def = g.world.easel, pic = g.world.collect?.picture, collect = g.world.collect;
  if (!def || !pic || !collect) return { spots: [], open: () => false, goal: () => null, leading: () => null, update: () => {}, state: () => ({ sign: 'off', goal: false, leading: false, led: false }), dispose: () => {} };
  const cells = piecesOf(collect).length;

  // ---- the look: three legs, a board on them, a little tile on it for every cell set ----
  const group = new THREE.Group();
  group.name = 'easel';
  const y = g.groundY(def.x, def.z);
  group.position.set(def.x, y, def.z);
  group.rotation.y = def.facing;
  const owned: THREE.BufferGeometry[] = [];
  const add = (geo: THREE.BufferGeometry, m: THREE.Material, x: number, yy: number, z: number, rx = 0, rz = 0) => {
    owned.push(geo);
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, yy, z); mesh.rotation.set(rx, 0, rz);
    mesh.castShadow = true;
    group.add(mesh);
    return mesh;
  };
  const wood = mat.wood('#9a6a3a');
  const leg = new THREE.CylinderGeometry(0.035, 0.045, 1.7, 6);
  add(leg, wood, -0.42, 0.82, 0.08, -0.12, 0.2);
  add(leg.clone(), wood, 0.42, 0.82, 0.08, -0.12, -0.2);
  add(leg.clone(), wood, 0, 0.8, -0.38, 0.35, 0);
  add(new THREE.BoxGeometry(1.25, 0.06, 0.12), wood, 0, 0.72, 0.16);                        // the ledge the board stands on
  const board = new THREE.Group();
  board.position.set(0, 1.12, 0.12); board.rotation.x = -0.12;
  group.add(board);
  const boardGeo = new THREE.BoxGeometry(1.15, 0.68, 0.04);
  owned.push(boardGeo);
  board.add(new THREE.Mesh(boardGeo, mat.cloth('#f4ead6')));
  const tileGeo = new THREE.BoxGeometry(1.0 / pic.cols, 0.56 / pic.rows, 0.02);
  owned.push(tileGeo);
  const tileMat = mat.glow(COLLECT_KINDS.piece.color, 0.25);
  const tiles = Array.from({ length: cells }, (_, cell) => {
    const t = new THREE.Mesh(tileGeo, tileMat);
    const col = cell % pic.cols, row = Math.floor(cell / pic.cols);
    t.scale.set(0.9, 0.9, 1);
    t.position.set((col - (pic.cols - 1) / 2) * (1.0 / pic.cols), ((pic.rows - 1) / 2 - row) * (0.56 / pic.rows), 0.03);
    board.add(t);
    return t;
  });
  const showSet = () => { const set = setCells(collect, g.ws.flags); tiles.forEach((t, cell) => { t.visible = set.includes(cell); }); };
  showSet();
  // the sign over it, seen from afar (the customer's word of 2026-11-27): a little glowing frame, turning; it flickers
  // while found pieces lie by the easel, and is gone once the picture is set. One mesh, its own material (it pulses).
  const signParts = [[0, 0.2, 0.5, 0.06], [0, -0.2, 0.5, 0.06], [-0.22, 0, 0.06, 0.46], [0.22, 0, 0.06, 0.46]]
    .map(([x, yy, w, h]) => new THREE.BoxGeometry(w, h, 0.06).translate(x, yy, 0));
  const signGeo = mergeGeometries(signParts, false)!;
  signParts.forEach((p) => p.dispose());
  owned.push(signGeo);
  const signMat = mat.own('glow', '#ffd447', 0.9);
  const sign = new THREE.Mesh(signGeo, signMat);
  sign.name = 'easel-sign';
  sign.position.set(def.x, y + SIGN_Y, def.z);
  g.scene.add(sign);
  g.scene.add(group);
  g.ground.block(def.x, def.z, EASEL_R);

  // ---- the card ----
  let opened = false;
  const open = (): boolean => {
    if (opened) return false;
    const flags = g.ws.flags;
    if (pictureSet(collect, flags)) { showPicture(pic); return true; }       // whole: it comes alive again
    const loose = looseCells(collect, foundOf(g.ws), flags);
    void g.speech.line(loose.length ? 'easel_some' : 'easel_hi', 'hint', 5000);
    opened = true;
    openEasel({
      picture: pic, set: setCells(collect, flags), loose,
      pause: (on) => { g.paused = on; },
      good: () => sfx('pop'),
      place: (cell) => {
        g.ws.flags[cellFlag(cell)] = true;
        showSet();
        g.persist();
      },
      closed: () => {
        opened = false;
        if (!pictureSet(collect, g.ws.flags) || g.ws.flags[EASEL_ITEM]) return;
        // the last piece set: the picture comes alive, the cat says so, one star - once (EASEL_ITEM is its mark)
        g.ws.flags[EASEL_ITEM] = true;
        g.addStars(1, g.above(g.hero.root.position, 1.4));     // a literal, as src/game/no-penalties.test.ts reads it
        showPicture(pic);
        void g.speech.line('picture_done', 'hint', 4000);
        g.persist();
      },
    });
    return true;
  };
  const at = easelStand(def);
  const spot: Spot = { pos: new THREE.Vector3(at.x, g.groundY(at.x, at.z), at.z), r: EASEL_SPOT_R, label: 'easel_open', on: () => !opened, run: () => { open(); } };

  // the lead after the world's first piece: the pieces found as the world was entered; a rise from none starts it
  let before = piecesFound(collect, foundOf(g.ws)), leadUntil = -1, now = 0;
  const near = () => Math.hypot(g.hero.root.position.x - spot.pos.x, g.hero.root.position.z - spot.pos.z) < EASEL_SPOT_R;
  const isLeading = () => now < leadUntil && !opened && !near();
  const signOf = () => easelSign(collect, foundOf(g.ws), g.ws.flags);

  return {
    spots: [spot],
    open,
    goal: () => (easelWaits(collect, foundOf(g.ws), g.ws.flags) ? spot.pos : null),
    leading: () => (isLeading() ? spot.pos : null),
    update: (time) => {
      now = time;
      const found = foundOf(g.ws);
      if (leadsToEasel(collect, before, found, g.ws.flags)) {
        g.ws.flags[EASEL_LED] = true;
        g.persist();
        leadUntil = time + EASEL_LEAD_S;
      }
      before = piecesFound(collect, found);
      if (leadUntil >= 0 && !isLeading()) leadUntil = -1;      // she came, or the time is over: the lead is done
      const s = signOf();
      sign.visible = s !== 'off';
      if (!sign.visible) return;
      sign.rotation.y = time * 0.9;
      sign.position.y = y + SIGN_Y + Math.sin(time * 1.6) * 0.08;
      signMat.emissiveIntensity = s === 'flicker' ? 0.55 + 0.6 * (0.5 + 0.5 * Math.sin(time * 6)) : 0.9;
    },
    state: () => ({ sign: signOf(), goal: easelWaits(collect, foundOf(g.ws), g.ws.flags), leading: isLeading(), led: g.ws.flags[EASEL_LED] === true }),
    dispose: () => {
      g.scene.remove(group, sign);
      signMat.dispose();
      for (const geo of owned) geo.dispose();
    },
  };
}
