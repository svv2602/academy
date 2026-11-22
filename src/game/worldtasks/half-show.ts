/**
 * "The second half" played in the world (WORLD-18): the show of ./half.ts. An open valve lies at the hinge with half a
 * pattern on it, its cells going out from the hinge to the left; before it lie the valves to close it with, each with its
 * cells going out from its own hinge to the right - so the right one looks the very pattern seen in a mirror. A tap on a
 * valve (by its distance on the screen): the right one flies onto the hinge and the shell closes; a wrong one rocks and
 * stays in its place (nothing is taken away), the course of a mistake is the frame's (./core.ts). The hint by its three
 * rungs (LEARN-10): the way said, then the mirror shown - ghosts of the pattern's figures beyond the hinge (`markUnits`),
 * then the right valve pulses.
 *
 * It draws no random numbers; the world opens it, wires its close button and calls `update` in its frame.
 */
import * as THREE from 'three';
import type { SpokenKey } from '../../ui/strings';
import type { WorldScope } from '../scope';
import type { FigColor } from '../tasks/odd';
import { ladder, type Hint } from '../tasks/types';
import { hintOf, type ShownHint } from '../taskviews/flow';
import type { TaskHooks } from '../taskviews/panel';
import { taskCore, type WorldTaskShow } from './core';
import { COLS, ROWS, generateHalfBody, type HalfBody, type HalfFigure, type HalfPattern } from './half';

export interface HalfSpec { type: 'half'; level: number; prompt: SpokenKey; hint: Hint; body: HalfBody }

/**
 * The description of a task: the pattern and its valves by the level of "Patterns", the question and the hint lines
 * the world gives (its own voice: the sea's turtle asks, the cat hints - WORLD-18, the lead's decision of 2026-11-22).
 */
export function generateHalf(level: number, rng: () => number, lines: { prompt: SpokenKey; way: SpokenKey; together: SpokenKey }): HalfSpec {
  const lv = Math.min(5, Math.max(1, Math.round(level)));
  return { type: 'half', level: lv, prompt: lines.prompt, hint: ladder(lines.way, { key: lines.together, steps: [{ do: 'markUnits' }] }), body: generateHalfBody(lv, rng) };
}

/** Where the shell lies: its hinge, and the direction the child looks across it, in radians. */
export interface HalfPlace { x: number; z: number; facing: number }
export interface WorldHalfOptions { groundY(x: number, z: number): number; reach: number; scope: WorldScope }

export interface WorldHalf extends WorldTaskShow {
  /** The valves to choose from, in the order of `body.options`; the open one with the given pattern. */
  readonly valves: readonly THREE.Group[];
  readonly open: THREE.Group;
}

const CELL = 0.22;        // m: one cell of a valve
const R = (COLS + 0.4) * CELL;   // m: the radius of a valve's half disc
const GAP = 0.35;         // m between two valves in the row
const FRONT = 1.3;        // m from the hinge to the row of valves, towards the child
const FLY = 0.55;         // s of game time the right valve takes to come onto the hinge
const LIFT = 0.06;        // m over the floor

const HEX: Readonly<Record<FigColor, string>> = { red: '#ff5a6e', blue: '#4aa8ff', yellow: '#ffd54f', green: '#5fd07a' };

function figureGeometry(shape: HalfFigure['shape']): THREE.BufferGeometry {
  const s = CELL * 0.38;
  if (shape === 'spot') return new THREE.CircleGeometry(CELL * 0.48, 20);
  if (shape === 'circle') return new THREE.CircleGeometry(s, 18);
  if (shape === 'square') return new THREE.PlaneGeometry(s * 1.7, s * 1.7);
  return new THREE.CircleGeometry(s * 1.15, 3);
}

/**
 * A valve: a half disc on the floor, its straight edge the hinge at the group's origin, its cells going out along
 * `side` (+1: to the right, -1: to the left); its figures lie on it.
 */
function valve(p: HalfPattern, side: 1 | -1, geos: THREE.BufferGeometry[], mats: THREE.Material[], ghost = false): THREE.Group {
  const g = new THREE.Group();
  if (!ghost) {
    const shellGeo = new THREE.CircleGeometry(R, 24, -Math.PI / 2, Math.PI);
    shellGeo.rotateX(-Math.PI / 2);
    if (side < 0) shellGeo.rotateY(Math.PI);
    geos.push(shellGeo);
    const m = new THREE.MeshStandardMaterial({ color: '#f3e4d0', roughness: 0.6, emissive: '#ffd27a', emissiveIntensity: 0, side: THREE.DoubleSide });
    mats.push(m);
    g.add(new THREE.Mesh(shellGeo, m));
  }
  for (const f of p) {
    const geo = figureGeometry(f.shape); geo.rotateX(-Math.PI / 2); geos.push(geo);
    const m = new THREE.MeshStandardMaterial({ color: HEX[f.color], roughness: 0.5, transparent: ghost, opacity: ghost ? 0.45 : 1 });
    mats.push(m);
    const fig = new THREE.Mesh(geo, m);
    fig.position.set(side * (f.col + 0.5) * CELL, 0.01, ((ROWS - 1) / 2 - f.row) * CELL);
    g.add(fig);
  }
  return g;
}

export function showHalfInWorld(scene: THREE.Scene, spec: HalfSpec, at: HalfPlace, hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'>, o: WorldHalfOptions): WorldHalf {
  const { body } = spec;
  const group = new THREE.Group();
  const fx = Math.sin(at.facing), fz = Math.cos(at.facing);       // away from the child
  const sx = Math.cos(at.facing), sz = -Math.sin(at.facing);      // to the child's right
  const y = (x: number, z: number) => o.groundY(x, z) + LIFT;
  const geos: THREE.BufferGeometry[] = [], mats: THREE.Material[] = [];
  const turn = at.facing;      // the valves turn with the place: their "right" is the child's right

  // the open valve at the hinge, its pattern going out to the left
  const open = valve(body.given, -1, geos, mats);
  open.position.set(at.x, y(at.x, at.z), at.z); open.rotation.y = turn;
  group.add(open);
  const hinge = open.position.clone();
  // the ghosts of the mirror (rung 2 of the hint): where the right valve's figures would lie, beyond the hinge
  const ghosts = valve(body.given, 1, geos, mats, true);
  ghosts.position.copy(hinge); ghosts.rotation.y = turn; ghosts.visible = false;
  group.add(ghosts);

  // the valves to choose from, in a row before the shell, towards the child
  const w = R + GAP, n = body.options.length;
  const valves = body.options.map((p, i) => {
    const v = valve(p, 1, geos, mats);
    const off = (i - (n - 1) / 2) * w - R / 2;      // their hinges in a row, each valve going out to the right of its own
    const x = at.x - fx * FRONT + sx * off, z = at.z - fz * FRONT + sz * off;
    v.position.set(x, y(x, z), z); v.rotation.y = turn;
    v.userData = { i, home: v.position.clone() };
    group.add(v);
    return v;
  });
  // a valve is tapped by its middle
  const middle = (v: THREE.Group) => v.position.clone().add(new THREE.Vector3(sx * R / 2, 0.05, sz * R / 2));
  const center = new THREE.Vector3(at.x - fx * FRONT / 2, hinge.y, at.z - fz * FRONT / 2);
  scene.add(group);
  hooks.prompt(spec.prompt);

  let pulse: THREE.Group | null = null, flying: { t: number } | null = null, time = 0;
  const rock = new Map<THREE.Group, number>();
  const right = valves[body.answer];
  const hint: ShownHint | null = hintOf(spec.hint, () => { pulse = right; }, { markUnits: () => { ghosts.visible = true; } });
  const core = taskCore(o.scope, hooks, hint, () => {
    pulse = null;
    scene.remove(group);
    for (const g of geos) g.dispose();
    for (const m of mats) m.dispose();
  });

  function pick(v: THREE.Group) {
    if (!core.alive || flying) return;
    if (v !== right) { rock.set(v, -1); void core.mistake(); return; }
    pulse = null; ghosts.visible = false;
    flying = { t: -1 };
    hooks.good();
    core.solve(FLY * 1000 + 300);     // the valve comes onto the hinge, the shell closes, then the task ends
  }

  return {
    kind: 'half', done: core.done, center, facing: at.facing, valves, open,
    extent: {
      side: Math.max(...valves.map((v) => Math.abs((v.position.x - center.x) * sx + (v.position.z - center.z) * sz))) + R + 0.2,
      depth: FRONT / 2 + R + 0.3,
    },
    tap: (screenDist) => {
      if (!core.alive) return false;
      let best: THREE.Group | null = null, bd = o.reach;
      for (const v of valves) { const d = screenDist(middle(v)); if (d < bd) { bd = d; best = v; } }
      if (best) pick(best);
      return true;
    },
    reach: o.reach,
    targets: () => (core.alive && !flying ? valves.map((v) => ({ pos: middle(v), right: v === right, r: R / 2 })) : []),
    solve: () => pick(right),
    wrong: () => {
      const v = valves.find((x) => x !== right);
      if (!core.alive || flying || !v) return false;
      pick(v);
      return true;
    },
    close: () => core.close(),
    state: () => ({ kind: 'half', phase: core.phase, wrongs: core.wrongs, moves: flying ? 1 : 0, rung: core.rung, progress: [] }),
    progress: () => [],
    resume: () => {},
    update: (t) => {
      time = t;
      if (flying) {
        if (flying.t < 0) flying.t = t;
        const k = Math.min(1, (t - flying.t) / FLY);
        right.position.lerpVectors(right.userData.home as THREE.Vector3, hinge, k).y += Math.sin(k * Math.PI) * 0.4;
      }
      for (const [v, r] of rock) {
        const t0 = r < 0 ? t : r;
        if (r < 0) rock.set(v, t);
        const k = t - t0;
        v.rotation.z = k < 0.5 ? Math.sin(k * 30) * 0.15 * (1 - k / 0.5) : 0;
        if (k >= 0.5) rock.delete(v);
      }
      for (const v of valves) v.scale.setScalar(v === pulse ? 1 + 0.1 * (0.5 + 0.5 * Math.sin(time * 6)) : 1);
    },
  };
}
