import * as THREE from 'three';
import { sfx } from '../../core/audio';
import { createRng } from '../../core/rng';
import type { Game } from '../../game/context';
import { levelFor } from '../../game/skills';
import type { WorldScope } from '../../game/scope';
import type { Npc, WorldTask } from '../../game/world';
import { FLY, SHAPES, generateHouse, houseLevel, showHouseInWorld, type HouseShape, type HouseSpec, type HouseView } from '../../game/worldtasks/house';
import { forget, keep, keptOf } from '../../game/worldtasks/kept';
import type { WorldTaskPlayer } from '../../game/worldtasks/play';
import { tf } from '../../ui/strings';
import { HOUSE_FACADE } from './layout';

/**
 * Imbir's gingerbread house assembled in the world (WORLD-21, src/game/worldtasks/house.ts) as the third step of his
 * chain: he asks, the talk ends, the heroine walks to his house - the cat's sparkles lead there, as to any goal - and the
 * assembly opens in its frame once she stands before it. The house is drawn here in grey-build shapes: on its front an
 * outline of white icing round each empty place (a pale fill in it, so the place reads as something to tap), the pieces
 * of gingerbread propped up on the ground before it - the big ones (the wall, the roof) in the row nearer the house, the
 * small ones (the door, the windows, the chimney) in the row nearer the child - and behind the front the dark inside of
 * the house, seen through the holes of the wall. A piece that fits flies into its place and stays there; one that does
 * not goes toward the place and comes back to where it lay.
 *
 * The house stands in the world whether the task is open or not: what is assembled stays in its places when she closes
 * the task or walks away, and after a reload (`ws.tasks.house`: the seed of the house, its level, the pieces standing,
 * src/game/worldtasks/kept.ts). Assembled, the door swings open and the step is done with no result: the house is
 * written to no skill (the customer's decision 2026-11-18, docs/worlds/world-4.md question 3) - the conversation records
 * a skill only for a result it is handed (src/game/dialogue.ts `stepDone`). Ruby 2 is then seen in the doorway (WORLD-08):
 * the world shows it and she takes it there by the action button (./index.ts RUBIES).
 *
 * The grey build speaks no line of its own: on the way the bubble is a subtitle (`sweet_house_way`) under the recorded
 * "let's put it together" (`t_puzzle`), which is also the assembly's question once it is open.
 */

/** The id of the step (not `house`: that is the panel's number house, which stood in for it in step 1). */
export const HOUSE_STEP = 'gingerhouse';
/** m: the heroine this near the place before the house opens the assembly; she must walk this much farther off to open it again. */
export const OPEN_R = 3, AGAIN_R = 6;

/** The direction the child looks at the front of the house: west, into it (radians, 0 = +z; its door faces east, toward Imbir). */
const FACING = -Math.PI / 2;
const FX = Math.sin(FACING), FZ = Math.cos(FACING);         // into the house, away from the child
const SX = -Math.cos(FACING), SZ = Math.sin(FACING);        // across the front, from the child's left to her right

/**
 * Where each place stands on the front: `u` across it from its middle (to the child's right), `y` the middle of the
 * shape over the ground, `lift` how far before the front (the door, the windows and the chimney before the wall).
 */
const ON_FRONT: Readonly<Record<HouseShape, { u: number; y: number; lift: number }>> = {
  wall: { u: 0, y: SHAPES.wall.h / 2, lift: 0.02 },
  roof: { u: 0, y: SHAPES.wall.h + SHAPES.roof.h / 2, lift: 0.02 },
  roofL: { u: -SHAPES.roofL.w / 2, y: SHAPES.wall.h + SHAPES.roofL.h / 2, lift: 0.02 },
  roofR: { u: SHAPES.roofR.w / 2, y: SHAPES.wall.h + SHAPES.roofR.h / 2, lift: 0.02 },
  door: { u: 1.05, y: 0.06 + SHAPES.door.h / 2, lift: 0.1 },
  winSq: { u: -1.05, y: 1.2, lift: 0.1 },
  winTall: { u: 0, y: 1.2, lift: 0.1 },
  winRound: { u: 0, y: 1.2, lift: 0.1 },
  chimney: { u: 1.05, y: SHAPES.wall.h + 0.8, lift: 0.1 },
};
/** The second window of a house stands in the middle; a house with one window has it on the left, where the square one stands. */
function frontOf(places: readonly HouseShape[], s: HouseShape) {
  const f = ON_FRONT[s];
  const windows = places.filter((p) => p === 'winSq' || p === 'winTall' || p === 'winRound');
  return windows.length === 1 && windows[0] === s ? { ...f, u: ON_FRONT.winSq.u } : f;
}
/** The pieces of the wall and the roof are big: they lie at this share of their size, the small ones at their own. */
const BIG = new Set<HouseShape>(['wall', 'roof', 'roofL', 'roofR']);
const LIE_BIG = 0.45;
/** m before the front: the row of the big pieces, the row of the small ones. */
const ROW_BIG = 1.0, ROW_SMALL = 1.9;
const GAP = 0.3;            // m between two pieces in a row
const TILT = -0.3;          // rad: a piece lying leans back, propped on the ground
const THICK = 0.08;         // m: the thickness of a piece of gingerbread
const ICING = 0.07;         // m: the width of the icing round a place
const LOOK_Y = 2.1;         // m over the ground where the camera looks
const LOOK_OUT = 1.1;       // m before the front where the camera looks: between the roof and the row of the small pieces
const DEPTH = 3.1;          // m the frame takes in along the view (./core.ts taskFrame)
const BACK_S = 0.8;         // s of game time a piece that does not fit takes to go toward the place and come back
const DOOR_S = 1.2;         // s of game time the door takes to swing open
const DOOR_OPEN = 1.9;      // rad the door swings out toward the child
/** The colours of the grey build: gingerbread, the icing (the dark inside of the house is the body's, ./scenery.ts). */
const GINGER = '#b8763c', ICING_COLOR = '#fffaf2';

/** The outline of a shape round its middle, `grow` m wider on every side. */
function outline(s: HouseShape, grow = 0): THREE.Shape {
  const { form, w, h } = SHAPES[s], W = w / 2 + grow, H = h / 2 + grow, sh = new THREE.Shape();
  if (form === 'rect') { sh.moveTo(-W, -H); sh.lineTo(W, -H); sh.lineTo(W, H); sh.lineTo(-W, H); sh.closePath(); }
  else if (form === 'tri') { sh.moveTo(-W, -H); sh.lineTo(W, -H); sh.lineTo(0, H); sh.closePath(); }
  else if (form === 'halfL') { sh.moveTo(-W, -H); sh.lineTo(W, -H); sh.lineTo(W, H); sh.closePath(); }
  else if (form === 'halfR') { sh.moveTo(-W, -H); sh.lineTo(W, -H); sh.lineTo(-W, H); sh.closePath(); }
  else if (form === 'circle') sh.absarc(0, 0, W, 0, Math.PI * 2, false);
  else {
    // the arch: straight sides, a half circle over them
    sh.moveTo(-W, -H); sh.lineTo(W, -H); sh.lineTo(W, H - W); sh.absarc(0, H - W, W, 0, Math.PI, false); sh.closePath();
  }
  return sh;
}

/** The house's front in the world: the point of `u` across it, `y` up, `lift` before it. */
const onFront = (u: number, y: number, lift: number) => new THREE.Vector3(HOUSE_FACADE.x + SX * u - FX * lift, y, HOUSE_FACADE.z + SZ * u - FZ * lift);

/** The doorway: where ruby 2 is seen once the door stands open (inside the house, behind the door's place). */
export const DOORWAY = { x: HOUSE_FACADE.x + SX * ON_FRONT.door.u + FX * 0.15, z: HOUSE_FACADE.z + SZ * ON_FRONT.door.u + FZ * 0.15, y: ON_FRONT.door.y };

export interface HouseDrawing extends HouseView {
  readonly group: THREE.Group;
  /** The pieces in the order of the description, the place each fits in `userData.place`. */
  readonly pieces: readonly THREE.Mesh[];
  /** The door swings open (1) or stands shut (0); it opens over DOOR_S s once `open(true)`. */
  open(on: boolean, now?: boolean): void;
  readonly doorOpen: number;
  update(dt: number, time: number): void;
  dispose(): void;
}

/**
 * Draws the house of `spec` with the pieces `placed` standing in their places, the others lying before it. One mesh for
 * all the icing, one for all the pale fills (the fill of a place is faded by its colours as it fills or glows), one per
 * piece: few draw calls in the town, which the grey build measures (docs/worlds/world-4.md «Кадр»).
 */
export function drawHouse(scene: THREE.Scene, spec: HouseSpec, placed: readonly number[], groundY: (x: number, z: number) => number): HouseDrawing {
  const { places, pieces } = spec.body;
  const floor = groundY(HOUSE_FACADE.x, HOUSE_FACADE.z);
  const group = new THREE.Group();
  group.name = 'imbir-house-assembly';
  const yaw = FACING + Math.PI;            // a flat shape's face turned toward the child
  const at = places.map((s) => { const f = frontOf(places, s); return onFront(f.u, floor + f.y, f.lift); });

  // the icing round every place and the pale fill in it: two meshes for all of them (each shape flat, as a list of
  // triangles, so the fill of place k is the run of vertices from fillStart[k])
  const flat = (g: THREE.BufferGeometry) => { const x = g.toNonIndexed(); g.dispose(); x.deleteAttribute('uv'); x.deleteAttribute('normal'); return x; };
  const icingGeos: THREE.BufferGeometry[] = [], fillGeos: THREE.BufferGeometry[] = [], fillStart: number[] = [];
  let fillCount = 0;
  places.forEach((s, k) => {
    const ring = outline(s, ICING); ring.holes.push(outline(s, 0));
    icingGeos.push(flat(new THREE.ShapeGeometry(ring, 16).rotateY(yaw).translate(at[k].x - FX * 0.03, at[k].y, at[k].z - FZ * 0.03)));
    // each fill a hair before the one under it: the wall's fill does not flicker through a window's
    const fg = flat(new THREE.ShapeGeometry(outline(s, 0), 16).rotateY(yaw).translate(at[k].x - FX * 0.005 * (k + 1), at[k].y, at[k].z - FZ * 0.005 * (k + 1)));
    fillStart.push(fillCount); fillCount += fg.getAttribute('position').count;
    fillGeos.push(fg);
  });
  const merge = (list: THREE.BufferGeometry[]) => {
    const n = list.reduce((a, g) => a + g.getAttribute('position').count, 0), pos = new Float32Array(n * 3);
    let o = 0;
    for (const g of list) { pos.set(g.getAttribute('position').array as Float32Array, o * 3); o += g.getAttribute('position').count; g.dispose(); }
    const out = new THREE.BufferGeometry();
    out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    return out;
  };
  const icing = new THREE.Mesh(merge(icingGeos), new THREE.MeshBasicMaterial({ color: ICING_COLOR, side: THREE.DoubleSide }));
  icing.name = 'house-icing';
  const fillGeo = merge(fillGeos);
  const fillAlpha = new Float32Array(fillCount * 4);
  fillGeo.setAttribute('color', new THREE.BufferAttribute(fillAlpha, 4));
  const fills = new THREE.Mesh(fillGeo, new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
  fills.name = 'house-places';
  group.add(icing, fills);

  // the pieces: gingerbread a little thick; a wall piece has the holes of the door and the windows of this house
  const lieOf = (s: HouseShape) => (BIG.has(s) ? LIE_BIG : 1);
  const lying: THREE.Vector3[] = [];
  const rows = [pieces.map((s, i) => [s, i] as const).filter(([s]) => BIG.has(s)), pieces.map((s, i) => [s, i] as const).filter(([s]) => !BIG.has(s))];
  rows.forEach((row, r) => {
    const width = row.reduce((a, [s]) => a + SHAPES[s].w * lieOf(s), 0) + GAP * (row.length - 1);
    let u = -width / 2;
    for (const [s, i] of row) {
      const w = SHAPES[s].w * lieOf(s), h = SHAPES[s].h * lieOf(s);
      const p = onFront(u + w / 2, 0, r === 0 ? ROW_BIG : ROW_SMALL);
      p.y = groundY(p.x, p.z) + h / 2 * Math.cos(TILT) + 0.04;
      lying[i] = p;
      u += w + GAP;
    }
  });
  const meshes = pieces.map((s, i) => {
    const sh = outline(s, 0);
    if (s === 'wall') {
      for (const q of places) {
        if (q === 'wall' || BIG.has(q) || q === 'chimney') continue;
        // the hole where that place stands on the wall, by the wall's middle
        const f = frontOf(places, q), d = new THREE.Vector2(f.u - ON_FRONT.wall.u, f.y - ON_FRONT.wall.y);
        sh.holes.push(new THREE.Path(outline(q, 0).getPoints(24).map((v) => v.add(d))));
      }
    }
    const geo = new THREE.ExtrudeGeometry(sh, { depth: THICK, bevelEnabled: false, curveSegments: 16 }).translate(0, 0, -THICK / 2);
    const m = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: GINGER, emissive: '#ffd27a', emissiveIntensity: 0, roughness: 0.8 }));
    m.castShadow = true;
    m.name = `house-piece-${s}`;
    m.userData = { shape: s, place: places.indexOf(s) };
    group.add(m);
    return m;
  });
  scene.add(group);

  // the pose of a piece: lying (leaning back, smaller if big) or standing in its place; between them while it moves
  const standing = new Set(placed);
  const pose = (i: number, k: number) => {
    const m = meshes[i], s = pieces[i];
    const lie = lying[i], put = at[places.indexOf(s)];
    const p = new THREE.Vector3().lerpVectors(lie, put, k);
    m.position.copy(p);
    m.scale.setScalar(lieOf(s) + (1 - lieOf(s)) * k);
    m.rotation.set(0, 0, 0);
    m.rotation.order = 'YXZ';
    m.rotation.y = yaw; m.rotation.x = TILT * (1 - k);
  };
  pieces.forEach((_, i) => pose(i, standing.has(i) ? 1 : 0));

  const flying = new Map<number, { t: number }>(), going = new Map<number, { t: number; k: number }>();
  let picked: number | null = null, glowPiece: number | null = null, glowPlace: number | null = null, time = 0;
  let doorTo = 0, door = 0;
  const doorPiece = pieces.indexOf('door');
  const setFill = (k: number, a: number, c: string) => {
    const col = new THREE.Color(c), end = k + 1 < fillStart.length ? fillStart[k + 1] : fillCount;
    for (let v = fillStart[k]; v < end; v++) fillAlpha.set([col.r, col.g, col.b, a], v * 4);
  };
  const filled = (k: number) => [...standing].some((i) => places.indexOf(pieces[i]) === k);
  const paintFills = () => {
    places.forEach((_, k) => setFill(k, filled(k) ? 0 : k === glowPlace ? 0.45 + 0.4 * (0.5 + 0.5 * Math.sin(time * 6)) : 0.28, k === glowPlace ? '#ffe9a8' : '#ffffff'));
    (fillGeo.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  };
  paintFills();

  const drawing: HouseDrawing = {
    group, pieces: meshes,
    center: new THREE.Vector3(HOUSE_FACADE.x - FX * LOOK_OUT, floor + LOOK_Y, HOUSE_FACADE.z - FZ * LOOK_OUT),
    facing: FACING,
    extent: {
      // the widest of the roof and the rows of the pieces, left and right of the middle
      side: Math.max(SHAPES.roof.w / 2, ...lying.map((p, i) => Math.abs((p.x - HOUSE_FACADE.x) * SX + (p.z - HOUSE_FACADE.z) * SZ) + SHAPES[pieces[i]].w * lieOf(pieces[i]) / 2)) + 0.1,
      // the top of the roof and the row of the small pieces before the house both on the screen
      depth: DEPTH,
    },
    piece: (i) => ({ pos: meshes[i].position.clone(), r: Math.max(SHAPES[pieces[i]].w, SHAPES[pieces[i]].h) * lieOf(pieces[i]) / 2 }),
    place: (k) => ({ pos: at[k].clone(), r: Math.max(SHAPES[places[k]].w, SHAPES[places[k]].h) / 2 }),
    picked: (i) => { picked = i; },
    fit: (i) => { standing.add(i); going.delete(i); flying.set(i, { t: -1 }); },
    back: (i, k) => { going.set(i, { t: -1, k }); },
    glow: (i, k) => { glowPiece = i; glowPlace = k; },
    open: (on, now = false) => { doorTo = on ? 1 : 0; if (now) door = doorTo; },
    get doorOpen() { return door; },
    update: (dt, t) => {
      time = t;
      for (const [i, f] of flying) {
        if (f.t < 0) f.t = t;
        const k = Math.min(1, (t - f.t) / FLY);
        pose(i, k);
        meshes[i].position.y += Math.sin(k * Math.PI) * 0.6;
        if (k >= 1) flying.delete(i);
      }
      // a piece that does not fit: a third of the way toward the place and back, rocking a little
      for (const [i, g] of going) {
        if (g.t < 0) g.t = t;
        const k = Math.min(1, (t - g.t) / BACK_S), toward = Math.sin(k * Math.PI) * 0.35;
        const lie = lying[i], to = at[g.k];
        pose(i, 0);
        meshes[i].position.lerpVectors(lie, to, toward);
        meshes[i].rotation.z = Math.sin(k * Math.PI * 4) * 0.12 * (1 - k);
        if (k >= 1) { going.delete(i); pose(i, 0); }
      }
      for (const [i, m] of meshes.entries()) {
        if (flying.has(i) || going.has(i) || standing.has(i)) continue;
        pose(i, 0);
        if (i === picked) m.position.y += 0.25 + Math.sin(t * 5) * 0.04;
      }
      meshes.forEach((m, i) => {
        const mat = m.material as THREE.MeshStandardMaterial;
        mat.emissiveIntensity = i === picked ? 0.45 : i === glowPiece ? 0.3 + 0.3 * Math.sin(t * 6) : 0;
      });
      // the door swings open on its hinge (the edge nearer the middle of the front), out toward the child
      door = doorTo > door ? Math.min(doorTo, door + dt / DOOR_S) : doorTo;
      if (doorPiece >= 0 && standing.has(doorPiece) && !flying.has(doorPiece)) {
        const k = places.indexOf('door'), w = SHAPES.door.w, a = -DOOR_OPEN * (door * door * (3 - 2 * door));
        const hinge = at[k].clone().addScaledVector(new THREE.Vector3(SX, 0, SZ), -w / 2);
        const m = meshes[doorPiece];
        m.position.set(hinge.x + (SX * Math.cos(a) - FX * Math.sin(-a)) * w / 2, at[k].y, hinge.z + (SZ * Math.cos(a) - FZ * Math.sin(-a)) * w / 2);
        m.rotation.set(0, yaw + a, 0);
      }
      paintFills();
    },
    dispose: () => {
      scene.remove(group);
      icing.geometry.dispose(); (icing.material as THREE.Material).dispose();
      fills.geometry.dispose(); (fills.material as THREE.Material).dispose();
      for (const m of meshes) { m.geometry.dispose(); (m.material as THREE.Material).dispose(); }
    },
  };
  return drawing;
}

export interface HouseStep extends WorldTask {
  /** The house that stands at Imbir's place now. */
  readonly spec: HouseSpec;
  /** Its drawing: the outline, the pieces, the door. */
  readonly drawing: HouseDrawing;
  /** A frame: the drawing moves, and the assembly opens when she comes before the house. */
  update(dt: number, time: number, canMove: boolean): void;
  /** The place before the house while the step is on and the assembly is not open; else null. */
  goal(): THREE.Vector3 | null;
  /**
   * The walkthrough's move (`__game.cheat`): she is put before the house (the assembly opens at the next frame); once
   * she has closed it, first a step away out of AGAIN_R, then back - as a child walks off and comes back. False when not on.
   */
  cheat(): boolean;
  /** The step is done: the house stands assembled, its door open from the start. */
  opened(done: boolean): void;
  dispose(): void;
}

export interface HouseStepOptions {
  /** The house is assembled and its door opens: what lies inside is shown (ruby 2, ./index.ts). */
  inside(): void;
}

export function createHouse(g: Game, player: WorldTaskPlayer, scope: WorldScope, o: HouseStepOptions): HouseStep {
  const { scene, groundY, hero } = g;
  const before = new THREE.Vector3(HOUSE_FACADE.x - FX * 4.6, groundY(HOUSE_FACADE.x - FX * 4.6, HOUSE_FACADE.z), HOUSE_FACADE.z);

  let spec!: HouseSpec, seed = 0, level = 1, drawing!: HouseDrawing;
  /** The kept middle: [seed, level, ...the pieces standing]. */
  const kept = () => keptOf(g.ws, HOUSE_STEP);
  const build = (s: number, l: number, placed: readonly number[]) => {
    seed = s; level = houseLevel(l);
    spec = generateHouse(level, createRng(`house:${seed}`));
    drawing?.dispose();
    drawing = drawHouse(scene, spec, placed.filter((i) => Number.isInteger(i) && i >= 0 && i < spec.body.pieces.length), groundY);
  };
  const placedNow = () => kept().slice(2);
  const k0 = kept();
  if (k0.length >= 2) build(k0[0], k0[1], k0.slice(2)); else build(Math.floor(g.rng() * 1e6), levelFor(g.save, 'classify'), []);

  let on = false, owner: Npc | null = null, finished: () => void = () => {}, armed = true, playing = false;
  // On the way: a subtitle (`sweet_house_way`, no voice) under the recorded "let's put it together" (`t_puzzle`): a tap on
  // the bubble says that again.
  const WAY = 't_puzzle';
  const bubble = () => { g.speech.caption({ key: WAY, pri: 'story', hold: 0, speaker: '🍪', text: tf('sweet_house_way', {}) }); };
  const store = (placed: readonly number[]) => { keep(g.ws, HOUSE_STEP, [seed, level, ...placed]); g.persist(); };

  function play() {
    armed = false; playing = true;
    g.speech.caption(null);
    const show = showHouseInWorld(spec, drawing, g.hooksFor('🍪'), { reach: g.touch ? 70 : 46, scope, kept: placedNow(), keep: store });
    // a task as any other (g.task): only its lines sound while it is open
    void g.task(() => player.play(show)).then((res) => {
      playing = false;
      if (!res.solved) { if (on) bubble(); return; }
      on = false;
      forget(g.ws, HOUSE_STEP);
      // the house's question leaves the bubble with it: what follows is the door and the ruby
      g.speech.caption(null);
      drawing.open(true);
      sfx('fanfare');
      g.sparks.burst(new THREE.Vector3(DOORWAY.x, groundY(DOORWAY.x, DOORWAY.z) + 1.5, DOORWAY.z), '#ffd0dc', 50, 4);
      o.inside();
      g.persist();
      // no result handed on: the house is written to no skill (the customer's decision 2026-11-18)
      finished();
    });
  }

  return {
    skill: 'classify',     // only read: the house records nothing (the customer's decision 2026-11-18)
    endsInWorld: true,
    get spec() { return spec; },
    get drawing() { return drawing; },
    start(n, done) {
      owner = n; finished = () => done(); armed = true;
      // a middle kept: that house, its pieces in their places; else a new one for the level of now
      if (kept().length < 2) build(Math.floor(g.rng() * 1e6), levelFor(g.save, 'classify'), []);
      on = true;
      store(placedNow());
      bubble();
    },
    active: () => on,
    owner: () => (on ? owner?.def.id ?? null : null),
    reask: async () => { bubble(); },
    update(dt, time, canMove) {
      drawing.update(dt, time);
      if (!on || playing) return;
      const hp = hero.root.position, d = Math.hypot(hp.x - before.x, hp.z - before.z);
      if (d > AGAIN_R) armed = true;
      if (!g.busy && g.speech.shown?.key !== WAY) bubble();
      if (canMove && armed && d < OPEN_R) play();
    },
    goal: () => (on && !playing ? before : null),
    cheat() {
      if (!on || playing) return false;
      if (!armed) {
        // closed before: she walks off first, out of AGAIN_R, and the next move brings her back
        const off = before.clone().addScaledVector(new THREE.Vector3(-FX, 0, -FZ), AGAIN_R + 1.5);
        hero.root.position.set(off.x, groundY(off.x, off.z), off.z);
        armed = true;
        return true;
      }
      hero.root.position.set(before.x, hero.root.position.y, before.z);
      return true;
    },
    opened(done) {
      if (!done) return;
      if (drawing.pieces.some((_, i) => !placedNow().includes(i))) build(seed, level, spec.body.pieces.map((_, i) => i));
      drawing.open(true, true);
    },
    dispose() { drawing.dispose(); },
  };
}

