import * as THREE from 'three';
import { sfx } from '../../core/audio';
import { createRng } from '../../core/rng';
import type { Game } from '../../game/context';
import { levelFor } from '../../game/skills';
import type { TaskResult } from '../../game/taskviews/panel';
import type { WorldScope } from '../../game/scope';
import type { Npc, WorldTask } from '../../game/world';
import type { WorldTaskPlayer } from '../../game/worldtasks/play';
import { forget, keep, keptOf } from '../../game/worldtasks/kept';
import { generateLock, lockLevel, showLockInWorld, type LockSpec } from '../../game/worldtasks/lock';
import { tf } from '../../ui/strings';
import { LANDMARKS } from './layout';

/**
 * The mermaid queen's shell lock (WORLD-19, src/game/worldtasks/lock.ts) as the last step of her chain: she asks, the
 * talk ends, the heroine swims to the gate of the castle - the cat's sparkles lead there, as to any goal - and the lock
 * opens in its frame once she is at the gate. Solved, the gate's doors open and the step is done with its result: it
 * goes to "Composition of a number" as a task in the foreground's would (src/game/dialogue.ts `stepDone`). Closed with
 * the cross, the lock waits: swimming off and back opens it again.
 *
 * Its middle is kept in the world's progress as the maze's (`ws.tasks.lock`: the seed of its numbers and its level,
 * src/game/worldtasks/kept.ts): after a reload the queen asks again and the same lock stands in the gate. The grey build
 * speaks no line of its own: the bubble on the way is a subtitle (`sea_lock`) under the recorded question of the lock
 * (`t_missing`).
 */

export const LOCK = 'lock';
/** m: the heroine this near the place before the gate opens the lock; she must swim this much farther off to open it again. */
export const OPEN_R = 3, AGAIN_R = 6;

export interface LockStep extends WorldTask {
  /** The lock that stands in the gate now. */
  readonly spec: LockSpec;
  /** The doors of the gate: closed until the step is done. */
  readonly doors: THREE.Object3D;
  /** A frame: the doors, and the lock opened when she comes to the gate. */
  update(dt: number, canMove: boolean): void;
  /** The place before the gate while the step is on and the lock is not open; else null. */
  goal(): THREE.Vector3 | null;
  /** The walkthrough's move (`__game.cheat`): she is put before the gate (the lock opens at the next frame). False when not on. */
  cheat(): boolean;
  /** The step is done (the doors stand open from the start): the queen's chain is past it. */
  opened(done: boolean): void;
  dispose(): void;
}

export function createLock(g: Game, player: WorldTaskPlayer, scope: WorldScope): LockStep {
  const { scene, groundY, hero } = g;
  const gate = LANDMARKS.gate;
  // the child looks into the castle (+z) through the gate: the nests in it, the shells on the floor before it
  const at = { x: gate.x, z: gate.z - 0.6, facing: 0 };
  const before = new THREE.Vector3(gate.x, groundY(gate.x, gate.z - 3.5), gate.z - 3.5);

  // the doors: two leaves of mother-of-pearl between the posts, sinking into the floor once the lock is opened
  const doors = new THREE.Group();
  doors.name = 'castle-doors';
  const leafGeo = new THREE.BoxGeometry(1.8, 4.2, 0.25).translate(0, 2.1, 0);
  const leafMat = new THREE.MeshStandardMaterial({ color: '#e9dcef', emissive: '#a6c8e0', emissiveIntensity: 0.15, roughness: 0.5 });
  for (const sx of [-0.95, 0.95]) { const l = new THREE.Mesh(leafGeo, leafMat); l.position.set(sx, 0, 0.35); doors.add(l); }
  doors.position.set(gate.x, groundY(gate.x, gate.z), gate.z);
  scene.add(doors);
  let sink = 0, open = false;

  let spec!: LockSpec, seed = 0, level = 3;
  const build = (s: number, l: number) => { seed = s; level = lockLevel(l); spec = generateLock(level, createRng(`lock:${seed}`)); };
  const kept = () => keptOf(g.ws, LOCK);
  const k0 = kept();
  if (k0.length === 2) build(k0[0], k0[1]); else build(Math.floor(g.rng() * 1e6), levelFor(g.save, 'compose'));

  let on = false, owner: Npc | null = null, finished: (played?: TaskResult) => void = () => {}, armed = true, playing = false;
  const bubble = () => { g.speech.caption({ key: 't_missing', pri: 'task', hold: 0, speaker: '🧜‍♀️', text: tf('sea_lock', {}) }); };

  function play() {
    armed = false; playing = true;
    g.speech.caption(null);
    const show = showLockInWorld(scene, spec, at, g.hooksFor('🧜‍♀️'), { groundY, reach: g.touch ? 70 : 46, scope });
    void player.play(show).then((res) => {
      playing = false;
      if (!res.solved) { if (on) bubble(); return; }
      on = false;
      forget(g.ws, LOCK);
      open = true; sfx('fanfare');
      g.sparks.burst(new THREE.Vector3(gate.x, groundY(gate.x, gate.z) + 3, gate.z), '#bff4ff', 50, 4);
      g.persist();
      finished(res);
    });
  }

  return {
    skill: 'compose', endsInWorld: true,
    get spec() { return spec; },
    doors,
    start(n, done) {
      owner = n; finished = done; armed = true;
      // a middle kept: that lock; else a new one for the level of now
      if (kept().length !== 2) build(Math.floor(g.rng() * 1e6), levelFor(g.save, 'compose'));
      on = true;
      keep(g.ws, LOCK, [seed, level]); g.persist();
      bubble();
    },
    active: () => on,
    owner: () => (on ? owner?.def.id ?? null : null),
    reask: async () => { bubble(); },
    update(dt, canMove) {
      // the doors sink into the floor once opened (at once when the step was done before)
      sink = open ? Math.min(1, sink + dt / 1.2) : 0;
      doors.position.y = groundY(gate.x, gate.z) - sink * 4.3;
      doors.visible = sink < 1;
      if (!on || playing) return;
      const hp = hero.root.position, d = Math.hypot(hp.x - before.x, hp.z - before.z);
      if (d > AGAIN_R) armed = true;
      if (!g.busy && g.speech.shown?.key !== 't_missing') bubble();
      if (canMove && armed && d < OPEN_R) play();
    },
    goal: () => (on && !playing ? before : null),
    cheat() {
      if (!on || playing) return false;
      armed = true;
      hero.root.position.set(before.x, hero.root.position.y, before.z);
      return true;
    },
    opened(done) { if (done) { open = true; sink = 1; } },
    dispose() { scene.remove(doors); leafGeo.dispose(); leafMat.dispose(); },
  };
}
