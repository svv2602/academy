import * as THREE from 'three';
import type { Rng } from '../../core/rng';
import type { WorldScope } from '../scope';
import { add, generate as generateAdd, type AddSpec } from '../tasks/add';
import { COLORS, generate as generatePattern, pattern, type PatternSpec } from '../tasks/pattern';
import type { Outcome } from '../tasks/types';
import { hintOf } from '../taskviews/flow';
import type { TaskHooks } from '../taskviews/panel';
import { taskCore, type WorldTaskShow } from './core';
import { numberTexture } from './stones';

/**
 * The observatory's clock (WORLD-24, docs/13-worlds.md; docs/worlds/world-5.md «Задания, разыгранные в мире» item 2): a
 * puzzle of three steps, each a kind of task the game has already - (1) the three gears found on the island (a search:
 * the world's own, ./sky/clock.ts, no skill), (2) the gears put on the clock's axle in their order (a pattern, here),
 * (3) the hands set by an example of addition (here). Each step is recorded in the skill of its kind, the puzzle as a
 * whole in none (the customer's decision 2026-11-18); the world keeps the steps done.
 *
 * The two shows are of one shape, as the steps of the owl (./steps.ts): what is shown stands up before the child, the
 * choices lie in a row before it, a tap on one (by its distance on the screen) answers. The right one goes to its place
 * - a gear onto the axle, the hand to its number - a wrong one rocks and stays; the course of a mistake and the end are
 * the frame's (./core.ts). The hint is the panel's description's, in three rungs.
 *
 * The gears are a row of colours: the pattern's description on levels 1-3 (`tasks/pattern.ts`). Its levels 4 and 5 -
 * growing groups, two features at once - are no row of gears on an axle, so a child past level 3 gets a row of level 3
 * (as the hedgehog's maze, ./maze.ts); the result is recorded in «Закономерности» all the same.
 *
 * Like every show of a task they draw no random numbers. It is the world's to open them, to wire the close button and
 * to call `update` in its frame.
 */

/** The level of the gears' row: the pattern's level, at most 3 (see above). */
export const gearsLevel = (level: number) => Math.min(3, Math.max(1, Math.round(level)));
export const generateGears = (level: number, rng: Rng): PatternSpec => generatePattern(gearsLevel(level), rng);
export const generateHands = (level: number, rng: Rng): AddSpec => generateAdd(Math.min(5, Math.max(1, Math.round(level))), rng);

/** The colours of the pattern's description (its emoji) as paint. */
export const GEAR_PAINT: Readonly<Record<string, string>> = {
  '🔴': '#e0473c', '🔵': '#3b7be0', '🟡': '#f0c22a', '🟢': '#3cbf58', '🟣': '#a24fd6', '🟠': '#f08a2a',
};

/** Where the clock stands: the middle of what is shown, and the direction the child looks at it, in radians. */
export interface ClockPlace { x: number; z: number; y: number; facing: number }

export interface WorldClockOptions {
  /** The farthest a tap may land from a choice on the screen, in pixels. */
  reach: number;
  /** The world's scope: the task's timer goes with the world. */
  scope: WorldScope;
  /** The task's place among the puzzle's tasks and how many there are (WorldTaskState.stage). */
  stage?: readonly [number, number];
}

export interface WorldChoices extends WorldTaskShow {
  /** The choices to tap, in the order of the description's options; each holds its value in `userData.v`. */
  readonly choices: readonly THREE.Object3D[];
  /** Whether the right choice is in its place. */
  readonly placed: boolean;
}

const GEAR_R = 0.42;      // m: a gear's radius (on a phone not smaller than a finger: tools/world-pass.mjs MIN_TAP_PX)
const PITCH = 1.0;        // m between two gears on the axle
const GAP = 1.35;         // m between two choices in their row
const FRONT = 1.6;        // m from what is shown to the row of choices, toward the child
const HOP = 0.5;          // s of game time a choice takes to its place
const LABEL = 0.75;       // m: the size of a number tile's number
const TAP_UP = 0.3;       // m over a choice's middle where a tap on it is measured from

function gearGeo(): THREE.BufferGeometry {
  // a flat gear: a disc with eight teeth, lying on its edge across the view
  const s = new THREE.Shape(), teeth = 8, r0 = GEAR_R * 0.78, r1 = GEAR_R;
  for (let i = 0; i < teeth * 2; i++) {
    const a0 = (i / (teeth * 2)) * Math.PI * 2, a1 = ((i + 1) / (teeth * 2)) * Math.PI * 2, r = i % 2 ? r0 : r1;
    if (i === 0) s.moveTo(Math.cos(a0) * r, Math.sin(a0) * r); else s.lineTo(Math.cos(a0) * r, Math.sin(a0) * r);
    s.lineTo(Math.cos(a1) * r, Math.sin(a1) * r);
  }
  const hole = new THREE.Path(); hole.absarc(0, 0, GEAR_R * 0.2, 0, Math.PI * 2, true); s.holes.push(hole);
  return new THREE.ExtrudeGeometry(s, { depth: 0.12, bevelEnabled: false }).translate(0, 0, -0.06);
}

/**
 * The frame both shows share: the choices in a row toward the child, a tap on one judged by `judge`, the right one sent
 * to `place` (and `landed` once there), a wrong one rocked; the hint's acts by `act`, the rung "pulse the answer" lights
 * the right choice.
 */
function choiceShow(scene: THREE.Scene, group: THREE.Group, kind: string, at: ClockPlace, o: WorldClockOptions, hooks: Pick<TaskHooks, 'wrong' | 'hint' | 'good'>,
  spec: PatternSpec | AddSpec, choices: THREE.Object3D[], answer: string | number, place: THREE.Vector3,
  judge: (v: string | number) => Outcome, act: Parameters<typeof hintOf>[2], landed: () => void, center: THREE.Vector3,
  extentPoints: THREE.Vector3[], dispose: () => void, update: (t: number) => void): WorldChoices {
  const fx = Math.sin(at.facing), fz = Math.cos(at.facing), sx = -Math.cos(at.facing), sz = Math.sin(at.facing);
  let placed = false, pulsing: THREE.Object3D | null = null;
  const hops = new Map<THREE.Object3D, { from: THREE.Vector3; t: number }>(), rock = new Map<THREE.Object3D, number>();
  const right = () => choices.find((c) => c.userData.v === answer)!;
  const glow = (c: THREE.Object3D, k: number) => c.traverse((x) => { const m = (x as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined; if (m && 'emissiveIntensity' in m) m.emissiveIntensity = k; });
  const core = taskCore(o.scope, hooks, hintOf(spec.hint, () => { pulsing = right(); }, act), () => { scene.remove(group); dispose(); });
  function pick(c: THREE.Object3D) {
    if (!core.alive || placed || hops.size) return;
    const out = judge(c.userData.v as string | number);
    if (out === 'wrong') { rock.set(c, -1); void core.mistake(); return; }
    if (out !== 'right') return;
    placed = true; pulsing = null; glow(c, 0);
    hops.set(c, { from: c.position.clone(), t: -1 });
    hooks.good();
    core.solve(HOP * 1000 + 400);
  }
  const tapPoint = (c: THREE.Object3D) => c.position.clone().setY(c.position.y + TAP_UP);
  const around = (p: THREE.Vector3) => ({ side: Math.abs((p.x - center.x) * sx + (p.z - center.z) * sz), depth: Math.abs((p.x - center.x) * fx + (p.z - center.z) * fz) });
  return {
    kind, done: core.done, center, facing: at.facing, choices,
    get placed() { return placed; },
    extent: {
      side: Math.max(...[...choices.map((c) => c.position), ...extentPoints].map((p) => around(p).side)) + 0.6,
      depth: Math.max(...[...choices.map((c) => c.position), ...extentPoints].map((p) => around(p).depth)) + 0.7,
    },
    tap: (screenDist) => {
      if (!core.alive) return false;
      let best: THREE.Object3D | null = null, bd = o.reach;
      for (const c of choices) { const d = screenDist(tapPoint(c)); if (d < bd) { bd = d; best = c; } }
      if (best) pick(best);
      return true;
    },
    solve: () => pick(right()),
    wrong: () => {
      if (!core.alive || placed) return false;
      const c = choices.find((x) => x.userData.v !== answer);
      if (!c) return false;
      pick(c);
      return true;
    },
    close: () => core.close(),
    state: () => ({ kind, phase: core.phase, wrongs: core.wrongs, moves: placed ? 1 : 0, rung: core.rung, progress: [], ...(o.stage ? { stage: o.stage } : {}) }),
    reach: o.reach,
    targets: () => (core.alive && !placed ? choices.map((c) => ({ pos: tapPoint(c), right: c.userData.v === answer, r: Math.max(GEAR_R, LABEL / 2) })) : []),
    progress: () => [],
    resume: () => {},
    update: (t) => {
      for (const [c, h] of hops) {
        if (h.t < 0) h.t = t;
        const k = Math.min(1, (t - h.t) / HOP);
        c.position.lerpVectors(h.from, place, k).y += Math.sin(k * Math.PI) * 0.6;
        if (k >= 1) { hops.delete(c); landed(); }
      }
      for (const [c, r] of rock) {
        const t0 = r < 0 ? t : r;
        if (r < 0) rock.set(c, t);
        const k = t - t0;
        c.rotation.z = k < 0.5 ? Math.sin(k * 30) * 0.2 * (1 - k / 0.5) : 0;
        if (k >= 0.5) rock.delete(c);
      }
      for (const c of choices) if (!placed) glow(c, c === pulsing ? 0.6 + Math.sin(t * 6) * 0.3 : 0);
      update(t);
    },
  };
}

/**
 * Step 2: the gears on the axle. The axle stands across the view with the row of the description's colours on it and
 * one empty place at its end; the three gears of the choices lie before it. The right one rolls onto the empty place,
 * and every gear on the axle turns. The hint marks the units of the row one after another (`markUnits`).
 */
export function showGearsInWorld(scene: THREE.Scene, spec: PatternSpec, at: ClockPlace, hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'>, o: WorldClockOptions): WorldChoices {
  const { row, options, answer, unit } = spec.body;
  const group = new THREE.Group();
  const fx = Math.sin(at.facing), fz = Math.cos(at.facing), sx = -Math.cos(at.facing), sz = Math.sin(at.facing);
  const geo = gearGeo();
  const yaw = at.facing;
  const gearMat = (paint: string) => new THREE.MeshStandardMaterial({ color: paint, emissive: '#ffe27a', emissiveIntensity: 0, roughness: 0.5, metalness: 0.2 });
  const n = row.length + 1, y = at.y + 1.1;
  const slot = (i: number) => new THREE.Vector3(at.x + sx * (i - (n - 1) / 2) * PITCH, y, at.z + sz * (i - (n - 1) / 2) * PITCH);
  // the axle: a golden rod across the view, with the empty place's ring at its end
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, n * PITCH + 0.4, 8).rotateZ(Math.PI / 2).rotateY(yaw), new THREE.MeshStandardMaterial({ color: '#d4a640', metalness: 0.5, roughness: 0.4 }));
  axle.position.set(at.x, y, at.z);
  group.add(axle);
  const onAxle = row.map((c, i) => { const m = new THREE.Mesh(geo, gearMat(GEAR_PAINT[c] ?? '#cccccc')); m.position.copy(slot(i)); m.rotation.y = yaw; group.add(m); return m; });
  const empty = new THREE.Mesh(new THREE.TorusGeometry(GEAR_R * 0.85, 0.04, 6, 24), new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 }));
  empty.position.copy(slot(n - 1)); empty.rotation.y = yaw;
  group.add(empty);
  const choices = options.map((c, j) => {
    const m = new THREE.Mesh(geo, gearMat(GEAR_PAINT[c] ?? '#cccccc'));
    const off = (j - (options.length - 1) / 2) * GAP;
    m.position.set(at.x + sx * off - fx * FRONT, at.y + GEAR_R + 0.05, at.z + sz * off - fz * FRONT);
    m.rotation.y = yaw;
    m.userData = { v: c };
    group.add(m);
    return m;
  });
  scene.add(group);
  hooks.prompt(spec.prompt, spec.ask);
  let spin = false, marking: { t: number } | null = null, time = 0;
  const center = new THREE.Vector3(at.x - fx * FRONT / 2, at.y + 0.7, at.z - fz * FRONT / 2);
  return choiceShow(scene, group, 'gears', at, o, hooks, spec, choices, answer, slot(n - 1),
    (v) => pattern.answer(spec, null, v as string),
    { markUnits: () => { marking = { t: time }; } },
    () => { spin = true; empty.visible = false; },
    center, [slot(0), slot(n - 1)],
    () => { geo.dispose(); },
    (t) => {
      time = t;
      // the gears turn once the row is whole: the clock is alive a little more
      if (spin) for (const m of [...onAxle, ...choices.filter((c) => c.userData.v === answer)]) m.rotation.z = t * 1.5;
      // the hint: the units of the row lit one after another, each for a while
      const per = unit.length, k = marking ? Math.floor((t - marking.t) / 0.8) : -1;
      if (marking && k * per >= row.length) marking = null;
      onAxle.forEach((m, i) => { (m.material as THREE.MeshStandardMaterial).emissiveIntensity = marking && Math.floor(i / per) === k ? 0.6 : 0; });
    });
}

/**
 * Step 3: the hands. The clock's face stands before the child with the example on it (8 + 5); the number tiles of the
 * choices lie before it. The right number flies onto the face, and the hand turns to it. The hint is the example's
 * description's (counting, counting on, the ten filled), its count shown by the hand ticking from mark to mark.
 */
export function showHandsInWorld(scene: THREE.Scene, spec: AddSpec, at: ClockPlace, hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'>, o: WorldClockOptions): WorldChoices {
  const { a, b, options, answer } = spec.body;
  const group = new THREE.Group();
  const fx = Math.sin(at.facing), fz = Math.cos(at.facing), sx = -Math.cos(at.facing), sz = Math.sin(at.facing);
  const yaw = at.facing;
  const textures: THREE.Texture[] = [];
  const label = (tex: THREE.Texture | null, w: number, h: number) => {
    if (!tex) return null;
    textures.push(tex);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: '#d4d4d4', depthTest: false, toneMapped: false, fog: false }));
    s.scale.set(w, h, 1); s.renderOrder = 2;
    return s;
  };
  // the face: a white disc with a golden rim, twenty marks round it (the sums go up to 18), the hand from its middle
  const faceY = at.y + 1.3, R = 1.0;
  const face = new THREE.Group();
  face.position.set(at.x, faceY, at.z); face.rotation.y = yaw + Math.PI;
  face.add(new THREE.Mesh(new THREE.CircleGeometry(R, 32), new THREE.MeshStandardMaterial({ color: '#fffaf0', roughness: 0.8 })));
  const rim = new THREE.Mesh(new THREE.TorusGeometry(R, 0.06, 6, 32), new THREE.MeshStandardMaterial({ color: '#d4a640', metalness: 0.5, roughness: 0.4 }));
  face.add(rim);
  const MARKS = 20, markAt = (v: number) => (v / MARKS) * Math.PI * 2;
  for (let v = 0; v < MARKS; v++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.04, v % 5 ? 0.1 : 0.18, 0.02), new THREE.MeshStandardMaterial({ color: '#4a3f8a' }));
    const ang = markAt(v);
    m.position.set(Math.sin(ang) * (R - 0.12), Math.cos(ang) * (R - 0.12), 0.01); m.rotation.z = -ang;
    face.add(m);
  }
  const hand = new THREE.Mesh(new THREE.BoxGeometry(0.07, R * 0.8, 0.03).translate(0, R * 0.4, 0.03), new THREE.MeshStandardMaterial({ color: '#4a3f8a', emissive: '#ffe27a', emissiveIntensity: 0 }));
  face.add(hand);
  group.add(face);
  const ex = label(textTexture(`${a} + ${b}`), 1.5, 0.66);
  if (ex) { ex.position.set(at.x, faceY - R - 0.45, at.z); group.add(ex); }
  const tileGeo = new THREE.BoxGeometry(0.7, 0.16, 0.7);
  const choices = options.map((v, j) => {
    const m = new THREE.Mesh(tileGeo, new THREE.MeshStandardMaterial({ color: '#a9c8f5', emissive: '#ffc21a', emissiveIntensity: 0, roughness: 0.8 }));
    const off = (j - (options.length - 1) / 2) * GAP;
    m.position.set(at.x + sx * off - fx * FRONT, at.y + 0.1, at.z + sz * off - fz * FRONT);
    m.rotation.y = yaw;
    m.userData = { v };
    const l = label(numberTexture(v), LABEL, LABEL); if (l) { l.position.y = 0.5; m.add(l); }
    group.add(m);
    return m;
  });
  scene.add(group);
  hooks.prompt(spec.prompt, spec.ask);
  let target: number | null = null, counting: { t: number; from: number; to: number } | null = null, time = 0;
  const placeAt = new THREE.Vector3(at.x, faceY + R + 0.35, at.z);
  const center = new THREE.Vector3(at.x - fx * FRONT / 2, at.y + 0.9, at.z - fz * FRONT / 2);
  const count = (from: number, to: number) => { counting = { t: time, from, to }; };
  return choiceShow(scene, group, 'hands', at, o, hooks, spec, choices, answer, placeAt,
    (v) => add.answer(spec, null, v as number),
    { countAloud: () => count(0, a + b), countOn: () => count(a, a + b), fillTen: () => count(a, a + b) },
    () => { target = answer; },
    center, [placeAt, new THREE.Vector3(at.x, faceY - R - 0.6, at.z)],
    () => { tileGeo.dispose(); for (const t of textures) t.dispose(); },
    (t) => {
      time = t;
      // the hint's count: the hand ticks from mark to mark, a step a beat
      if (counting && target === null) {
        const k = Math.floor((t - counting.t) / 0.6);
        hand.rotation.z = -markAt(Math.min(counting.to, counting.from + k));
        if (counting.from + k > counting.to + 1) counting = null;
      }
      // solved: the hand swings round to the answer and glows
      if (target !== null) {
        const want = -markAt(target);
        hand.rotation.z += (want - hand.rotation.z) * 0.15;
        (hand.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.6;
      }
    });
}

/** A wide label: the example under the face. */
function textTexture(text: string): THREE.Texture | null {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const x = c?.getContext?.('2d');
  if (!c || !x) return null;
  c.width = 256; c.height = 112;
  x.fillStyle = '#ffffff'; x.beginPath(); x.roundRect(4, 4, 248, 104, 40); x.fill();
  x.fillStyle = '#4a3f8a'; x.font = 'bold 68px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(text, 128, 62);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** The colours of the pattern on levels 1-3 are the description's own (tasks/pattern.ts COLORS): every one has a paint. */
export const PAINTED = COLORS.every((c) => c in GEAR_PAINT);
