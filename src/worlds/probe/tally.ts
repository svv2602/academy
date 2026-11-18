/**
 * The probe world's own task in the world (PLAY-01, ARCH-16): "where are more?" over three columns of balls standing
 * on the meadow - plain shapes of THREE, no model, no file. The smallest kind a world can build on the shared frame
 * (src/game/worldtasks/core.ts): what the generic walkthrough's play of a task in the world is tried on. It is the same
 * every time (no random numbers): columns of COLUMNS balls, the tallest is the answer.
 *
 * The lines are the core's recorded ones, the question and the hint of comparing on the panel: nothing is recorded for
 * it. A tap on a column (by its distance on the screen) answers it: the right one ends the task, a wrong one wobbles
 * and goes the way of every mistake (the frame's course: "try again", then the rung of the hint - the way said, the
 * numbers over the columns, the right column pulsing).
 */
import * as THREE from 'three';
import type { Game } from '../../game/context';
import type { WorldScope } from '../../game/scope';
import { ladder, type Hint } from '../../game/tasks/types';
import { hintOf, type ShownHint } from '../../game/taskviews/flow';
import type { TaskHooks } from '../../game/taskviews/panel';
import type { Npc, WorldTask } from '../../game/world';
import { taskCore, type WorldTaskShow } from '../../game/worldtasks/core';
import type { WorldTaskPlayer } from '../../game/worldtasks/play';

/** The id of the step of a chain that plays it (WorldDef.worldTasks). */
export const TALLY = 'tally';
/** How many balls each column has, left to right; the answer is the tallest. */
export const COLUMNS: readonly number[] = [1, 3, 2];
/** The question and the hint: recorded lines of the core (the panel's "where are more?"). */
export const PROMPT = 't_compare_more';
export const HINT: Hint = ladder('h_count', { key: 'h2_compare', steps: [{ do: 'showNumbers' }] });

const GAP = 0.9;          // m between two columns
const BALL = 0.17;        // m: the radius of a ball
const RISE = 0.36;        // m from one ball to the one over it
const BEFORE = 2.2;       // m from the character to the row of columns
const LABEL = 0.45;       // m: the size of the number over a column

/** Where the row stands: its middle and the direction the child looks across it (radians, 0 = +z). */
export interface TallyPlace { x: number; z: number; facing: number }

export interface WorldTally extends WorldTaskShow {
  /** The columns, left to right as the child sees them; each holds its count in `userData.n`. */
  readonly columns: readonly THREE.Group[];
}

/** A number on a small canvas; null where there is no canvas (a unit test). */
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

export function showTallyInWorld(scene: THREE.Scene, at: TallyPlace, hooks: Pick<TaskHooks, 'prompt' | 'wrong' | 'hint' | 'good'>, o: { reach: number; scope: WorldScope }): WorldTally {
  const answer = COLUMNS.indexOf(Math.max(...COLUMNS));
  const sx = Math.cos(at.facing), sz = -Math.sin(at.facing);        // along the row, left to right
  const group = new THREE.Group();
  const ballGeo = new THREE.SphereGeometry(BALL, 16, 10);
  const mat = new THREE.MeshStandardMaterial({ color: '#7fc8ff', roughness: 0.5 });
  const textures: THREE.Texture[] = [];
  const columns = COLUMNS.map((n, i) => {
    const col = new THREE.Group(), off = (i - (COLUMNS.length - 1) / 2) * GAP;
    col.position.set(at.x + sx * off, 0, at.z + sz * off);
    for (let b = 0; b < n; b++) {
      const ball = new THREE.Mesh(ballGeo, mat);
      ball.position.y = BALL + b * RISE;
      col.add(ball);
    }
    const tex = numberTexture(n);
    if (tex) {
      textures.push(tex);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
      label.scale.setScalar(LABEL); label.position.y = BALL + n * RISE + 0.3; label.renderOrder = 2; label.visible = false;
      label.name = 'number';
      col.add(label);
    }
    col.userData = { n };
    group.add(col);
    return col;
  });
  scene.add(group);
  hooks.prompt(PROMPT);

  let pulse = false, numbers = false, time = 0;
  const wobble = new Map<THREE.Group, number>();
  // a tap is measured from the middle of a column: a child taps any of its balls
  const tapPoint = (c: THREE.Group) => c.position.clone().setY(BALL + ((c.userData.n as number) - 1) * RISE * 0.5);
  const hint: ShownHint | null = hintOf(HINT, () => { pulse = true; }, { showNumbers: () => { numbers = true; } });
  const core = taskCore(o.scope, hooks, hint, () => {
    scene.remove(group);
    ballGeo.dispose(); mat.dispose();
    for (const t of textures) t.dispose();
  });

  function pick(i: number) {
    if (!core.alive) return;
    if (i !== answer) { wobble.set(columns[i], -1); void core.mistake(); return; }
    hooks.good();
    core.solve();
  }
  const center = new THREE.Vector3(at.x, 0.4, at.z);

  return {
    kind: TALLY, done: core.done, center, facing: at.facing, columns,
    extent: { side: ((COLUMNS.length - 1) / 2) * GAP + 0.4, depth: 0.6 },
    tap: (screenDist) => {
      if (!core.alive) return false;
      let best = -1, bd = o.reach;
      columns.forEach((c, i) => { const d = screenDist(tapPoint(c)); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) pick(best);
      return true;
    },
    reach: o.reach,
    targets: () => (core.alive ? columns.map((c, i) => ({ pos: tapPoint(c), right: i === answer })) : []),
    solve: () => pick(answer),
    wrong: () => {
      if (!core.alive) return false;
      pick(answer === 0 ? 1 : 0);
      return true;
    },
    close: () => core.close(),
    state: () => ({ kind: TALLY, phase: core.phase, wrongs: core.wrongs, moves: core.phase === 'solved' ? 1 : 0, rung: core.rung, progress: [] }),
    progress: () => [],
    resume: () => {},
    update: (t) => {
      time = t;
      for (const [c, w] of wobble) {
        const t0 = w < 0 ? time : w;
        if (w < 0) wobble.set(c, time);
        const k = time - t0;
        c.rotation.z = k < 0.5 ? Math.sin(k * 30) * 0.15 * (1 - k / 0.5) : 0;
        if (k >= 0.5) wobble.delete(c);
      }
      columns.forEach((c, i) => {
        const label = c.getObjectByName('number');
        if (label) label.visible = numbers;
        c.scale.setScalar(pulse && i === answer ? 1 + 0.1 * (0.5 + 0.5 * Math.sin(time * 6)) : 1);
      });
    },
  };
}

/** Where the row stands for a character at `c`: BEFORE m in front of it, the child looks across the row at the character. */
export const tallyPlace = (c: { x: number; z: number; heading: number }): TallyPlace =>
  ({ x: c.x + Math.sin(c.heading) * BEFORE, z: c.z + Math.cos(c.heading) * BEFORE, facing: c.heading + Math.PI });

/** The step `tally` of a chain, before its character. Every level plays it in the world (it has one level: the same three columns). */
export function tallyTask(g: Pick<Game, 'scene' | 'touch' | 'hooksFor'>, player: WorldTaskPlayer, scope: WorldScope): WorldTask {
  return {
    skill: 'compare', inWorld: () => true,
    run: (n: Npc) => {
      const at = tallyPlace({ x: n.pos.x, z: n.pos.z, heading: n.def.heading });
      return player.play(showTallyInWorld(g.scene, at, g.hooksFor(n.def.emoji), { reach: g.touch ? 90 : 60, scope }));
    },
  };
}
