import * as THREE from 'three';
import { randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import type { WorldScope } from '../scope';
import type { Hint } from '../tasks/types';
import { hintOf } from '../taskviews/flow';
import type { TaskHooks } from '../taskviews/panel';
import { taskCore, type WorldTaskShow } from './core';

/**
 * "The route of the winds" played in the world (WORLD-23, docs/13-worlds.md; docs/worlds/world-5.md «Задания,
 * разыгранные в мире» item 1): a map of cloud cells (3 × 3 on the lower levels, 4 × 4 on the upper), the little ship at
 * its start, the goal and 1-4 storm clouds. A tap on a cell turns the wind's arrow on it (none, east, south, west, north,
 * none again); a tap on the "set off" button sends the little ship: it sails straight on and turns where an arrow
 * blows. Bumping into a storm cloud or the map's edge it gently stops and sails back to the start, the arrows staying
 * where they are; reaching the goal solves it. The number of arrows and of clouds goes by the level of «Закономерности»,
 * only read: the route goes to no skill (the customer's decision 2026-11-18). The hint: after two launches that did not
 * reach the goal, the next right arrow lights (its line, `h3_show`, is the game's recorded "look what glows"; the first
 * rung is "look once more", `h_simon` - no line is recorded for the route itself).
 *
 * The arrows placed are the task's middle (`progress`): closed and opened again, they are still there.
 *
 * Like every show of a task it draws no random numbers. It is the world's to open it, to wire the close button and to
 * call `update` in its frame; the flight of the real ship is the world's (WORLD-05).
 */

/** The map, the arrows of the route and the storm clouds by the level of «Закономерности» (WORLD-23). */
export const WINDS_BY_LEVEL: Readonly<Record<number, { n: number; arrows: number; clouds: number }>> = {
  1: { n: 3, arrows: 2, clouds: 1 }, 2: { n: 3, arrows: 2, clouds: 2 }, 3: { n: 4, arrows: 3, clouds: 2 }, 4: { n: 4, arrows: 4, clouds: 3 }, 5: { n: 4, arrows: 5, clouds: 4 },
};
export const windsLevel = (level: number) => Math.min(5, Math.max(1, Math.round(level)));

/** A heading on the map: east, south, west, north (x to the east, z to the south, as the world's own). */
export type Dir = 0 | 1 | 2 | 3;
export const STEP: readonly (readonly [number, number])[] = [[1, 0], [0, 1], [-1, 0], [0, -1]];
export type Cell = readonly [number, number];
export const cellKey = (c: Cell) => `${c[0]},${c[1]}`;

export interface WindsSpec {
  level: number;
  /** The map is n × n cells. */
  n: number;
  /** Where the little ship starts, heading east. */
  start: Cell;
  goal: Cell;
  clouds: Cell[];
  /** The arrows of the route made: where each lies and where it blows, in the order the ship meets them. */
  solution: { cell: Cell; dir: Dir }[];
  /** The cells of that route, from the start to the goal. */
  path: Cell[];
}

export type SailEnd = 'goal' | 'cloud' | 'edge' | 'loop';
/** The little ship's way over the map with the arrows `arrows` ("x,z" -> heading): the cells it passes, and how it ends. */
export function sail(spec: Pick<WindsSpec, 'n' | 'start' | 'goal' | 'clouds'>, arrows: ReadonlyMap<string, Dir>): { cells: Cell[]; end: SailEnd } {
  const cloud = new Set(spec.clouds.map(cellKey));
  let at: Cell = spec.start, dir: Dir = 0;
  const cells: Cell[] = [at];
  for (let k = 0; k < spec.n * spec.n * 4; k++) {
    dir = arrows.get(cellKey(at)) ?? dir;
    const next: Cell = [at[0] + STEP[dir][0], at[1] + STEP[dir][1]];
    if (next[0] < 0 || next[1] < 0 || next[0] >= spec.n || next[1] >= spec.n) return { cells, end: 'edge' };
    if (cloud.has(cellKey(next))) return { cells, end: 'cloud' };
    at = next; cells.push(at);
    if (at[0] === spec.goal[0] && at[1] === spec.goal[1]) return { cells, end: 'goal' };
  }
  return { cells, end: 'loop' };
}

/**
 * A map for `level`: a route of straight legs from the start on the western edge, heading east, turning a quarter at
 * each arrow, never crossing itself; the goal is its end. The storm clouds lie off the route, first straight ahead of
 * its turns (where a missing arrow would take the ship); the ship with no arrow at all never reaches the goal.
 */
export function generateWinds(level: number, rng: Rng): WindsSpec {
  const l = windsLevel(level), by = WINDS_BY_LEVEL[l], n = by.n;
  for (let tries = 0; tries < 2000; tries++) {
    const start: Cell = [0, randInt(0, n - 1, rng)];
    const path: Cell[] = [start], seen = new Set([cellKey(start)]), solution: { cell: Cell; dir: Dir }[] = [];
    let at = start, dir: Dir = 0, ok = true;
    for (let s = 0; s <= by.arrows && ok; s++) {
      if (s > 0) { dir = ((dir + (rng() < 0.5 ? 1 : 3)) % 4) as Dir; solution.push({ cell: at, dir }); }
      const len = randInt(1, n - 1, rng);
      for (let i = 0; i < len; i++) {
        const next: Cell = [at[0] + STEP[dir][0], at[1] + STEP[dir][1]];
        if (next[0] < 0 || next[1] < 0 || next[0] >= n || next[1] >= n || seen.has(cellKey(next))) { ok = false; break; }
        at = next; path.push(at); seen.add(cellKey(at));
      }
    }
    if (!ok) continue;
    const goal = at;
    // the storm clouds: off the route, straight ahead of its turns first, then anywhere else
    const free = (c: Cell) => c[0] >= 0 && c[1] >= 0 && c[0] < n && c[1] < n && !seen.has(cellKey(c));
    const ahead: Cell[] = [];
    for (let i = 0; i < solution.length; i++) {
      const before = i === 0 ? 0 : solution[i - 1].dir, c = solution[i].cell, a: Cell = [c[0] + STEP[before][0], c[1] + STEP[before][1]];
      if (free(a) && !ahead.some((x) => cellKey(x) === cellKey(a))) ahead.push(a);
    }
    const rest: Cell[] = [];
    for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) { const c: Cell = [x, z]; if (free(c) && !ahead.some((a) => cellKey(a) === cellKey(c))) rest.push(c); }
    for (let i = rest.length - 1; i > 0; i--) { const j = randInt(0, i, rng); [rest[i], rest[j]] = [rest[j], rest[i]]; }
    const clouds = [...ahead, ...rest].slice(0, by.clouds);
    if (clouds.length < 1) continue;
    const spec: WindsSpec = { level: l, n, start, goal, clouds, solution, path };
    const arrows = new Map(solution.map((s) => [cellKey(s.cell), s.dir] as const));
    if (sail(spec, arrows).end !== 'goal' || sail(spec, new Map()).end === 'goal') continue;
    return spec;
  }
  throw new Error(`no map of the winds for level ${l}`);
}

/** The hint of the route: "look once more", then the next right arrow lit with the game's "look what glows". */
export const WINDS_HINT: Hint = { rungs: [{ key: 'h_simon', steps: [] }, { key: 'h3_show', steps: [{ do: 'pulseNext' }] }, { key: 'h3_show', steps: [{ do: 'pulseNext' }] }] };

export interface WindsPlace { x: number; z: number; y: number; facing: number }
export interface WorldWindsOptions {
  reach: number;
  scope: WorldScope;
  /** The arrows of a middle kept (`progress` of an earlier opening). */
  kept?: readonly number[];
}
export interface WorldWinds extends WorldTaskShow {
  /** The arrows on the map now ("x,z" -> heading). */
  readonly arrows: ReadonlyMap<string, Dir>;
  /** Where the little ship is on the map now. */
  readonly ship: THREE.Object3D;
  /** Turns the arrow of `cell` once, as a tap on it does. */
  turn(cell: Cell): void;
  /** Sends the little ship, as a tap on the button does. */
  go(): void;
}

const CELL = 0.8;          // m: a cell of the map (a finger on a phone: tools/world-pass.mjs MIN_TAP_PX)
const PER_CELL = 0.35;     // s of game time the little ship takes a cell
const TABLE_Y = 0.85;      // m: the map's height over the ground (a table on the pier)

export function showWindsInWorld(scene: THREE.Scene, spec: WindsSpec, at: WindsPlace, hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'>, o: WorldWindsOptions): WorldWinds {
  const { n } = spec;
  const group = new THREE.Group();
  group.position.set(at.x, at.y + TABLE_Y, at.z); group.rotation.y = at.facing + Math.PI;
  // the map's cells in the group's frame: x across (east on the map), z away from the child (south on the map is toward her)
  const local = (c: Cell) => new THREE.Vector3((c[0] - (n - 1) / 2) * CELL, 0, (c[1] - (n - 1) / 2) * CELL);
  const world = (v: THREE.Vector3) => group.localToWorld(v.clone());
  const mat = (color: string, o2: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...o2 });
  // the table and its cloud cells
  const board = new THREE.Mesh(new THREE.BoxGeometry(n * CELL + 0.3, 0.12, n * CELL + 0.3), mat('#8a5a3a'));
  board.position.y = -0.08; group.add(board);
  const cellGeo = new THREE.BoxGeometry(CELL * 0.92, 0.06, CELL * 0.92);
  const cells = new Map<string, THREE.Mesh>();
  for (let x = 0; x < n; x++) for (let z = 0; z < n; z++) {
    const c: Cell = [x, z], m = new THREE.Mesh(cellGeo, mat('#e8f1ff', { emissive: '#ffc21a', emissiveIntensity: 0 }));
    m.position.copy(local(c)); m.userData = { cell: c };
    group.add(m); cells.set(cellKey(c), m);
  }
  // the storm clouds, the goal (violet flowers' islet), the little ship
  for (const c of spec.clouds) { const m = new THREE.Mesh(new THREE.IcosahedronGeometry(CELL * 0.36, 0).scale(1.2, 0.7, 1), mat('#5a5f78')); m.position.copy(local(c)).setY(0.2); group.add(m); }
  const goal = new THREE.Mesh(new THREE.CylinderGeometry(CELL * 0.32, CELL * 0.36, 0.12, 10), mat('#a24fd6')); goal.position.copy(local(spec.goal)).setY(0.08); group.add(goal);
  const ship = new THREE.Group();
  ship.add(new THREE.Mesh(new THREE.BoxGeometry(CELL * 0.5, 0.12, CELL * 0.26), mat('#8a4a2a')));
  const balloon = new THREE.Mesh(new THREE.SphereGeometry(CELL * 0.18, 10, 8), mat('#e8483c')); balloon.position.y = 0.3; ship.add(balloon);
  ship.position.copy(local(spec.start)).setY(0.12); group.add(ship);
  // the arrows: a flat triangle on a cell, pointing where its wind blows
  const arrowGeo = new THREE.ConeGeometry(CELL * 0.26, CELL * 0.5, 3).rotateZ(-Math.PI / 2).scale(1, 0.25, 1);
  const arrowMeshes = new Map<string, THREE.Mesh>();
  const arrows = new Map<string, Dir>();
  const drawArrow = (key: string) => {
    const d = arrows.get(key), m0 = arrowMeshes.get(key);
    if (d === undefined) { if (m0) { group.remove(m0); arrowMeshes.delete(key); } return; }
    const m = m0 ?? new THREE.Mesh(arrowGeo, mat('#3b7be0'));
    const [x, z] = key.split(',').map(Number) as [number, number];
    m.position.copy(local([x, z])).setY(0.08);
    m.rotation.y = -Math.atan2(STEP[d][1], STEP[d][0]);
    if (!m0) { group.add(m); arrowMeshes.set(key, m); }
  };
  if (o.kept) for (let i = 0; i + 2 < o.kept.length; i += 3) { const key = cellKey([o.kept[i], o.kept[i + 1]]); arrows.set(key, (o.kept[i + 2] % 4) as Dir); drawArrow(key); }
  // the button that sends the ship: a round red one at the near edge
  const button = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.3, 0.14, 16), mat('#e8483c', { emissive: '#ffc21a', emissiveIntensity: 0 }));
  button.position.set(0, 0.05, (n * CELL) / 2 + 0.45); group.add(button);
  scene.add(group);
  group.updateMatrixWorld(true);
  hooks.prompt('t_pattern');

  let time = 0, voyage: { cells: Cell[]; end: SailEnd; t: number; back: number } | null = null, pulse: string | null = null, moves = 0;
  const busy = () => voyage !== null;
  const nextRight = () => spec.solution.find((s) => arrows.get(cellKey(s.cell)) !== s.dir) ?? null;
  const core = taskCore(o.scope, hooks, hintOf(WINDS_HINT, null, { pulseNext: () => { const s = nextRight(); pulse = s ? cellKey(s.cell) : null; } }), () => { scene.remove(group); cellGeo.dispose(); arrowGeo.dispose(); });
  const fixed = (c: Cell) => cellKey(c) === cellKey(spec.goal) || spec.clouds.some((x) => cellKey(x) === cellKey(c));
  function turn(c: Cell) {
    if (!core.alive || busy() || fixed(c)) return;
    const key = cellKey(c), d = arrows.get(key);
    if (d === undefined) arrows.set(key, 0); else if (d === 3) arrows.delete(key); else arrows.set(key, (d + 1) as Dir);
    drawArrow(key); moves++;
    if (pulse === key && arrows.get(key) === spec.solution.find((s) => cellKey(s.cell) === key)?.dir) pulse = null;
  }
  function go() {
    if (!core.alive || busy()) return;
    const s = sail(spec, arrows);
    voyage = { ...s, t: time, back: -1 };
    if (s.end === 'goal') { pulse = null; hooks.good(); core.solve((s.cells.length * PER_CELL + 0.4) * 1000); }
  }
  const targetsNow = () => {
    const out: { pos: THREE.Vector3; right: boolean; r?: number; cell?: Cell }[] = [];
    for (const [key, m] of cells) { const c = m.userData.cell as Cell; if (!fixed(c)) out.push({ pos: world(m.position), right: spec.solution.some((s) => cellKey(s.cell) === key), r: CELL / 2, cell: c }); }
    out.push({ pos: world(button.position), right: true, r: 0.3 });
    return out;
  };
  const center = world(new THREE.Vector3(0, 0, 0.3));
  const fx = Math.sin(at.facing), fz = Math.cos(at.facing);
  void fx; void fz;

  return {
    kind: 'winds', done: core.done, center, facing: at.facing, mistakes: 1, ship,
    get arrows() { return arrows; },
    extent: { side: (n * CELL) / 2 + 0.3, depth: (n * CELL) / 2 + 0.8 },
    turn, go,
    tap: (screenDist) => {
      if (!core.alive) return false;
      let best: ReturnType<typeof targetsNow>[number] | null = null, bd = o.reach;
      for (const t of targetsNow()) { const d = screenDist(t.pos); if (d < bd) { bd = d; best = t; } }
      if (best) { if (best.cell) turn(best.cell); else go(); }
      return true;
    },
    // the walkthrough's moves go through `turn` and `go`, a tap's handlers
    solve: () => {
      if (!core.alive) return;
      voyage = null; ship.position.copy(local(spec.start)).setY(0.12);
      for (const s of spec.solution) { let guard = 0; while (arrows.get(cellKey(s.cell)) !== s.dir && guard++ < 5) turn(s.cell); }
      // an arrow off the route that would turn the ship away: taken off
      for (const key of [...arrows.keys()]) if (!spec.solution.some((s) => cellKey(s.cell) === key)) { arrows.delete(key); drawArrow(key); }
      go();
    },
    wrong: () => {
      if (!core.alive || busy()) return false;
      // a launch that does not reach the goal: the arrows as they are, or none if they make the route already
      if (sail(spec, arrows).end === 'goal') for (const key of [...arrows.keys()]) { arrows.delete(key); drawArrow(key); }
      go();
      return true;
    },
    close: () => core.close(),
    state: () => ({ kind: 'winds', phase: core.phase, wrongs: core.wrongs, moves, rung: core.rung, progress: [...arrows].flatMap(([k, d]) => [...k.split(',').map(Number), d]) }),
    reach: o.reach,
    targets: () => (core.alive && !busy() ? targetsNow().map(({ pos, right, r }) => ({ pos, right, r })) : []),
    progress: () => [...arrows].flatMap(([k, d]) => [...k.split(',').map(Number), d]),
    resume: (state) => { for (let i = 0; i + 2 < state.length; i += 3) { const key = cellKey([state[i], state[i + 1]]); arrows.set(key, (state[i + 2] % 4) as Dir); drawArrow(key); } },
    update: (t) => {
      time = t;
      if (voyage) {
        const k = (t - voyage.t) / PER_CELL, last = voyage.cells.length - 1;
        if (voyage.back < 0) {
          const i = Math.min(last, Math.floor(k)), f = Math.min(1, k - i);
          const a = local(voyage.cells[i]), b = local(voyage.cells[Math.min(last, i + 1)]);
          ship.position.lerpVectors(a, b, i >= last ? 0 : f).setY(0.12);
          if (k >= last + (voyage.end === 'goal' ? 0 : 0.6)) {
            if (voyage.end === 'goal') voyage = null;
            else { voyage.back = t; void core.mistake(); }      // stopped by a cloud or the edge: it sails back to the start
          }
        } else {
          const q = Math.min(1, (t - voyage.back) / 0.8);
          ship.position.lerpVectors(local(voyage.cells[last]), local(spec.start), q).setY(0.12 + Math.sin(q * Math.PI) * 0.15);
          if (q >= 1) voyage = null;
        }
      }
      for (const [key, m] of cells) (m.material as THREE.MeshStandardMaterial).emissiveIntensity = key === pulse ? 0.5 + Math.sin(t * 6) * 0.3 : 0;
      (button.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.15 + Math.sin(t * 3) * 0.1;
    },
  };
}
