/**
 * The show of "sort" in the world (ARCH-09): the same description as on the panel (`tasks/sort.ts`), drawn as coloured
 * pedestals on an arc, with the crystal to sort floating over the middle of the arc. A tap on a pedestal (by its
 * distance on the screen, as the butterflies are tapped) answers with its colour; `sort.answer` judges it, and a mistake
 * goes the way of every task (`taskviews/flow.ts`): "try again", then the rung of that mistake (HINTS.md): the way said only,
 * then the crystal glowing while the pedestals light up in turn and its own one stays lit, then its pedestal pulses.
 *
 * Like the panel shows it draws no random numbers: everything it shows is in the description. It is the world's to
 * open it, to wire the close button (`showClose` in src/ui/ui.ts) and to call `update` in its frame.
 */
import * as THREE from 'three';
import type { WorldScope } from '../scope';
import { sort, type SortSpec } from '../tasks/sort';
import { hintOf, type ShownHint } from '../taskviews/flow';
import type { TaskHooks } from '../taskviews/panel';
import { taskCore, type WorldTaskShow } from './core';

/** The colours of the description, as they are drawn in the world. */
export const SORT_COLORS: Record<string, string> = { red: '#ff5a6e', blue: '#4aa8ff', yellow: '#ffd54f', green: '#5fd07a' };

/** Where the arc stands: its middle, and the direction it opens to (where the child looks at it from), in radians. */
export interface SortPlace { x: number; z: number; facing: number }

export interface WorldSortOptions {
  groundY(x: number, z: number): number;
  /** The farthest a tap may land from a pedestal on the screen, in pixels. */
  reach: number;
  /** The world's scope: the task's timer goes with the world (src/game/scope.ts). */
  scope: WorldScope;
}

export interface WorldSort extends WorldTaskShow {
  /** The pedestals in the order of the description's colours; each holds its colour in `userData.color`. */
  readonly pedestals: readonly THREE.Mesh[];
  /** The crystal to sort; its colour is in `userData.color` (null once every crystal is sorted). */
  readonly crystal: THREE.Mesh;
  /** The same as `solve` (the name the world's cheat knew it by). */
  cheat(): void;
}

const RADIUS = 1.8;            // m: the arc's radius
const STEP = 0.55;             // rad between two pedestals on the arc
const TOP = 0.55;              // m: the height of a pedestal

export function showSortInWorld(scene: THREE.Scene, spec: SortSpec, at: SortPlace, hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'>, o: WorldSortOptions): WorldSort {
  const st = sort.start(spec), { colors, queue } = spec.body;
  const group = new THREE.Group();
  // The arc bows around its centre of curvature, behind its middle: the pedestals face the child.
  const cx = at.x - Math.sin(at.facing) * RADIUS, cz = at.z - Math.cos(at.facing) * RADIUS;
  const center = new THREE.Vector3(cx, o.groundY(cx, cz), cz);
  const geo = new THREE.CylinderGeometry(0.32, 0.4, TOP, 20);
  geo.translate(0, TOP / 2, 0);
  const gemGeo = new THREE.OctahedronGeometry(0.22);
  const shake = new Map<THREE.Mesh, number>();
  let pulse: THREE.Mesh | null = null;
  // Rung 2: the pedestals light up one by one from `from` (-1: from the next frame); the crystal's own one then stays lit.
  let trying: { from: number } | null = null, own: THREE.Mesh | null = null;

  const pedestals = colors.map((color, i) => {
    const a = at.facing + (i - (colors.length - 1) / 2) * STEP;
    const x = cx + Math.sin(a) * RADIUS, z = cz + Math.cos(a) * RADIUS;
    const mat = new THREE.MeshStandardMaterial({ color: SORT_COLORS[color] ?? '#ffffff', emissive: SORT_COLORS[color] ?? '#ffffff', emissiveIntensity: 0.15, roughness: 0.5 });
    const p = new THREE.Mesh(geo, mat);
    p.position.set(x, o.groundY(x, z), z);
    p.userData = { color, x, sorted: 0 };
    group.add(p);
    return p;
  });

  const crystalMat = new THREE.MeshStandardMaterial({ roughness: 0.25, emissiveIntensity: 0.5 });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.34), crystalMat);
  // The crystal floats over the middle of the pedestals (not over the arc's centre behind them, where the character stands
  // and it would look carried on its back).
  const over = pedestals.reduce((v, p) => v.add(p.position), new THREE.Vector3()).divideScalar(pedestals.length).setY(center.y);
  crystal.position.copy(over).y += 1.5;
  group.add(crystal);
  const showCrystal = () => {
    const color = queue[st.pos] ?? null;
    crystal.userData = { color };
    crystal.visible = color !== null;
    if (color) { crystalMat.color.set(SORT_COLORS[color] ?? '#ffffff'); crystalMat.emissive.set(SORT_COLORS[color] ?? '#ffffff'); }
  };
  showCrystal();
  // where a frame looks: the middle of the pedestals, at half the height of the crystal over them
  const look = over.clone().setY(over.y + 0.8);
  scene.add(group);
  hooks.prompt(spec.prompt);

  const hint: ShownHint | null = hintOf(spec.hint, null, {
    tryBaskets: () => { trying = { from: -1 }; own = null; crystalMat.emissiveIntensity = 1; },
    pulseNext: () => { pulse = pedestals.find((p) => p.userData.color === sort.solution(spec, st)[0]) ?? null; },
  });
  // The course of the task is the frame's (./core.ts): its mistakes, its hint, its end - the end's timer is the world's.
  const core = taskCore(o.scope, hooks, hint, () => {
    pulse = null; trying = null; own = null;
    scene.remove(group);
    geo.dispose(); gemGeo.dispose(); crystal.geometry.dispose();
  });

  function pick(p: THREE.Mesh) {
    if (!core.alive) return;
    const color = p.userData.color as string;
    const out = sort.answer(spec, st, color);
    if (out === 'ignored') return;
    if (out === 'wrong') {
      shake.set(p, -1);                       // started at the next update
      void core.mistake();
      return;
    }
    // The crystal lands on its pedestal, the next one shows up.
    const gem = new THREE.Mesh(gemGeo, crystalMat.clone());
    gem.position.set(0, TOP + 0.2 + 0.3 * (p.userData.sorted as number)++, 0);
    p.add(gem);
    pulse = null; trying = null; own = null; crystalMat.emissiveIntensity = 0.5;
    hooks.good();
    showCrystal();
    if (out === 'right') core.solve(700);     // the last crystal lands, then the task ends
  }
  const solve = () => { for (const color of sort.solution(spec, st)) { const p = pedestals.find((x) => x.userData.color === color); if (p) pick(p); } };

  return {
    kind: 'sort', done: core.done, pedestals, crystal, facing: at.facing + Math.PI,
    // the frame looks between the pedestals and the crystal floating over the arc: both are on the screen
    center: look,
    // across the view: the arc's pedestals left and right of its middle; along it: the arc's bow and the crystal over it
    extent: { side: Math.max(...pedestals.map((p) => Math.abs((p.position.x - look.x) * Math.cos(at.facing) - (p.position.z - look.z) * Math.sin(at.facing)))) + 0.6, depth: RADIUS * 0.5 + 1.2 },
    tap: (screenDist) => {
      if (!core.alive) return false;
      let best: THREE.Mesh | null = null, bd = o.reach;
      const top = new THREE.Vector3();
      for (const p of pedestals) { const d = screenDist(top.copy(p.position).setY(p.position.y + TOP)); if (d < bd) { bd = d; best = p; } }
      if (best) pick(best);
      return true;
    },
    solve, cheat: solve,
    // a wrong move: a pedestal of another colour than the crystal's
    wrong: () => {
      if (!core.alive) return false;
      const p = pedestals.find((x) => x.userData.color !== queue[st.pos]);
      if (!p) return false;
      pick(p);
      return true;
    },
    close: () => core.close(),
    state: () => ({ kind: 'sort', phase: core.phase, wrongs: core.wrongs, moves: st.pos, rung: core.rung, progress: [] }),
    reach: o.reach,
    targets: () => (core.alive ? pedestals.map((p) => ({ pos: p.position.clone().setY(p.position.y + TOP), right: p.userData.color === queue[st.pos] })) : []),
    progress: () => [],
    resume: () => {},
    update: (time) => {
      crystal.position.y = over.y + 1.5 + Math.sin(time * 2.4) * 0.08;
      crystal.rotation.y = time * 1.5;
      if (trying?.from === -1) trying.from = time;
      const at = trying ? Math.floor((time - trying.from) / 0.6) : -1;
      if (trying && at >= pedestals.length) { trying = null; own = pedestals.find((p) => p.userData.color === queue[st.pos]) ?? null; }
      pedestals.forEach((p, i) => { (p.material as THREE.MeshStandardMaterial).emissiveIntensity = i === at ? 0.8 : p === own ? 0.6 : 0.15; });
      for (const p of pedestals) {
        let s = shake.get(p);
        if (s === -1) { shake.set(p, time); s = time; }
        const k = s === undefined ? 0 : time - s;
        if (s !== undefined && k > 0.4) shake.delete(p);
        p.position.x = (p.userData.x as number) + (s === undefined ? 0 : Math.sin(k * 40) * 0.06 * (1 - k / 0.4));
        p.scale.setScalar(p === pulse ? 1 + 0.12 * (0.5 + 0.5 * Math.sin(time * 6)) : 1);
      }
    },
  };
}
