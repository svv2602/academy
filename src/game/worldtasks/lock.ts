/**
 * "The shell lock" played in the world (WORLD-19, the gate of a castle): over the gate a number, in the gate a row of
 * 2-3 nests, one shell already sitting in the first of them; on the sea floor before it lie shells with numbers. A tap on
 * a shell (by its distance on the screen) answers with its number: one that belongs to the sum hops into the next empty
 * nest, a wrong one rocks and stays (nothing is taken away); the course of a mistake and the end are the frame's
 * (./core.ts). The gate opens once the nests are full: the world opens it when the task ends solved.
 *
 * The description is "the missing addend" made in shells (`tasks/missing.ts`): the shell in the gate is the known
 * addend, the number over the gate the sum, the shells to lay - what is missing. By the ladder of "Composition of a
 * number" (levels 3-5, docs/11-learning.md): up to 10 with one shell to lay on 3 (of three) and on 4 (of four), across
 * the ten on 5 with two shells to lay (of four) - and there exactly one pair of them makes what is missing. Its lines are
 * the missing addend's (recorded): the question, the way, then counting up from what is in the gate to the number over
 * it aloud, then the right shell lit. The result goes to the composition of a number as the panel's would.
 *
 * Like every show of a task it draws no random numbers. It is the world's to open it, to wire the close button and to
 * call `update` in its frame.
 */
import * as THREE from 'three';
import { randInt, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import type { SpokenKey } from '../../ui/strings';
import type { WorldScope } from '../scope';
import { ladder, type Hint } from '../tasks/types';
import { hintOf, type ShownHint } from '../taskviews/flow';
import type { TaskHooks } from '../taskviews/panel';
import { taskCore, type WorldTaskShow } from './core';
import { numberTexture } from './stones';

/** The composition of a number by level: the sums, how many shells to lay, how many lie on the floor. */
export const LOCK_BY_LEVEL: Readonly<Record<number, { sum: [number, number]; lay: number; options: number }>> = {
  3: { sum: [3, 10], lay: 1, options: 3 },
  4: { sum: [5, 10], lay: 1, options: 4 },
  5: { sum: [11, 18], lay: 2, options: 4 },
};
/** The largest number on a shell. */
export const SHELL_MAX = 9;

export interface LockBody {
  /** The number over the gate. */
  sum: number;
  /** The shell in the first nest from the start (the known addend). */
  given: number;
  /** The shells on the floor, in the order they lie. */
  options: number[];
  /** The shells that go into the empty nests, smallest first: the only ones of `options` that make sum - given. */
  answer: number[];
}
export interface LockSpec { type: 'lock'; level: number; prompt: SpokenKey; hint: Hint; body: LockBody }

/** The level of "Composition of a number" the lock plays: 3-5. */
export const lockLevel = (level: number) => Math.min(5, Math.max(3, Math.round(level)));

/** The ways to pick `k` of `options` (by index) that make `need`: the lock has exactly one. */
export function waysToMake(options: readonly number[], k: number, need: number): number[][] {
  const out: number[][] = [];
  const go = (from: number, left: number, sum: number, took: number[]) => {
    if (left === 0) { if (sum === need) out.push(took); return; }
    for (let i = from; i < options.length; i++) go(i + 1, left - 1, sum + options[i], [...took, i]);
  };
  go(0, k, 0, []);
  return out;
}

export function generateLock(level: number, rng: Rng): LockSpec {
  const lv = lockLevel(level), by = LOCK_BY_LEVEL[lv];
  let given: number, answer: number[];
  if (by.lay === 1) {
    const sum = randInt(by.sum[0], by.sum[1], rng);
    given = randInt(1, sum - 1, rng);
    answer = [sum - given];
  } else {
    // across the ten: the shell in the gate and what is missing, laid as two shells of 1-9
    given = randInt(2, SHELL_MAX, rng);
    const need = randInt(Math.max(by.sum[0] - given, 3), Math.min(by.sum[1] - given, 2 * SHELL_MAX), rng);
    const x = randInt(Math.max(1, need - SHELL_MAX), Math.min(SHELL_MAX, need - 1), rng);
    answer = [x, need - x].sort((a, b) => a - b);
  }
  const sum = given + answer.reduce((a, b) => a + b, 0), need = sum - given;
  // the other shells: near the answer first, never making what is missing with another one
  const options = [...answer];
  const near = shuffle([-1, 1, -2, 2, 3, -3, 4, -4], rng).map((d) => answer[0] + d);
  for (const v of [...near, ...shuffle(Array.from({ length: SHELL_MAX }, (_, i) => i + 1), rng)]) {
    if (options.length >= by.options) break;
    if (v < 1 || v > SHELL_MAX || options.includes(v)) continue;
    if (waysToMake([...options, v], by.lay, need).length === 1) options.push(v);
  }
  return {
    type: 'lock', level: lv, prompt: 't_missing',
    hint: ladder(sum > 10 ? 'h1_missing_ten' : 'h1_missing', { key: 'h2_missing', steps: [{ do: 'countUp' }] }),
    body: { sum, given, options: shuffle(options, rng), answer },
  };
}

/** Where the gate stands: its middle on the floor, and the direction the child looks at it (into the castle), radians. */
export interface LockPlace { x: number; z: number; facing: number }

export interface WorldLockOptions {
  groundY(x: number, z: number): number;
  /** The farthest a tap may land from a shell on the screen, in pixels. */
  reach: number;
  /** The world's scope: the task's timer goes with the world. */
  scope: WorldScope;
}

export interface WorldLock extends WorldTaskShow {
  /** The nests in the gate, from the left; the first holds the given shell from the start. */
  readonly nests: readonly THREE.Mesh[];
  /** The shells on the floor, in the order of `options`; each holds its number in `userData.n`, once laid its nest in `userData.at`. */
  readonly shells: readonly THREE.Mesh[];
  /** The number over the gate. */
  readonly sign: THREE.Object3D;
}

const NEST_GAP = 1.1;     // m between two nests across the gate
const NEST_Y = 1.3;       // m over the floor: the row of nests in the gate
const SIGN_Y = 3.1;       // m over the floor: the number over the gate
const SIGN = 1.1;         // m: its size
const LABEL = 0.7;        // m: the size of a number over a shell (not smaller than a finger on a phone)
const GAP = 1.3;          // m between two shells on the floor
const FRONT = 1.7;        // m from the gate to the shells on the floor, toward the child
const SHELL = 0.36;       // m: the radius of a shell
const TAP_UP = 0.3;       // m over a shell's middle where a tap on it is measured from
const HOP = 0.55;         // s of game time a shell takes to swim into its nest
const BEAT = 0.75;        // s between two numbers of the count aloud (the panel's countUp)

export function showLockInWorld(scene: THREE.Scene, spec: LockSpec, at: LockPlace, hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good' | 'number'>, o: WorldLockOptions): WorldLock {
  const { sum, given, options, answer } = spec.body;
  const group = new THREE.Group();
  const fx = Math.sin(at.facing), fz = Math.cos(at.facing);          // into the gate, away from the child
  const sx = -Math.cos(at.facing), sz = Math.sin(at.facing);         // across the gate, from the left
  const floor = o.groundY(at.x, at.z);
  const textures: THREE.Texture[] = [];
  const label = (n: number, size: number, y: number) => {
    const tex = numberTexture(n);
    if (!tex) return null;
    textures.push(tex);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    s.scale.setScalar(size); s.position.y = y; s.renderOrder = 2;
    return s;
  };

  // the number over the gate: a mother-of-pearl disc facing the child, the number on it
  const sign = new THREE.Group();
  sign.position.set(at.x, floor + SIGN_Y, at.z);
  const plate = new THREE.Mesh(new THREE.CircleGeometry(SIGN * 0.62, 24), new THREE.MeshStandardMaterial({ color: '#f6efe2', emissive: '#ffe9b8', emissiveIntensity: 0.25, roughness: 0.4, side: THREE.DoubleSide }));
  plate.rotation.y = at.facing + Math.PI;
  sign.add(plate);
  const sl = label(sum, SIGN, 0); if (sl) sign.add(sl);
  group.add(sign);

  // the nests: hollows in the gate across it, the given shell in the first
  const nestGeo = new THREE.TorusGeometry(0.34, 0.08, 8, 20);
  const nestMat = new THREE.MeshStandardMaterial({ color: '#c9b48e', emissive: '#ffd27a', emissiveIntensity: 0, roughness: 0.8 });
  const count = 1 + answer.length;
  const nests = Array.from({ length: count }, (_, i) => {
    const d = (i - (count - 1) / 2) * NEST_GAP;
    const m = new THREE.Mesh(nestGeo, nestMat.clone());
    m.position.set(at.x + sx * d, floor + NEST_Y, at.z + sz * d);
    m.rotation.y = at.facing;
    m.userData = { i, n: i === 0 ? given : null };
    group.add(m);
    return m;
  });

  // a shell: a fluted half dome, the number over it
  const shellGeo = new THREE.SphereGeometry(SHELL, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  shellGeo.scale(1, 0.6, 1);
  const shellOf = (n: number, colour: string) => {
    const m = new THREE.Mesh(shellGeo, new THREE.MeshStandardMaterial({ color: colour, emissive: '#ffd27a', emissiveIntensity: 0, roughness: 0.5 }));
    const l = label(n, LABEL, 0.62); if (l) m.add(l);
    return m;
  };
  const inGate = shellOf(given, '#f3c6c0');
  inGate.position.copy(nests[0].position);
  group.add(inGate);
  const shells = options.map((n, i) => {
    const off = (i - (options.length - 1) / 2) * GAP, x = at.x + sx * off - fx * FRONT, z = at.z + sz * off - fz * FRONT;
    const m = shellOf(n, '#f7d9c4');
    m.position.set(x, o.groundY(x, z) + 0.1, z);
    m.userData = { n, home: m.position.clone(), at: -1 };
    group.add(m);
    return m;
  });
  // the pearls of the count aloud: one per number counted, over the first empty nest
  const dotGeo = new THREE.SphereGeometry(0.11, 10, 8);
  const dots: THREE.Mesh[] = [];

  // where the camera looks: between the shells on the floor and the nests in the gate, a little up
  const center = new THREE.Vector3(at.x - fx * FRONT * 0.45, floor + 1.1, at.z - fz * FRONT * 0.45);
  scene.add(group);
  hooks.prompt(spec.prompt);

  const hops = new Map<THREE.Mesh, { from: THREE.Vector3; to: THREE.Vector3; t: number }>();
  const rock = new Map<THREE.Mesh, number>();
  let pulse: THREE.Mesh | null = null, counting: { t: number; from: number; round: number; said: number } | null = null, time = 0;
  const left = () => shells.filter((m) => (m.userData.at as number) < 0);
  const laid = () => shells.filter((m) => (m.userData.at as number) >= 0).map((m) => m.userData.n as number);
  /** The shells still to lay: the answer less what is laid. */
  const wanted = () => { const w = [...answer]; for (const n of laid()) w.splice(w.indexOf(n), 1); return w; };
  const isRight = (m: THREE.Mesh) => wanted().includes(m.userData.n as number);
  const tapPoint = (m: THREE.Mesh) => m.position.clone().setY(m.position.y + TAP_UP);
  const clearDots = () => { for (const d of dots) { group.remove(d); (d.material as THREE.Material).dispose(); } dots.length = 0; };
  const hint: ShownHint | null = hintOf(spec.hint, () => { pulse = left().find(isRight) ?? null; }, {
    countUp: () => { clearDots(); counting = { t: time, from: given + laid().reduce((a, b) => a + b, 0), round: core.wrongs, said: -1 }; },
  });
  const core = taskCore(o.scope, hooks, hint, () => {
    pulse = null; counting = null; clearDots();
    scene.remove(group);
    nestGeo.dispose(); shellGeo.dispose(); dotGeo.dispose(); plate.geometry.dispose();
    for (const t of textures) t.dispose();
  });

  function pick(m: THREE.Mesh) {
    if (!core.alive || (m.userData.at as number) >= 0) return;
    if (!isRight(m)) { rock.set(m, -1); void core.mistake(); return; }
    const i = 1 + laid().length;
    m.userData.at = i;
    hops.set(m, { from: m.position.clone(), to: nests[i].position.clone(), t: -1 });
    nests[i].userData.n = m.userData.n;
    pulse = null; counting = null; clearDots();
    hooks.good();
    if (!wanted().length) core.solve(HOP * 1000 + 300);    // the last shell is in its nest, then the gate opens
  }

  return {
    kind: 'lock', done: core.done, center, nests, shells, sign, facing: at.facing,
    extent: {
      side: Math.max(...[...shells, ...nests].map((m) => Math.abs((m.position.x - center.x) * sx + (m.position.z - center.z) * sz))) + 0.5,
      // the number over the gate and the shells on the floor both on the screen
      depth: Math.max(FRONT * 0.6, SIGN_Y - 1.1) + 0.6,
    },
    tap: (screenDist) => {
      if (!core.alive) return false;
      let best: THREE.Mesh | null = null, bd = o.reach;
      for (const m of left()) { const d = screenDist(tapPoint(m)); if (d < bd) { bd = d; best = m; } }
      if (best) pick(best);
      return true;
    },
    solve: () => { for (const n of wanted()) { const m = left().find((x) => x.userData.n === n); if (m) pick(m); } },
    wrong: () => {
      if (!core.alive) return false;
      const m = left().find((x) => !isRight(x));
      if (!m) return false;
      pick(m);
      return true;
    },
    close: () => core.close(),
    state: () => ({ kind: 'lock', phase: core.phase, wrongs: core.wrongs, moves: laid().length, rung: core.rung, progress: [] }),
    reach: o.reach,
    targets: () => (core.alive ? left().map((m) => ({ pos: tapPoint(m), right: isRight(m), r: Math.max(SHELL, LABEL / 2) })) : []),
    progress: () => [],
    resume: () => {},
    update: (t) => {
      time = t;
      for (const [m, h] of hops) {
        if (h.t < 0) h.t = t;
        const k = Math.min(1, (t - h.t) / HOP);
        m.position.lerpVectors(h.from, h.to, k).y += Math.sin(k * Math.PI) * 0.5;
        if (k >= 1) hops.delete(m);
      }
      for (const [m, r] of rock) {
        const t0 = r < 0 ? t : r;
        if (r < 0) rock.set(m, t);
        const k = t - t0;
        m.rotation.z = k < 0.5 ? Math.sin(k * 30) * 0.2 * (1 - k / 0.5) : 0;
        if (k >= 0.5) rock.delete(m);
      }
      // the count aloud (the panel's countUp): from what is in the gate up to the number over it, a pearl with each
      // number over the first empty nest; then the pearls counted 1, 2, 3 - that many are missing. A newer mistake stops it.
      if (counting && (counting.round !== core.wrongs || !core.alive)) counting = null;
      if (counting) {
        const c = counting, k = sum - c.from, beat = Math.floor((t - c.t) / BEAT);
        if (beat >= 2 * k) counting = null;
        else if (beat > c.said) {
          c.said = beat;
          const nest = nests[1 + laid().length];
          if (beat < k) {
            const d = new THREE.Mesh(dotGeo, new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#bfefff', emissiveIntensity: 0.3 }));
            d.position.set(nest.position.x + sx * (beat - (k - 1) / 2) * 0.26, nest.position.y + 0.62, nest.position.z + sz * (beat - (k - 1) / 2) * 0.26);
            group.add(d); dots.push(d);
            hooks.number(c.from + beat + 1);
          } else {
            const d = dots[beat - k];
            if (d) (d.material as THREE.MeshStandardMaterial).emissiveIntensity = 1;
            hooks.number(beat - k + 1);
          }
        }
      }
      for (const m of shells) m.scale.setScalar(m === pulse ? 1 + 0.12 * (0.5 + 0.5 * Math.sin(t * 6)) : 1);
    },
  };
}
