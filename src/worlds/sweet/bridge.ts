import * as THREE from 'three';
import { sfx } from '../../core/audio';
import { createRng } from '../../core/rng';
import type { Game } from '../../game/context';
import { levelFor } from '../../game/skills';
import type { WorldScope } from '../../game/scope';
import type { TaskResult } from '../../game/taskviews/panel';
import type { Npc, WorldTask } from '../../game/world';
import {
  RISE, bridgeLevel, generateBridge, leftOut, rightOnes, shapesOf, showBridgeInWorld,
  type BridgeRule, type BridgeSpec, type BridgeView, type Tile, type TileColor, type TileShape,
} from '../../game/worldtasks/bridge';
import { forget, keep, keptOf } from '../../game/worldtasks/kept';
import type { WorldTaskPlayer } from '../../game/worldtasks/play';
import { tf, type Key } from '../../ui/strings';
import { BRIDGE } from './layout';

/**
 * Kakao's shape bridge over the chocolate river (WORLD-20, src/game/worldtasks/bridge.ts) as the first step of his
 * chain: he asks, the talk ends, the heroine walks to the river by the bridge - the cat's sparkles lead there, as to any
 * goal - and the task opens in its frame once she stands on the bank. As the sea's shell lock does, the step hands the
 * conversation its result, which records it in `classify` exactly as a panel task (src/game/dialogue.ts `stepDone`; the
 * customer's decision 2026-11-18).
 *
 * Drawn here in grey-build shapes: the waffle tiles - flat shapes of a glaze colour with a waffle grid on them - float
 * on the chocolate just upstream of the bridge (north of it), tipped up a little toward the child so a circle looks
 * round from above; along the bridge's upstream side, level with its planks, lies the new waffle deck with its empty
 * places (white rings), one for each tile that keeps the rule. A tile that keeps it rises out of the chocolate in an arc
 * and lies flat in the next place; one that does not
 * gently wobbles and stays where it floats (the card). The child looks south across the floating tiles to the deck and
 * stands on the east bank, the miller's side.
 *
 * How the bridge and walking go together: the river is crossable by the bridge from the start (step 1 of the grey build)
 * and stays so - the card asks the tiles to make "the bridge", not to open the way, and a world that could not be
 * crossed before a task would lock the market and the mill apart. This task lays the bridge's waffle deck as its picture:
 * the tiles in the deck stay there when she closes the task or walks away, and after a reload (`ws.tasks.shapebridge`:
 * the seed of the bridge, its level, the wrong moves so far, the tiles in the deck, src/game/worldtasks/kept.ts); once
 * the chain is past it the whole deck lies there.
 *
 * The grey build speaks no line of its own: the eight recorded questions of the bridge (docs/worlds/world-4.md) are in
 * the draft of lines and not in the game yet, so the question is a recorded line of the game ("let's find together those
 * that are alike", `h2_odd`) under the world's subtitle that names the rule (`sweet_bridge_<rule>`, ./strings.ts); on the
 * way the bubble is `sweet_bridge_way` under the same line.
 */

/** The id of the step (not `odd`: that is the panel's odd one out, which stood in for it in steps 1-3). */
export const BRIDGE_STEP = 'shapebridge';
/** m: the heroine this near the bank before the tiles opens the task; she must walk this much farther off to open it again. */
export const OPEN_R = 3, AGAIN_R = 6;

/** The direction the child looks across the tiles to the deck: south, along the river (radians, 0 = +z). */
const FACING = 0;
const FX = Math.sin(FACING), FZ = Math.cos(FACING);         // away from the child, toward the bridge
const RX = -Math.cos(FACING), RZ = Math.sin(FACING);        // to the child's right
/** The edge of the deck the tiles float before (its upstream side), in the world: the middle of the place-local frame. */
const EDGE = { x: BRIDGE.x - FX * (BRIDGE.w / 2), z: BRIDGE.z - FZ * (BRIDGE.w / 2) };

const R_BIG = 0.5, R_SMALL = 0.42;  // m: the size of a tile (its circle's radius); the small one a little smaller, big enough to tap on a phone
const THICK = 0.08;                 // m: the thickness of a waffle tile
const COL_GAP = 1.2;                // m between two tiles across a row of three
const COL_GAP_4 = 1.1;              // m across the row of four (ten tiles): the widest tile is 1.05 m, the river 4.8 m
const ROW_GAP = 1.15;               // m between two rows, along the river
const FIRST_ROW = 1.95;             // m upstream of the deck's edge: the row nearest the bridge, clear of the new deck
// m from the deck's upstream edge to the line of the new deck's places, upstream (negative): the waffle deck the tiles
// make is laid along the bridge's upstream side, level with its planks, before its rail. The camera of the task looks
// from upstream: places on the old deck lay behind its rail (0.85 m high at its edge) and, far up the picture of a phone
// held sideways, under the bubble of the line (the pictures of 2026-11-23)
const SLOT_V = -0.68;
const LEDGE_W = 1.2;                // m: the width of the new waffle deck along the river
const SLOT_GAP = 1.15;              // m between two places of the deck
const TIP = -0.4;                   // rad: a floating tile tipped up toward the child (a circle seen from above stays round)
const PLANKS = 0.23;                // m: the top of the planks over the bridge's ground (src/worlds/sweet/scenery.ts)
const WOBBLE_S = 0.9;               // s of game time a wrong tile wobbles
// m over the water where the camera looks: between the water and the new deck (about 0.6 m over it in the world), so the
// deck's places stay under the bubble of a phone held sideways while the near tiles stay in the picture
const LOOK_Y = 0.6;
const NEAR_SHIFT = 0.06;            // the share of the frame's depth its middle lies nearer the child than the middle of the things
const DEPTH_MARGIN = 1.12;          // the frame takes in this much more along the view than the things span: a margin on a short screen
/** The glaze colours (the panel's figures' names, ../tasks/odd.ts FIG_COLORS). */
const GLAZE: Readonly<Record<TileColor, string>> = { red: '#e8364f', blue: '#4f8fe6', yellow: '#ffd84a', green: '#5fbf52' };
const RING = '#fffaf2', OUTLINE = '#ffffff', LEDGE = '#e8c48a';

/** A point by the bridge: `u` to the child's right, `v` toward the bridge from its upstream edge (onto the deck past 0). */
const local = (u: number, v: number, y: number) => new THREE.Vector3(EDGE.x + RX * u + FX * v, y, EDGE.z + RZ * u + FZ * v);

/** The outline of a tile's shape round its middle, for a tile of size `r` (the circle's radius). */
export function tileOutline(s: TileShape, r: number): THREE.Shape {
  const sh = new THREE.Shape();
  const poly = (pts: [number, number][]) => { sh.moveTo(...pts[0]); for (const p of pts.slice(1)) sh.lineTo(...p); sh.closePath(); };
  if (s === 'circle') sh.absarc(0, 0, r, 0, Math.PI * 2, false);
  else if (s === 'oval') sh.absellipse(0, 0, r * 1.05, r * 0.65, 0, Math.PI * 2, false, 0);
  else if (s === 'square') poly([[-r * 0.82, -r * 0.82], [r * 0.82, -r * 0.82], [r * 0.82, r * 0.82], [-r * 0.82, r * 0.82]]);
  else if (s === 'rect') poly([[-r, -r * 0.5], [r, -r * 0.5], [r, r * 0.5], [-r, r * 0.5]]);
  else if (s === 'triangle') poly([[-r, -r * 0.75], [r, -r * 0.75], [0, r * 0.98]]);
  else poly([[0, -r * 1.05], [r * 0.7, 0], [0, r * 1.05], [-r * 0.7, 0]]);   // the rhombus: a diamond, taller than wide
  return sh;
}

/** A waffle grid on a small canvas (no file): the tiles' map; null with no canvas (a unit test). */
function waffleTexture(): THREE.Texture | null {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const x = c?.getContext?.('2d');
  if (!c || !x) return null;
  c.width = c.height = 64;
  x.fillStyle = '#ffffff'; x.fillRect(0, 0, 64, 64);
  x.fillStyle = '#c9c0b4';
  x.fillRect(0, 0, 64, 7); x.fillRect(0, 0, 7, 64);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(4, 4);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export interface BridgeDrawing extends BridgeView {
  readonly group: THREE.Group;
  /** The tiles in the order of the description; `userData.tile` - its shape, colour, size. */
  readonly tiles: readonly THREE.Mesh[];
  /** Where each place of the deck lies, in the order the tiles rise into them. */
  readonly slots: readonly THREE.Vector3[];
  /** The outlines of the second rung (one mesh for all of them), visible while it is on. */
  readonly outlines: THREE.Object3D;
  /** The tiles in the deck, by number. */
  readonly inDeck: readonly number[];
  /** The bridge is done: the tiles that keep no rule drift off down the river and are gone. */
  finish(now?: boolean): void;
  update(dt: number, time: number): void;
  dispose(): void;
}

/**
 * Draws the bridge of `spec` with the tiles `placed` in the deck (in that order), the others floating. One mesh per
 * tile (each moves), one for all the places of the deck, one for all the outlines of the hint: few draw calls by the
 * river, which the grey build measures (docs/worlds/world-4.md «Кадр»).
 */
export function drawBridge(scene: THREE.Scene, spec: BridgeSpec, placed: readonly number[], groundY: (x: number, z: number) => number): BridgeDrawing {
  const { tiles: body, rule } = spec.body;
  const group = new THREE.Group();
  group.name = 'kakao-bridge-tiles';
  const deckY = groundY(BRIDGE.x, BRIDGE.z) + PLANKS;
  // the chocolate's surface as the river's mesh lays it (src/worlds/sweet/scenery.ts riverMesh): over the bed, a little under the banks
  const water = (p: THREE.Vector3) => Math.max(groundY(p.x, p.z), groundY(p.x + 2.6, p.z) - 0.25, groundY(p.x - 2.6, p.z) - 0.25) + 0.05;
  const disposables: { dispose(): void }[] = [];
  const own = <T extends { dispose(): void }>(x: T) => { disposables.push(x); return x; };

  // the places of the deck: one for every tile that keeps the rule, across the deck
  const n = rightOnes(spec.body).length;
  const slots = Array.from({ length: n }, (_, k) => local((k - (n - 1) / 2) * SLOT_GAP, SLOT_V, deckY + 0.02));
  // the new deck itself: a pale waffle board along the bridge's upstream side, level with its planks, as long as its places
  const ledgeLen = (n - 1) * SLOT_GAP + R_BIG * 2 + 0.3;
  const ledge = new THREE.Mesh(own(new THREE.BoxGeometry(ledgeLen, 0.12, LEDGE_W)), own(new THREE.MeshStandardMaterial({ color: LEDGE, roughness: 0.8 })));
  ledge.position.copy(local(0, SLOT_V, deckY - 0.06));
  ledge.rotation.y = FACING;
  ledge.name = 'bridge-new-deck';
  ledge.receiveShadow = true;
  const flatRing = (r: number, at: THREE.Vector3) => new THREE.RingGeometry(r * 0.9, r, 32).rotateX(-Math.PI / 2).translate(at.x, at.y, at.z);
  const merged = (list: THREE.BufferGeometry[]) => {
    const pos: number[] = [];
    for (const g of list) { const x = g.index ? g.toNonIndexed() : g; pos.push(...(x.getAttribute('position').array as Float32Array)); if (x !== g) x.dispose(); g.dispose(); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    return out;
  };
  const ringMesh = new THREE.Mesh(own(merged(slots.map((p) => flatRing(R_BIG * 1.05, p)))), own(new THREE.MeshBasicMaterial({ color: RING, side: THREE.DoubleSide })));
  ringMesh.name = 'bridge-places';
  // the second rung: the shape asked for drawn on every place (a rule of several shapes - each in turn), flat lines
  const asked = shapesOf(rule);
  const outlinePos: number[] = [];
  slots.forEach((p, k) => {
    const pts = tileOutline(asked[k % asked.length], R_BIG * 0.8).getPoints(24);
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      // shape x across the view, shape y away from the child, flat on the deck
      for (const q of [a, b]) outlinePos.push(p.x + RX * q.x + FX * q.y, p.y + 0.02, p.z + RZ * q.x + FZ * q.y);
    }
  });
  const outlineGeo = own(new THREE.BufferGeometry());
  outlineGeo.setAttribute('position', new THREE.Float32BufferAttribute(outlinePos, 3));
  const outlines = new THREE.LineSegments(outlineGeo, own(new THREE.LineBasicMaterial({ color: OUTLINE })));
  outlines.name = 'bridge-outlines';
  outlines.visible = false;
  group.add(ledge, ringMesh, outlines);

  // the tiles floating upstream of the deck in rows across the river - two rows of three, else three rows, the fuller
  // ones nearer the bridge (ten: 4, 3, 3). Three rows at most: a phone held sideways is short, and every row more
  // stands the camera farther back and makes every tile smaller on it
  const rows = body.length <= 6 ? 2 : 3;
  const counts = Array.from({ length: rows }, (_, r) => Math.floor(body.length / rows) + (r < body.length % rows ? 1 : 0));
  const floating = body.map((_, i) => {
    let row = 0, col = i;
    while (col >= counts[row]) { col -= counts[row]; row++; }
    const inRow = counts[row];
    // a little out of the line, the same every time (the river does not lay them by a ruler)
    const j = createRng(`tile:${i}`);
    const p = local((col - (inRow - 1) / 2) * (inRow >= 4 ? COL_GAP_4 : COL_GAP) + (j() - 0.5) * 0.08, -FIRST_ROW - row * ROW_GAP + (j() - 0.5) * 0.12, 0);
    p.y = water(p) + THICK / 2 + 0.02;
    return p;
  });
  const waffle = waffleTexture();
  if (waffle) own(waffle);
  // turned by the facing, the shape's x goes to the child's right and its y away from her (see the geometry below)
  const yaw = FACING;
  const meshes = body.map((t, i) => {
    const r = t.small ? R_SMALL : R_BIG;
    const geo = own(new THREE.ExtrudeGeometry(tileOutline(t.shape, r), { depth: THICK, bevelEnabled: false, curveSegments: 20 }).rotateX(-Math.PI / 2).translate(0, -THICK / 2, 0));
    // the extrusion's face is turned up (its y now -z); half a turn puts the shape's y to +z and its x to -x - away from
    // the child and to her right when she looks along +z, as the mesh's yaw by FACING keeps them for any facing
    geo.rotateY(Math.PI);
    const m = new THREE.Mesh(geo, own(new THREE.MeshStandardMaterial({ color: GLAZE[t.color], map: waffle, emissive: '#ffd27a', emissiveIntensity: 0, roughness: 0.7 })));
    m.name = `bridge-tile-${i}`;
    m.userData = { tile: t, r };
    m.rotation.order = 'YXZ';
    m.receiveShadow = true;
    group.add(m);
    return m;
  });
  scene.add(group);

  const inDeck: number[] = placed.filter((i) => Number.isInteger(i) && i >= 0 && i < body.length);
  const rising = new Map<number, number>(), wobbling = new Map<number, number>();
  let glowing: number | null = null, dimmed = false, gone = 0, finishing = false;
  const base = meshes.map((m) => (m.material as THREE.MeshStandardMaterial).color.clone());
  const dimColour = leftOut(rule);

  /** The pose of tile `i`: floating where it lies (`k` 0), or in its place of the deck (`k` 1), between them while it rises. */
  const pose = (i: number, k: number) => {
    const m = meshes[i], slot = inDeck.indexOf(i);
    const from = floating[i], to = slot >= 0 ? slots[slot] : from;
    const e = k * k * (3 - 2 * k);
    m.position.lerpVectors(from, to, e);
    if (slot >= 0) m.position.y = from.y + (to.y + THICK / 2 - from.y) * e + Math.sin(e * Math.PI) * 0.9;
    m.rotation.set(TIP * (1 - e), yaw, 0);
  };
  meshes.forEach((_, i) => pose(i, inDeck.includes(i) ? 1 : 0));

  // the camera looks from above and behind the child: the near tiles come out larger and lower than the far deck, so the
  // middle it looks at lies NEAR_SHIFT of the way from the middle toward the child, and the frame takes in the far end
  const near = Math.min(...floating.map((p) => (p.x - EDGE.x) * FX + (p.z - EDGE.z) * FZ)) - R_BIG, far = SLOT_V + LEDGE_W / 2;
  const v0 = (near + far) / 2 - NEAR_SHIFT * (far - near);
  const center = local(0, v0, water(local(0, -FIRST_ROW, 0)) + LOOK_Y);
  const depth = (far - v0) * DEPTH_MARGIN;
  const side = Math.max(...floating.map((p, i) => Math.abs((p.x - EDGE.x) * RX + (p.z - EDGE.z) * RZ) + (meshes[i].userData.r as number) * 1.05), ...slots.map((p) => Math.abs((p.x - EDGE.x) * RX + (p.z - EDGE.z) * RZ) + R_BIG)) + 0.1;

  const drawing: BridgeDrawing = {
    group, tiles: meshes, slots, outlines,
    get inDeck() { return [...inDeck]; },
    center, facing: FACING, extent: { side, depth },
    tile: (i) => ({ pos: meshes[i].position.clone(), r: (meshes[i].userData.r as number) }),
    rise: (i, k) => { if (!inDeck.includes(i)) inDeck[k] = i; wobbling.delete(i); rising.set(i, -1); },
    wobble: (i) => { wobbling.set(i, -1); },
    outline: (on) => { outlines.visible = on; },
    dim: (on) => { dimmed = on; },
    glow: (i) => { glowing = i; },
    finish: (now = false) => { finishing = true; glowing = null; dimmed = false; outlines.visible = false; if (now) gone = 1; },
    update: (dt, t) => {
      if (finishing) gone = Math.min(1, gone + dt / 1.5);
      meshes.forEach((m, i) => {
        if (rising.has(i)) {
          if (rising.get(i)! < 0) rising.set(i, t);
          const k = Math.min(1, (t - rising.get(i)!) / RISE);
          pose(i, k);
          if (k >= 1) rising.delete(i);
        } else if (inDeck.includes(i)) pose(i, 1);
        else {
          pose(i, 0);
          // floating: bobbing on the chocolate, each in its own time
          m.position.y += Math.sin(t * 1.7 + i * 1.3) * 0.025;
          m.rotation.z = Math.sin(t * 1.1 + i) * 0.04;
          if (wobbling.has(i)) {
            if (wobbling.get(i)! < 0) wobbling.set(i, t);
            const k = Math.min(1, (t - wobbling.get(i)!) / WOBBLE_S);
            // a wrong tile: it lifts a little, rocks side to side, and settles where it was
            m.position.y += Math.sin(k * Math.PI) * 0.14;
            m.rotation.z += Math.sin(k * Math.PI * 5) * 0.28 * (1 - k);
            if (k >= 1) wobbling.delete(i);
          }
          if (i === glowing) m.position.y += 0.08 + Math.abs(Math.sin(t * 5)) * 0.1;
          // done: the tiles left drift off downstream (away from the child, under the bridge) and sink
          if (gone > 0) { m.position.addScaledVector(new THREE.Vector3(FX, 0, FZ), gone * 2.5); m.position.y -= gone * 0.4; }
          m.visible = gone < 1;
        }
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = i === glowing ? 0.35 + 0.3 * Math.sin(t * 6) : 0;
        mat.color.copy(base[i]);
        if (dimmed && dimColour && (m.userData.tile as Tile).color === dimColour && !inDeck.includes(i)) mat.color.multiplyScalar(0.3);
      });
    },
    dispose: () => {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
  return drawing;
}

/** The world's subtitle that names a rule (./strings.ts). */
export const RULE_TEXT: Readonly<Record<BridgeRule, Key>> = {
  circle: 'sweet_bridge_circle', square: 'sweet_bridge_square', triangle: 'sweet_bridge_triangle', rect: 'sweet_bridge_rect',
  oval: 'sweet_bridge_oval', rhombus: 'sweet_bridge_rhombus', corners3: 'sweet_bridge_corners3',
  roundNotRed: 'sweet_bridge_roundNotRed', cornersNotBlue: 'sweet_bridge_cornersNotBlue',
};

export interface BridgeStep extends WorldTask {
  /** The bridge that lies by the river now. */
  readonly spec: BridgeSpec;
  readonly drawing: BridgeDrawing;
  /** A frame: the drawing moves, and the task opens when she comes to the bank. */
  update(dt: number, time: number, canMove: boolean): void;
  /** The place on the bank while the step is on and the task is not open; else null. */
  goal(): THREE.Vector3 | null;
  /**
   * The walkthrough's move (`__game.cheat`): she is put on the bank (the task opens at the next frame); once she has
   * closed it, first a step away out of AGAIN_R, then back - as a child walks off and comes back. False when not on.
   */
  cheat(): boolean;
  /** The step is done: the whole waffle deck lies on the bridge, nothing floats. */
  opened(done: boolean): void;
  dispose(): void;
}

export function createBridge(g: Game, player: WorldTaskPlayer, scope: WorldScope): BridgeStep {
  const { scene, groundY, hero } = g;
  let spec!: BridgeSpec, seed = 0, level = 1, drawing!: BridgeDrawing;
  /** The kept middle: [seed, level, wrong moves so far, ...the tiles in the deck]. */
  const kept = () => keptOf(g.ws, BRIDGE_STEP);
  const build = (s: number, l: number, placed: readonly number[]) => {
    seed = s; level = bridgeLevel(l);
    spec = generateBridge(level, createRng(`bridge:${seed}`));
    drawing?.dispose();
    drawing = drawBridge(scene, spec, placed, groundY);
  };
  const k0 = kept();
  if (k0.length >= 3) build(k0[0], k0[1], k0.slice(3)); else build(Math.floor(g.rng() * 1e6), levelFor(g.save, 'classify'), []);
  // the bank she walks to: on the east bank (the miller's side), level with the tiles, out of the chocolate
  const bank = (() => {
    const p = drawing.center.clone().addScaledVector(new THREE.Vector3(-RX, 0, -RZ), drawing.extent.side + 1.6);
    return new THREE.Vector3(p.x, groundY(p.x, p.z), p.z);
  })();

  let on = false, owner: Npc | null = null, finished: (played?: TaskResult) => void = () => {}, armed = true, playing = false;
  const WAY = 'h2_odd';
  const bubble = () => { g.speech.caption({ key: WAY, pri: 'story', hold: 0, speaker: '🍫', text: tf('sweet_bridge_way', {}) }); };
  const wrongsNow = () => kept()[2] ?? 0;
  const store = (placed: readonly number[], wrongs: number) => { keep(g.ws, BRIDGE_STEP, [seed, level, wrongs, ...placed]); g.persist(); };

  function play() {
    armed = false; playing = true;
    g.speech.caption(null);
    const hooks = g.hooksFor('🍫');
    // the recorded question of the game, under the world's own subtitle that names the rule
    const sub = tf(RULE_TEXT[spec.body.rule], {});
    const show = showBridgeInWorld(spec, drawing, { ...hooks, prompt: (key) => { void g.speech.line(key, 'task', 0, '🍫', sub); } },
      { reach: g.touch ? 70 : 46, scope, kept: drawing.inDeck, before: wrongsNow(), keep: store });
    void g.task(() => player.play(show)).then((res) => {
      playing = false;
      if (!res.solved) { if (on) bubble(); return; }
      on = false;
      forget(g.ws, BRIDGE_STEP);
      g.speech.caption(null);
      drawing.finish();
      sfx('fanfare');
      g.sparks.burst(new THREE.Vector3(BRIDGE.x, groundY(BRIDGE.x, BRIDGE.z) + 1, BRIDGE.z), '#ffd0dc', 50, 4);
      g.persist();
      // the result handed on: the conversation records it in `classify`, as a panel task (the customer's decision 2026-11-18)
      finished(res);
    });
  }

  return {
    skill: 'classify', endsInWorld: true,
    get spec() { return spec; },
    get drawing() { return drawing; },
    start(n, done) {
      owner = n; finished = done; armed = true;
      // a middle kept: that bridge, its tiles in the deck; else a new one for the level of now
      if (kept().length < 3) build(Math.floor(g.rng() * 1e6), levelFor(g.save, 'classify'), []);
      on = true;
      store(drawing.inDeck, wrongsNow());
      bubble();
    },
    active: () => on,
    owner: () => (on ? owner?.def.id ?? null : null),
    reask: async () => { bubble(); },
    update(dt, time, canMove) {
      drawing.update(dt, time);
      if (!on || playing) return;
      const hp = hero.root.position, d = Math.hypot(hp.x - bank.x, hp.z - bank.z);
      if (d > AGAIN_R) armed = true;
      if (!g.busy && g.speech.shown?.key !== WAY) bubble();
      if (canMove && armed && d < OPEN_R) play();
    },
    goal: () => (on && !playing ? bank : null),
    cheat() {
      if (!on || playing) return false;
      if (!armed) {
        // closed before: she walks off first, out of AGAIN_R along the bank, and the next move brings her back
        const off = bank.clone().addScaledVector(new THREE.Vector3(-RX, 0, -RZ), AGAIN_R + 1.5);
        hero.root.position.set(off.x, groundY(off.x, off.z), off.z);
        armed = true;
        return true;
      }
      hero.root.position.set(bank.x, groundY(bank.x, bank.z), bank.z);
      return true;
    },
    opened(done) {
      if (!done) return;
      // a chain past the bridge: its deck whole, every tile that keeps the rule in it, nothing left floating
      build(seed, level, rightOnes(spec.body));
      drawing.finish(true);
    },
    dispose() { drawing.dispose(); },
  };
}
