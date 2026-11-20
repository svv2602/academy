import * as THREE from 'three';
import { sfx } from '../../core/audio';
import { createRng } from '../../core/rng';
import type { Game } from '../../game/context';
import { levelFor } from '../../game/skills';
import type { Npc, WorldTask } from '../../game/world';
import { forget, keep, keptOf } from '../../game/worldtasks/kept';
import { BUSH_R, generateMaze, layMaze, mazeLevel, mazeWalk, showMaze, type MazeGeo, type MazeShow, type MazeSpec, type MazeWalk } from '../../game/worldtasks/maze';
import { tf } from '../../ui/strings';
import { MAZE_FRAME, MAZE_IN, inMaze } from './layout';
import { colliders } from './terrain';

/**
 * The hedgehog's maze of paths (WORLD-14, src/game/worldtasks/maze.ts) as the step of its chain: a step in the
 * background, like Shustrik's nuts - the talk ends, she walks into the maze herself and out of it whenever she likes.
 * The forks are passed by walking the way that goes on with the pattern; the end of the last lane is the step done
 * (the fifth leaf lies just past it). The maze goes to no skill (the customer's decision 2026-11-18): the level of
 * "Patterns" is only read, for the number of forks and ways.
 *
 * Its middle is kept in the world's progress (`ws.tasks.maze`: forks passed, the seed of its patterns, its level):
 * the same maze stands there next time, and walking in by the way in brings her to the last fork passed. After 40 s
 * without a fork passed the cat's sparkles lead to the right way (`goal`). The grey build speaks no line of its own: the
 * bubble is a subtitle under the recorded "what comes next?" (`t_pattern`) with the forks passed.
 */

export const MAZE = 'maze';
/** s without a fork passed before the cat's sparkles lead to the right way. */
export const STUCK = 40;
/** rad: the least pitch of the camera behind her inside the maze: nearly from above, the maze read as a board (behind her elsewhere 0.36; a task's frame 0.8). */
export const PITCH = 0.9;
/** m: the camera's distance behind her inside the maze (out of it the camera's own, about 6 on a phone). */
export const DIST = 8;

export interface MazeStep extends WorldTask {
  /** The maze that stands in the forest now (its description, its paths, the judge of her walking). */
  readonly spec: MazeSpec;
  readonly geo: MazeGeo;
  readonly walk: MazeWalk;
  /** A frame: her walking judged (while the step is on), the glow, coming in again by the way in. */
  update(dt: number, time: number, canMove: boolean): void;
  /** The right way at the fork ahead (or the end) once she has walked a while without passing a fork; else null. */
  goal(): THREE.Vector3 | null;
  /**
   * The walkthrough's move (one per call, `__game.cheat`): to the first fork, a wrong way taken there on purpose, back,
   * the right way; after half the forks out of the maze and in again by the way in (she must come back at the last
   * fork passed); on to the end. False when the step is not on.
   */
  cheat(): boolean;
  dispose(): void;
}

export function createMaze(g: Game): MazeStep {
  const { scene, groundY, hero, sparks } = g;
  let show: MazeShow | null = null, mine: { x: number; z: number; r: number }[] = [];
  let spec!: MazeSpec, geo!: MazeGeo, walk!: MazeWalk, seed = 0, level = 1;
  let mine2 = false;            // the camera's distance is the maze's (set by it, given back by it)
  let on = false, owner: Npc | null = null, finished: () => void = () => {}, idle = 0, inside = false;

  /** The maze of `seed` on `level` in the scene (the old one taken away, its bushes out of the colliders). */
  function build(s: number, l: number, passed: number) {
    show?.dispose();
    for (const c of mine) { const i = colliders.indexOf(c); if (i >= 0) colliders.splice(i, 1); }
    seed = s; level = mazeLevel(l);
    spec = generateMaze(level, createRng(`maze:${seed}`));
    geo = layMaze(spec, MAZE_FRAME);
    walk = mazeWalk(geo, passed);
    show = showMaze(scene, spec, geo, groundY);
    mine = geo.walls.map((b) => ({ x: b.x, z: b.z, r: BUSH_R }));
    colliders.push(...mine);
  }
  const kept = () => keptOf(g.ws, MAZE);
  const stored = () => keep(g.ws, MAZE, [walk.passed, seed, level]);
  // the maze kept from last time stands as it was; else one for the level of now (a new one is laid at the step's start)
  const k0 = kept();
  if (k0.length === 3) build(k0[1], k0[2], k0[0]);
  else build(Math.floor(g.rng() * 1e6), levelFor(g.save, 'pattern'), 0);

  const bubble = () => {
    g.speech.caption({ key: 't_pattern', pri: 'task', hold: 0, speaker: '🦔', text: tf('forest_maze', { n: walk.passed, of: spec.forks.length }) });
  };
  const at = (p: { x: number; z: number }) => hero.root.position.set(p.x, groundY(p.x, p.z), p.z);
  const burst = (p: { x: number; z: number }, color: string, n = 18) => sparks.burst(new THREE.Vector3(p.x, groundY(p.x, p.z) + 0.6, p.z), color, n, 3);

  function end() {
    on = false; idle = 0;
    forget(g.ws, MAZE);
    g.speech.caption(null);
    g.persist();
    finished();
  }

  // the walkthrough's moves, in order (see `cheat`)
  let plan: (() => void)[] = [];
  const planFor = () => {
    const out: (() => void)[] = [];
    const f0 = walk.passed, half = Math.ceil(spec.forks.length / 2);
    for (let k = f0; k < spec.forks.length; k++) {
      const f = geo.forks[k], wrong = f.ways.find((w) => !w.right), right = f.ways.find((w) => w.right)!;
      out.push(() => at(f.at));
      // the wrong way's farthest point, round its bush (its first points are nearer the fork than a way is taken)
      const far = wrong && wrong.line.reduce((b, p) => (Math.hypot(p.x - f.at.x, p.z - f.at.z) > Math.hypot(b.x - f.at.x, b.z - f.at.z) ? p : b));
      if (k === f0 && far) out.push(() => at(far), () => at(f.at));
      out.push(() => at(right.line[1]));
      if (k + 1 === half && half < spec.forks.length) out.push(() => at({ x: MAZE_IN.x + 4, z: MAZE_IN.z }), () => at(geo.trunk[1]));
    }
    out.push(() => at(geo.end));
    return out;
  };

  return {
    skill: 'pattern',     // only read: the maze records nothing (the customer's decision 2026-11-18)
    get spec() { return spec; },
    get geo() { return geo; },
    get walk() { return walk; },
    start(n, done) {
      owner = n; finished = done; idle = 0;
      const k = kept();
      // a middle kept: that maze goes on; else a new one for the level of now (she stands by the hedgehog, outside it)
      if (k.length !== 3) build(Math.floor(g.rng() * 1e6), levelFor(g.save, 'pattern'), 0);
      on = true; plan = [];
      stored(); g.persist();
      bubble();
    },
    active: () => on,
    owner: () => (on ? owner?.def.id ?? null : null),
    reask: async () => { bubble(); },
    update(dt, time, canMove) {
      show?.update(time, on && walk.glow ? walk.passed : -1);
      // between its hedges the camera looks down steeper: the row of the pattern and the ways of the fork ahead show
      // past her and over the hedge (src/game/camera.ts camPitchMin)
      const within = inMaze(hero.root.position.x, hero.root.position.z);
      g.camPitchMin = within ? PITCH : null;
      // and from farther back: the row of the pattern and the ways of the fork in one look (the camera's own distance out)
      if (within) { g.camOverride = DIST; mine2 = true; } else if (mine2) { g.camOverride = null; mine2 = false; }
      if (!on) return;
      if (!g.busy && g.speech.shown?.key !== 't_pattern') bubble();
      idle += dt;
      const hp = hero.root.position, was = inside;
      inside = inMaze(hp.x, hp.z);
      if (!canMove) return;
      // walked in by the way in with forks passed: on from the last of them
      if (!was && inside && walk.passed > 0 && Math.hypot(hp.x - geo.trunk[1].x, hp.z - geo.trunk[1].z) < 3) {
        const p = walk.resumeAt();
        burst(hp, '#fff2a8');
        at(p);
        burst(p, '#fff2a8', 30);
        return;
      }
      const r = walk.step(hp.x, hp.z);
      if (r === 'right') {
        idle = 0;
        sfx('chime'); burst(hp, '#7ff0b0', 24);
        stored(); g.persist();
        bubble();
        if (walk.passed === spec.forks.length) return;
      } else if (r === 'wrong') {
        void g.hooksFor('🦔').wrong();        // the soft sound and the cat's "try again", the rule of every task (core.ts)
      } else if (r === 'end') {
        burst(hp, '#7ff0b0', 40);
        end();
      }
    },
    goal() {
      if (!on || idle < STUCK) return null;
      const f = geo.forks[walk.passed];
      const p = f ? f.ways.find((w) => w.right)!.line[1] : geo.end;
      return new THREE.Vector3(p.x, groundY(p.x, p.z), p.z);
    },
    cheat() {
      if (!on) return false;
      if (!plan.length) plan = planFor();
      const move = plan.shift();
      if (!move) return false;
      move();
      return true;
    },
    dispose() {
      g.camPitchMin = null;
      if (mine2) { g.camOverride = null; mine2 = false; }
      show?.dispose(); show = null;
      for (const c of mine) { const i = colliders.indexOf(c); if (i >= 0) colliders.splice(i, 1); }
      mine = [];
    },
  };
}
