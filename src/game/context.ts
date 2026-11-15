import * as THREE from 'three';
import { tint, type Rig } from '../core/assets';
import { beginTask, endTask, say, sfx } from '../core/audio';
import { tuning } from '../core/tuning';
import { storeSave, type Save } from '../core/save';
import type { Rng } from '../core/rng';
import { pick, randInt } from '../core/util';
import { Actor } from './actor';
import { Sparks } from './fx';
import type { Stage } from './stage';
import type { Speech } from './speech';
import type { TaskHooks, TaskResult } from './tasks';
import { Butterflies } from './butterflies';
import type { WorldGround } from './world';
import { el, setAct, setCounter } from '../ui/ui';

/** A walk the heroine makes by herself (a tap on the ground or on a spot); `then` runs when she gets there. */
export interface Auto { x: number; z: number; then?: () => void; stuck: number; last: number }
export interface Cam { yaw: number; pitch: number; dist: number; target: THREE.Vector3; focus: THREE.Vector3 | null }

/**
 * The state the parts of the game share (ARCH-05): made once after the models are loaded and handed to every part.
 * The flags are plain fields, read through `g` every time: a scene started in a frame (playScene -> take) sets
 * `busy` at once, and the rest of that frame has to see it.
 */
export interface Game {
  readonly scene: THREE.Scene; readonly camera: THREE.PerspectiveCamera; readonly renderer: THREE.WebGLRenderer;
  readonly save: Save; readonly touch: boolean; readonly debug: boolean; readonly speech: Speech;
  readonly hero: Actor; readonly cat: Actor; readonly sparks: Sparks; readonly flies: Butterflies; readonly cam: Cam;
  /** The ground of the world being played (its relief and colliders): the shared code never reaches a world directly. */
  readonly ground: WorldGround;
  /**
   * The world's part of the save (ARCH-07 makes it a `WorldState` of its own); until then it is the save itself.
   * Readers of a world's progress (quests, final, chest, stars taken, position) go through it.
   */
  readonly ws: Save;
  /**
   * The randomness of the tasks (ARCH-08): which task, its numbers and pictures, where the stars and butterflies are.
   * Seeded by `?seed=`, else Math.random. Praise, "try again" and the scenery do not draw from it.
   */
  readonly rng: Rng;
  /** A conversation, task or cut-scene is running: the heroine stands still. */
  busy: boolean;
  /** A menu is open. */
  paused: boolean;
  auto: Auto | null;
  camOverride: number | null;
  /** >0 while the shards merge into the crystal. */
  finale: number;
  /** Test hook (__game.failNext): the next scene breaks once. */
  failNext: boolean;
  groundY(x: number, z: number): number;
  started(): boolean;
  persist(): void;
  refreshHud(): void;
  // A property, not a method: no-penalties.test.ts reads the name followed by a bracket as a call with an amount.
  addStars: (n: number, at: THREE.Vector3) => void;
  above(p: THREE.Vector3, dy: number): THREE.Vector3;
  fault(): void;
  praise(): Promise<void>;
  /** A task from its opening to its end, whichever way it ends: meanwhile only its own lines sound, and its end stops them. */
  task(open: () => Promise<TaskResult>): Promise<TaskResult>;
  hooksFor(speaker: string): TaskHooks;
}

/**
 * `crystals` is the text of the crystal counter: the world knows how many parts there are. `ground` and `spawn` are
 * the world's (WorldDef): where the heroine stands on a first launch and what she walks on.
 */
export function createGame(o: {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; save: Save; touch: boolean;
  debug: boolean; speech: Speech; heroRig: Rig; catRig: Rig; crystals: () => string; rng: Rng;
  ground: WorldGround; spawn: { x: number; z: number };
}): Game {
  const { scene, save, speech, ground, spawn } = o;
  const ws = save;
  const sparks = new Sparks(scene);
  const groundY = (x: number, z: number) => ground.height(x, z);
  const flies = new Butterflies(scene, 96, groundY);

  // ----- hero -----
  const hero = new Actor(o.heroRig);
  hero.root.position.set(ws.pos?.[0] ?? spawn.x, 0, ws.pos?.[1] ?? spawn.z);
  hero.heading = Math.PI; hero.root.rotation.y = Math.PI;
  scene.add(hero.root);
  hero.play('Idle');

  // ----- cat companion -----
  const cat = new Actor(o.catRig);
  cat.root.position.set(hero.root.position.x + 1, 0, hero.root.position.z + 0.6);
  scene.add(cat.root);
  cat.play('Idle');
  tint(cat.model, { Cat_Main: '#f7a94b', Cat_Secondary: '#d27a2c', Ears: '#f9a8bd', Eye_White: '#ffffff' });

  const cam: Cam = { yaw: 0, pitch: 0.36, dist: tuning.camDist, target: new THREE.Vector3(), focus: null };
  cam.target.copy(hero.root.position);

  const persist = () => { ws.pos = [hero.root.position.x, hero.root.position.z]; storeSave(save); };
  const task = async (open: () => Promise<TaskResult>) => { beginTask(); try { return await open(); } finally { endTask(); } };
  const refreshHud = () => { setCounter('stars', String(save.stars)); setCounter('crystals', o.crystals()); };
  // The one writer of the stars (src/game/no-penalties.test.ts reads this line): it only ever adds.
  const addStars = (n: number, at: THREE.Vector3) => { save.stars += n; sparks.burst(at, '#ffe066', 24); sfx('chime'); refreshHud(); persist(); };
  const above = (p: THREE.Vector3, dy: number) => p.clone().setY(p.y + dy);
  async function praise() {
    sfx('good'); cat.once('Yes', 'Idle');
    sparks.burst(above(hero.root.position, 1.2), '#ff9ed2', 30, 4);
    speech.caption(null);
    await say(`praise_${pick([0, 1, 3, 4, 5, 6, 7])}`, 'Молодець!', 'story');
  }

  // ----- panel tasks -----
  const hooksFor = (speaker: string): TaskHooks => ({
    prompt: (key) => { void speech.line(key, 'task', 0, speaker); },
    number: (n) => { void say(`tap_${n}`, String(n), 'task'); },
    wrong: () => { sfx('soft'); return say(`try_${randInt(0, 2)}`, 'Спробуй ще раз', 'task'); },
    hint: speech.hintLine,
    good: () => sfx('pop'),
  });

  const g: Game = {
    scene, camera: o.camera, renderer: o.renderer, save, touch: o.touch, debug: o.debug, speech,
    hero, cat, sparks, flies, cam, ground, ws, rng: o.rng,
    busy: false, paused: false, auto: null, camOverride: null, finale: 0, failNext: false,
    groundY,
    started: () => el.start.classList.contains('hidden'),
    persist, refreshHud, addStars, above,
    fault: () => { if (g.failNext) { g.failNext = false; throw new Error('broken on purpose by __game.failNext()'); } },
    praise, task, hooksFor,
  };
  return g;
}

/**
 * Every scene that takes the controls goes through playScene (game/stage.ts): they come back whatever happens inside.
 * `afterRelease` is the world's part of the end of a scene (the bubble of the star search).
 */
export function createStage(g: Game, afterRelease: () => void): Stage {
  return {
    busy: () => g.busy,
    take: () => { g.busy = true; g.auto = null; setAct(null); },
    release: () => {
      g.busy = false; g.cam.focus = null; g.finale = 0;
      g.hero.play('Idle');
      afterRelease();
    },
  };
}
