/**
 * "Numbers in order" played in the world (PLAY-01): stones across a stream. The description is the panel's (`tasks/order.ts`):
 * the stones lie on the near bank in the order of `shown`, each with its number; a row of empty places crosses the
 * stream. A tap on a stone (by its distance on the screen) answers with its number: the right one hops onto the next
 * empty place, a wrong one rocks and stays (nothing is taken away); the course of a mistake and the end are the frame's
 * (./core.ts). The hint goes by the rungs of the description: the way said only, then the stones lit one by one from the
 * smallest (`track`), then the next stone pulses (`pulseNext`).
 *
 * Like every show of a task it draws no random numbers. It is the world's to open it, to wire the close button and to
 * call `update` in its frame.
 */
import * as THREE from 'three';
import type { WorldScope } from '../scope';
import { order, type OrderSpec } from '../tasks/order';
import { hintOf, type ShownHint } from '../taskviews/flow';
import type { TaskHooks } from '../taskviews/panel';
import { taskCore, type WorldTaskShow } from './core';

/** Where the stream crosses: the middle of its near bank, and the direction the child looks across it, in radians. */
export interface StonesPlace { x: number; z: number; facing: number }

export interface WorldStonesOptions {
  groundY(x: number, z: number): number;
  /** The farthest a tap may land from a stone on the screen, in pixels. */
  reach: number;
  /** The world's scope: the task's timer goes with the world. */
  scope: WorldScope;
}

export interface WorldStones extends WorldTaskShow {
  /** The stones in the order of `shown`; each holds its number in `userData.n` and, once placed, its place in `userData.at`. */
  readonly stones: readonly THREE.Mesh[];
  /** The empty places across the stream, from the near bank. */
  readonly places: readonly THREE.Vector3[];
}

const GAP = 0.9;          // m between two stones of a row on the bank
const ROW = 0.8;          // m between the two rows of stones
const LABEL = 0.5;        // m: the size of the number over a stone
const TAP_UP = 0.25;      // m over a stone's middle where a tap on it is measured from
const STEP = 0.8;         // m between two places across the stream
const BANK = 0.9;         // m from the middle of the bank to the stream
const HOP = 0.45;         // s of game time a stone takes to hop onto its place
const STREAM_W = 0.6;     // m: the stream is this much wider than the row of places, on each side

/** A number drawn on a small canvas (no file, no font file); null where there is no canvas (a unit test). */
function numberTexture(n: number): THREE.Texture | null {
  const c = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const x = c?.getContext?.('2d');
  if (!c || !x) return null;
  c.width = c.height = 128;
  x.fillStyle = '#fff8e8'; x.beginPath(); x.arc(64, 64, 56, 0, Math.PI * 2); x.fill();
  x.fillStyle = '#5a3b8c'; x.font = 'bold 72px sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function showStonesInWorld(scene: THREE.Scene, spec: OrderSpec, at: StonesPlace, hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'>, o: WorldStonesOptions): WorldStones {
  const st = order.start(spec), { shown, sorted } = spec.body;
  const group = new THREE.Group();
  const fx = Math.sin(at.facing), fz = Math.cos(at.facing);          // across the stream, away from the child
  const sx = Math.cos(at.facing), sz = -Math.sin(at.facing);         // along the bank
  const ground = (x: number, z: number) => o.groundY(x, z);

  // The places across the stream, from the near bank to the far one; the stream under them, a band of water.
  const places = sorted.map((_, i) => {
    const d = BANK + i * STEP, x = at.x + fx * d, z = at.z + fz * d;
    return new THREE.Vector3(x, ground(x, z), z);
  });
  // The stream: a band of water laid on the ground (each of its points at the height of the ground under it, so the
  // grass does not cut through it), fading out at its banks.
  const len = (sorted.length - 1) * STEP + 2 * STREAM_W;
  const mid = BANK + ((sorted.length - 1) * STEP) / 2;
  const waterGeo = new THREE.PlaneGeometry(2.4, len, 8, Math.max(8, sorted.length * 4));
  waterGeo.rotateX(-Math.PI / 2); waterGeo.rotateY(at.facing);
  waterGeo.translate(at.x + fx * mid, 0, at.z + fz * mid);
  const wp = waterGeo.attributes.position, alpha = new Float32Array(wp.count * 4), local = new THREE.Vector3();
  for (let i = 0; i < wp.count; i++) {
    const x = wp.getX(i), z = wp.getZ(i);
    wp.setY(i, ground(x, z) + 0.04);
    // the distance from the band's middle line, as a share of its half width: the water fades out over the last third
    local.set(x - (at.x + fx * mid), 0, z - (at.z + fz * mid));
    const across = Math.abs(local.x * sx + local.z * sz) / 1.2, along = Math.abs(local.x * fx + local.z * fz) / (len / 2);
    const edge = Math.max(across, along);
    alpha.set([0.5, 0.82, 1, Math.min(1, Math.max(0, (1 - edge) / 0.35))], i * 4);
  }
  waterGeo.setAttribute('color', new THREE.BufferAttribute(alpha, 4));
  waterGeo.computeVertexNormals();
  const water = new THREE.Mesh(waterGeo, new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.85, roughness: 0.15, metalness: 0.1, depthWrite: false }));
  group.add(water);
  const ringGeo = new THREE.RingGeometry(0.22, 0.3, 24);
  const ringMat = new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.6 });
  for (const p of places) {
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2; ring.position.copy(p).y += 0.04;
    group.add(ring);
  }

  // The stones on the near bank, in the order of `shown`.
  const stoneGeo = new THREE.SphereGeometry(0.28, 16, 10);
  stoneGeo.scale(1, 0.55, 1);
  const textures: THREE.Texture[] = [];
  // In two rows on the bank (a narrow screen shows the row whole, its stones big enough for a finger), the front row first.
  const cols = Math.ceil(shown.length / 2);
  const stones = shown.map((n, i) => {
    const row = i < cols ? 0 : 1, col = row === 0 ? i : i - cols, inRow = row === 0 ? cols : shown.length - cols;
    const off = (col - (inRow - 1) / 2) * GAP, back = 0.2 + row * ROW;
    const x = at.x + sx * off - fx * back, z = at.z + sz * off - fz * back;
    const mat = new THREE.MeshStandardMaterial({ color: '#b9a98f', emissive: '#ffd27a', emissiveIntensity: 0, roughness: 0.8 });
    const s = new THREE.Mesh(stoneGeo, mat);
    s.position.set(x, ground(x, z) + 0.12, z);
    s.userData = { n, home: s.position.clone(), at: -1 };
    // its number stands upright over it, facing the camera: readable from the low camera of a task in the world
    const tex = numberTexture(n);
    if (tex) {
      textures.push(tex);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      label.scale.setScalar(LABEL); label.position.y = 0.45; label.renderOrder = 2;
      s.add(label);
    }
    group.add(s);
    return s;
  });
  // where the camera looks: the stones and the first places across the stream - what is tapped and where it goes
  const cd = (BANK + STEP) / 2 - ROW / 2;
  const center = new THREE.Vector3(at.x + fx * cd, ground(at.x + fx * cd, at.z + fz * cd), at.z + fz * cd);
  scene.add(group);
  hooks.prompt(spec.prompt);

  const hops = new Map<THREE.Mesh, { from: THREE.Vector3; to: THREE.Vector3; t: number }>();
  const rock = new Map<THREE.Mesh, number>();
  let pulse: THREE.Mesh | null = null, tracking: { t: number } | null = null, time = 0;
  const left = () => stones.filter((s) => (s.userData.at as number) < 0);
  // a tap is measured from between a stone and its number: a child taps either
  const tapPoint = (s: THREE.Mesh) => s.position.clone().setY(s.position.y + TAP_UP);
  const hint: ShownHint | null = hintOf(spec.hint, null, {
    track: () => { tracking = { t: time }; },
    pulseNext: () => { pulse = stones.find((s) => s.userData.n === order.solution(spec, st)[0]) ?? null; },
  });
  const core = taskCore(o.scope, hooks, hint, () => {
    pulse = null; tracking = null;
    scene.remove(group);
    stoneGeo.dispose(); ringGeo.dispose(); water.geometry.dispose();
    for (const t of textures) t.dispose();
  });

  function pick(s: THREE.Mesh) {
    if (!core.alive || (s.userData.at as number) >= 0) return;
    const out = order.answer(spec, st, s.userData.n as number);
    if (out === 'ignored') return;
    if (out === 'wrong') { rock.set(s, -1); void core.mistake(); return; }
    const i = st.next - 1;
    s.userData.at = i;
    hops.set(s, { from: s.position.clone(), to: places[i].clone().setY(places[i].y + 0.08), t: -1 });
    pulse = null; tracking = null;
    hooks.good();
    if (out === 'right') core.solve(HOP * 1000 + 300);    // the last stone lands, then the task ends
  }
  const solve = () => { for (const n of order.solution(spec, st)) { const s = stones.find((x) => x.userData.n === n && (x.userData.at as number) < 0); if (s) pick(s); } };

  return {
    kind: 'stones', done: core.done, center, stones, places, facing: at.facing,
    extent: {
      side: Math.max(...stones.map((s) => Math.abs((s.position.x - center.x) * sx + (s.position.z - center.z) * sz))) + 0.4,
      depth: Math.max(...[...stones.map((s) => s.position), ...places].map((p) => Math.abs((p.x - center.x) * fx + (p.z - center.z) * fz))) + 0.4,
    },
    tap: (screenDist) => {
      if (!core.alive) return false;
      let best: THREE.Mesh | null = null, bd = o.reach;
      for (const s of left()) { const d = screenDist(tapPoint(s)); if (d < bd) { bd = d; best = s; } }
      if (best) pick(best);
      return true;
    },
    solve,
    wrong: () => {
      if (!core.alive) return false;
      const want = order.solution(spec, st)[0];
      const s = left().find((x) => x.userData.n !== want);
      if (!s) return false;
      pick(s);
      return true;
    },
    close: () => core.close(),
    state: () => ({ kind: 'stones', phase: core.phase, wrongs: core.wrongs, moves: st.next, rung: core.rung, progress: [] }),
    reach: o.reach,
    targets: () => (core.alive ? left().map((s) => ({ pos: tapPoint(s), right: s.userData.n === order.solution(spec, st)[0] })) : []),
    progress: () => [],
    resume: () => {},
    update: (t) => {
      time = t;
      for (const [s, h] of hops) {
        if (h.t < 0) h.t = t;
        const k = Math.min(1, (t - h.t) / HOP);
        s.position.lerpVectors(h.from, h.to, k).y += Math.sin(k * Math.PI) * 0.5;
        if (k >= 1) hops.delete(s);
      }
      for (const [s, r] of rock) {
        const t0 = r < 0 ? t : r;
        if (r < 0) rock.set(s, t);
        const k = t - t0;
        s.rotation.z = k < 0.5 ? Math.sin(k * 30) * 0.2 * (1 - k / 0.5) : 0;
        if (k >= 0.5) rock.delete(s);
      }
      // the hint: the stones left lit one by one from the smallest, then the next one breathing
      const rest = sorted.filter((n) => left().some((s) => s.userData.n === n));
      const lit = tracking ? rest[Math.floor((t - tracking.t) / 0.6)] : undefined;
      if (tracking && lit === undefined) tracking = null;
      for (const s of stones) {
        (s.material as THREE.MeshStandardMaterial).emissiveIntensity = s.userData.n === lit ? 0.7 : 0;
        s.scale.setScalar(s === pulse ? 1 + 0.12 * (0.5 + 0.5 * Math.sin(t * 6)) : 1);
      }
    },
  };
}
