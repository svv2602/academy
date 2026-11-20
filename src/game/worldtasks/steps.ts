/**
 * "Steps with numbers" played in the world (WORLD-16, the owl's steps to her hollow): a row of mushroom steps rising, a
 * number on each, one step without its number; beside them on the ground lie 2-4 mushrooms with numbers. A tap on a
 * mushroom (by its distance on the screen) answers with its number: the right one hops onto the empty step, a wrong
 * one rocks and stays (nothing is taken away); the course of a mistake and the end are the frame's (./core.ts).
 *
 * The description is the panel's "neighbours of a number" (`tasks/neighbors.ts`: a piece of the number track with one
 * empty cell right after the marked number), made for every level of the number series by the ladder of
 * docs/11-learning.md: 4 in a row from 1-3, 5 in a row from 1-5, 5 in a row up to 10, up to 20 on 4 and 5. Its hint is
 * that task's: the way said, then the steps counted one by one up to the empty one (`countCells`) - every line of it is
 * recorded already. The result goes to the number series as the panel's would.
 *
 * Like every show of a task it draws no random numbers. It is the world's to open it, to wire the close button and to
 * call `update` in its frame. The steps rise a hand's height each: from a step nobody falls (the principle "nobody
 * falls"), and the heroine does not climb them - the task ends with the mushroom on its step.
 */
import * as THREE from 'three';
import { randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import type { WorldScope } from '../scope';
import { neighbors, type NeighborsSpec } from '../tasks/neighbors';
import { inBank, ladder } from '../tasks/types';
import { hintOf, type ShownHint } from '../taskviews/flow';
import type { TaskHooks } from '../taskviews/panel';
import { taskCore, type WorldTaskShow } from './core';
import { numberTexture } from './stones';

/** The number series by level (docs/11-learning.md): how many steps, the smallest first number, the largest number. */
export const STEPS_BY_LEVEL: Readonly<Record<number, { cells: number; first: [number, number]; top: number; options: number }>> = {
  1: { cells: 4, first: [1, 3], top: 6, options: 2 },
  2: { cells: 5, first: [1, 1], top: 5, options: 2 },
  3: { cells: 5, first: [1, 6], top: 10, options: 3 },
  4: { cells: 5, first: [1, 16], top: 20, options: 4 },
  5: { cells: 5, first: [1, 16], top: 20, options: 4 },
};

/**
 * A row of steps for `level`: the numbers one after another, one empty step right after a marked one (never the
 * first: there is always a number to count from), and the mushrooms to choose from - the answer and its neighbours
 * within the row's numbers, as many as the level asks. The shape is the panel's "neighbours of a number".
 */
export function generateSteps(level: number, rng: Rng): NeighborsSpec {
  const by = STEPS_BY_LEVEL[Math.min(5, Math.max(1, Math.round(level)))];
  const start = randInt(by.first[0], Math.min(by.first[1], by.top - by.cells + 1), rng);
  const cells = Array.from({ length: by.cells }, (_, i) => start + i);
  const gap = randInt(1, by.cells - 1, rng), answer = cells[gap], n = cells[gap - 1];
  // the choices: the answer and the numbers nearest to it, never below 1 nor over the top of the level
  const near = [answer - 1, answer + 1, answer - 2, answer + 2, answer + 3, answer - 3].filter((v) => v >= 1 && v <= by.top);
  const others = near.slice(0, by.options - 1);
  const options = [answer, ...others];
  for (let i = options.length - 1; i > 0; i--) { const j = randInt(0, i, rng); [options[i], options[j]] = [options[j], options[i]]; }
  return {
    type: 'neighbors', level, prompt: 't_after', ask: inBank(`q_after_${n}`),
    hint: ladder('h1_neighbors', { key: 'h2_neighbors', steps: [{ do: 'countCells' }] }),
    body: { cells, n, before: false, gap, options, answer },
  };
}

/**
 * Where the steps stand: the middle of the row, and the direction the child looks at it (toward the hollow), in
 * radians. The row runs across the view, rising from left to right: every step is seen, none hides another.
 */
export interface StepsPlace { x: number; z: number; facing: number }

export interface WorldStepsOptions {
  groundY(x: number, z: number): number;
  /** The farthest a tap may land from a mushroom on the screen, in pixels. */
  reach: number;
  /** The world's scope: the task's timer goes with the world. */
  scope: WorldScope;
}

export interface WorldSteps extends WorldTaskShow {
  /** The steps of the row, from the foot; the empty one is `steps[gap]` until its mushroom is on it. */
  readonly steps: readonly THREE.Mesh[];
  /** The mushrooms to choose from, in the order of `options`; each holds its number in `userData.n`. */
  readonly choices: readonly THREE.Mesh[];
}

const STEP = 0.95;        // m between two steps along the row
const RISE = 0.18;        // m one step is higher than the one before it
const LABEL = 0.7;        // m: the size of a number (on a phone not smaller than a finger: tools/world-pass.mjs MIN_TAP_PX)
const GAP = 1.35;         // m between two mushrooms on the ground
const FRONT = 1.5;        // m from the row to the mushrooms on the ground, toward the child
const HOP = 0.5;          // s of game time a mushroom takes to hop onto its step
const TAP_UP = 0.35;      // m over a mushroom's middle where a tap on it is measured from
const SHROOM = 0.38;      // m: the radius of a mushroom on the ground

export function showStepsInWorld(scene: THREE.Scene, spec: NeighborsSpec, at: StepsPlace, hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'>, o: WorldStepsOptions): WorldSteps {
  const st = neighbors.start(spec), { cells, gap, options, answer } = spec.body;
  const group = new THREE.Group();
  const fx = Math.sin(at.facing), fz = Math.cos(at.facing);          // away from the child, toward the row
  const sx = -Math.cos(at.facing), sz = Math.sin(at.facing);         // along the row, from its foot (on the left)
  const ground = (x: number, z: number) => o.groundY(x, z);
  const textures: THREE.Texture[] = [];
  const label = (n: number, y: number) => {
    const tex = numberTexture(n);
    if (!tex) return null;
    textures.push(tex);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
    s.scale.setScalar(LABEL); s.position.y = y; s.renderOrder = 2;
    return s;
  };

  // The steps: mushrooms of growing height, a hand higher each; the empty one is a pale ring on its stem.
  const capGeo = new THREE.CylinderGeometry(0.42, 0.46, 0.14, 14);
  const stemGeo = new THREE.CylinderGeometry(0.12, 0.15, 1, 10).translate(0, 0.5, 0);
  const capMat = new THREE.MeshStandardMaterial({ color: '#d9534a', emissive: '#ffd27a', emissiveIntensity: 0, roughness: 0.7 });
  const stemMat = new THREE.MeshStandardMaterial({ color: '#f2e6cf', roughness: 0.9 });
  const emptyMat = new THREE.MeshStandardMaterial({ color: '#ffffff', transparent: true, opacity: 0.45, roughness: 0.6 });
  const tops: THREE.Vector3[] = [];
  const steps = cells.map((n, i) => {
    const d = (i - (cells.length - 1) / 2) * STEP, x = at.x + sx * d, z = at.z + sz * d, h = RISE * (i + 1), y = ground(x, z);
    const stem = new THREE.Mesh(stemGeo, stemMat);
    stem.position.set(x, y, z); stem.scale.y = h;
    group.add(stem);
    const cap = new THREE.Mesh(capGeo, i === gap ? emptyMat : capMat.clone());
    cap.position.set(x, y + h, z);
    cap.userData = { n: i === gap ? null : n, i };
    if (i !== gap) { const l = label(n, 0.5); if (l) cap.add(l); }
    group.add(cap);
    tops.push(cap.position.clone().setY(cap.position.y + 0.1));
    return cap;
  });

  // The mushrooms on the ground, toward the child, in a row across.
  const shroomGeo = new THREE.SphereGeometry(SHROOM, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  const choices = options.map((n, i) => {
    const off = (i - (options.length - 1) / 2) * GAP, x = at.x + sx * off - fx * FRONT, z = at.z + sz * off - fz * FRONT;
    const m = new THREE.Mesh(shroomGeo, new THREE.MeshStandardMaterial({ color: '#e06b5a', emissive: '#ffd27a', emissiveIntensity: 0, roughness: 0.7 }));
    m.position.set(x, ground(x, z) + 0.12, z);
    m.userData = { n, home: m.position.clone(), placed: false };
    const l = label(n, 0.62); if (l) m.add(l);
    group.add(m);
    return m;
  });
  // where the camera looks: between the mushrooms and the row
  const mid = -FRONT / 2;
  // the target a little over the ground: the row and the mushrooms fill the middle of the screen, the numbers of the
  // top steps stay clear of the bubble over it
  const center = new THREE.Vector3(at.x + fx * mid, ground(at.x + fx * mid, at.z + fz * mid) + 0.9, at.z + fz * mid);
  scene.add(group);
  hooks.prompt(spec.prompt);

  const hops = new Map<THREE.Mesh, { from: THREE.Vector3; to: THREE.Vector3; t: number }>();
  const rock = new Map<THREE.Mesh, number>();
  let counting: { t: number } | null = null, time = 0;
  const tapPoint = (m: THREE.Mesh) => m.position.clone().setY(m.position.y + TAP_UP);
  const hint: ShownHint | null = hintOf(spec.hint, null, {
    countCells: () => { counting = { t: time }; },
  });
  const core = taskCore(o.scope, hooks, hint, () => {
    counting = null;
    scene.remove(group);
    capGeo.dispose(); stemGeo.dispose(); shroomGeo.dispose();
    for (const t of textures) t.dispose();
  });

  function pick(m: THREE.Mesh) {
    if (!core.alive || m.userData.placed) return;
    const out = neighbors.answer(spec, st, m.userData.n as number);
    if (out === 'ignored') return;
    if (out === 'wrong') { rock.set(m, -1); void core.mistake(); return; }
    m.userData.placed = true;
    hops.set(m, { from: m.position.clone(), to: tops[gap].clone(), t: -1 });
    counting = null;
    hooks.good();
    core.solve(HOP * 1000 + 300);    // the mushroom lands on its step, then the task ends
  }
  const right = () => choices.find((m) => m.userData.n === answer)!;

  return {
    kind: 'steps', done: core.done, center, steps, choices, facing: at.facing,
    extent: {
      side: Math.max(...[...choices.map((m) => m.position), ...tops].map((p) => Math.abs((p.x - center.x) * sx + (p.z - center.z) * sz))) + 0.5,
      // with room over the numbers of the steps for the bubble at the top of the screen
      depth: Math.max(...[...choices.map((m) => m.position), ...tops].map((p) => Math.abs((p.x - center.x) * fx + (p.z - center.z) * fz))) + 0.6,
    },
    tap: (screenDist) => {
      if (!core.alive) return false;
      let best: THREE.Mesh | null = null, bd = o.reach;
      for (const m of choices) { if (m.userData.placed) continue; const d = screenDist(tapPoint(m)); if (d < bd) { bd = d; best = m; } }
      if (best) pick(best);
      return true;
    },
    solve: () => pick(right()),
    wrong: () => {
      if (!core.alive) return false;
      const m = choices.find((x) => x.userData.n !== answer && !x.userData.placed);
      if (!m) return false;
      pick(m);
      return true;
    },
    close: () => core.close(),
    state: () => ({ kind: 'steps', phase: core.phase, wrongs: core.wrongs, moves: right().userData.placed ? 1 : 0, rung: core.rung, progress: [] }),
    reach: o.reach,
    // a mushroom with its number over it: as big as the larger of the two
    targets: () => (core.alive ? choices.filter((m) => !m.userData.placed).map((m) => ({ pos: tapPoint(m), right: m.userData.n === answer, r: Math.max(SHROOM, LABEL / 2) })) : []),
    progress: () => [],
    resume: () => {},
    update: (t) => {
      time = t;
      for (const [m, h] of hops) {
        if (h.t < 0) h.t = t;
        const k = Math.min(1, (t - h.t) / HOP);
        m.position.lerpVectors(h.from, h.to, k).y += Math.sin(k * Math.PI) * 0.6;
        if (k >= 1) hops.delete(m);
      }
      for (const [m, r] of rock) {
        const t0 = r < 0 ? t : r;
        if (r < 0) rock.set(m, t);
        const k = t - t0;
        m.rotation.z = k < 0.5 ? Math.sin(k * 30) * 0.2 * (1 - k / 0.5) : 0;
        if (k >= 0.5) rock.delete(m);
      }
      // the hint: the steps lit one by one from the foot up to the empty one, the count of the panel's track
      const lit = counting ? Math.floor((t - counting.t) / 0.6) : -1;
      if (counting && lit > gap) counting = null;
      steps.forEach((s, i) => {
        const m = s.material as THREE.MeshStandardMaterial;
        if (i !== gap) m.emissiveIntensity = i === lit ? 0.7 : 0;
        else m.opacity = i === lit ? 0.9 : 0.45;
      });
    },
  };
}
