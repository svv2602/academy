import * as THREE from 'three';
import { tint } from '../core/assets';
import { beginTask, endTask, say, sfx } from '../core/audio';
import { tuning } from '../core/tuning';
import { storeSave, worldState, type Save, type WorldState } from '../core/save';
import type { Rng } from '../core/rng';
import { pick, randInt } from '../core/util';
import { PRAISE, TRY, tapKey, voiceText } from '../ui/strings';
import { Actor } from './actor';
import type { HeroModel, Shared } from './boot';
import { Sparks } from './fx';
import { taskHelpers } from './helpers';
import type { PetGearModels } from './petgear';
import type { Stage } from './stage';
import type { Speech } from './speech';
import type { TaskHooks, TaskResult } from './taskviews/panel';
import { Butterflies } from './butterflies';
import { createPets, type PetsInWorld } from './pets';
import { createPlanner, type Planner } from './planner';
import { createMystery, type MysteryInWorld } from './mystery-stars';
import type { CharacterDef, WorldDef, WorldGround } from './world';
import { el, setAct, setCounter, setCounterIcon } from '../ui/ui';

/** A walk the heroine makes by herself (a tap on the ground or on a spot); `then` runs when she gets there. */
export interface Auto { x: number; z: number; then?: () => void; stuck: number; last: number }
export interface Cam { yaw: number; pitch: number; dist: number; target: THREE.Vector3; focus: THREE.Vector3 | null }

/**
 * The world's part of the game (TECH-15): what `g` holds of the world being played. Everything else of `Game` is made
 * once, of the shared load (src/game/boot.ts), and belongs to no world; `worldPart` below is the one place this part
 * comes from. A change of world (`Game.enter`, src/game/travel.ts) swaps the whole part at once: read it through `g`
 * every time, a copy taken once stays with the world that was left. Only `groundY` may be kept: it is one function
 * for the whole session and reads the ground of the world played.
 */
export interface GameWorld {
  /** The id of the world being played (the key of its progress in the save). */
  readonly worldId: string;
  /**
   * Which entry into a world this is, counted from 0: it changes the moment a world is left (`Game.leave`). What a
   * world made (its stage, its task) keeps the number it was made with and stays out of the way once it differs.
   */
  readonly visit: number;
  /** The ground of the world being played (its relief and colliders): the shared code never reaches a world directly. */
  readonly ground: WorldGround;
  /**
   * The world's part of the save (ARCH-07): `save.worlds[<id of the world played>]`, the same object at every entry into it.
   * Readers and writers of a world's progress (quests, final, chest, stars taken, position) go through it; the shared
   * part (look, stars, skills, settings) stays on `save`.
   */
  readonly ws: WorldState;
  /**
   * The description of the world being played (its id, pet, characters, secrets...): the achievements and the pets read
   * it through `g` every time, never keep it - it is the world's part, like `ws` and `ground`.
   */
  readonly world: WorldEntry;
  groundY(x: number, z: number): number;
}

/**
 * The state the parts of the game share (ARCH-05): made once after the models are loaded and handed to every part.
 * The flags are plain fields, read through `g` every time: a scene started in a frame (playScene -> take) sets
 * `busy` at once, and the rest of that frame has to see it.
 */
export interface Game extends GameWorld {
  readonly scene: THREE.Scene; readonly camera: THREE.PerspectiveCamera; readonly renderer: THREE.WebGLRenderer;
  readonly save: Save; readonly touch: boolean; readonly debug: boolean; readonly speech: Speech;
  readonly hero: Actor; readonly cat: Actor; readonly sparks: Sparks; readonly flies: Butterflies; readonly cam: Cam;
  /** The heroine's model with her items (the shared load): a world makes her gear and her wings of it. */
  readonly heroRig: HeroModel;
  /** The things of the cat and the fawn, hung hidden under their bones (src/game/petgear.ts); empty in a test without them. */
  readonly petGear: PetGearModels;
  /**
   * The pets in the world played (PLAY-09, src/game/pets.ts): the world's own waiting at its place, the chosen one after
   * the heroine. Its spots join the world's and it moves in the frame (src/game/loop.ts); `dispose` on leaving the world.
   */
  readonly pets: PetsInWorld;
  /**
   * The randomness of the tasks (ARCH-08): which task, its numbers and pictures, where the stars and butterflies are.
   * Seeded by `?seed=`, else Math.random. Praise, "try again" and the scenery do not draw from it.
   */
  readonly rng: Rng;
  /** A conversation, task or cut-scene is running: the heroine stands still. */
  busy: boolean;
  /** A menu is open. */
  paused: boolean;
  /** Debug (the walkthrough's pictures): frames are drawn with no game time - nothing moves, nothing ends. */
  still: boolean;
  auto: Auto | null;
  camOverride: number | null;
  /**
   * The frame of a task played in the world (src/game/worldtasks/core.ts `taskFrame`): the camera looks at `target` from
   * `yaw`, `pitch` and `dist`, gliding there by the game's clock and back once it is null. `catAt`: where the cat sits
   * meanwhile (beside the heroine, off the task).
   */
  camTask: { target: THREE.Vector3; yaw: number; pitch: number; dist: number; catAt: THREE.Vector3 } | null;
  /** >0 while the shards merge into the crystal. */
  finale: number;
  /** Test hook (__game.failNext): the next scene breaks once. */
  failNext: boolean;
  started(): boolean;
  persist(): void;
  refreshHud(): void;
  // A property, not a method: no-penalties.test.ts reads the name followed by a bracket as a call with an amount.
  addStars: (n: number, at: THREE.Vector3) => void;
  above(p: THREE.Vector3, dy: number): THREE.Vector3;
  fault(): void;
  praise(): Promise<void>;
  /**
   * A task from its opening to its end, whichever way it ends: meanwhile only its own lines sound, and its end stops them.
   * It is of the entry into the world it was read in: asked by a scene of a world that was left, it opens nothing and
   * answers "closed".
   */
  task(open: () => Promise<TaskResult>): Promise<TaskResult>;
  hooksFor(speaker: string): TaskHooks;
  /**
   * The planner of the panel tasks (src/game/planner.ts), one for the session: the conversations of every world and the
   * mysterious stars draw from it, so the examples with mistakes come back wherever the next task is asked.
   */
  readonly plan: Planner;
  /** The mysterious stars of the world played (src/game/mystery-stars.ts), made anew on every entry like the pets. */
  readonly mystery: MysteryInWorld;
  /**
   * TECH-15: the world played is left (src/game/travel.ts, under the closed frame, before its scope is disposed). From
   * here to the next `enter` no task opens, and what the left world still runs no longer touches the controls.
   */
  leave(): void;
  /**
   * TECH-15: `w` is the world played from now on (after its load, before its build). Everything `worldPart` makes of
   * it replaces the world's part of `g`; the heroine stands where she was left in that world, else at its spawn.
   */
  enter(w: WorldEntry, from?: string | null): void;
  /**
   * How a shared part of the game learns of a change of world: `fn('leave')` while the world left is still whole and
   * `g` still holds its part, `fn('enter')` once `g` holds the part of the new one (before that world is built).
   */
  onWorld(fn: (now: 'leave' | 'enter') => void): void;
}

/**
 * What the game is told of the world to play (WorldDef): its id (the key of its progress in the save), what the heroine
 * walks on, where she stands on a first launch, and `crystals`, the text of the crystal counter - the world knows how
 * many parts there are.
 */
export interface WorldEntry {
  id: string; ground: WorldGround; spawn: { x: number; z: number }; crystals: () => string;
  /** The icon of that counter (BuiltWorld.hudIcon); absent - the shard, 💎. */
  crystalsIcon?: () => string;
  /** The world's pet (WorldDef.pet); absent: the world has none. */
  pet?: WorldDef['pet'];
  /** The world's characters: a pet that comes after a chain waits until it is finished; absent: such a pet never comes. */
  characters?: readonly CharacterDef[];
  /** The world's secrets, chest and ground stars (WorldDef): what its achievements count (src/ui/achieve.ts). */
  secrets?: WorldDef['secrets']; chest?: WorldDef['chest']; groundStars?: WorldDef['groundStars'];
  /** How the heroine moves there (WorldDef.move): src/game/player.ts reads it; absent - she walks. */
  move?: WorldDef['move'];
  /** The steps it plays as tasks in the world (WorldDef.worldTasks): its description names them (src/game/describe.ts). */
  worldTasks?: WorldDef['worldTasks'];
  /** Where she appears coming from another world (WorldDef.arrive); absent - where she was left, else the spawn. */
  arrive?: WorldDef['arrive'];
  /** Its own word for where she stopped (WorldDef.left); absent - the shared ones (src/ui/welcome.ts). */
  left?: WorldDef['left'];
  /** The places of its mysterious stars (WorldDef.mystery); absent: none. */
  mystery?: WorldDef['mystery'];
}

/** The heading of the heroine as a world opens, when it names none: facing -z, the camera behind her (yaw 0). */
export const ENTRY_HEADING = Math.PI;

/**
 * The world's part of the game, made of the world to play: its progress in the save, its ground, where the heroine
 * stands when it opens and the text of its counter. She stands where the world says she arrives from the world `from`
 * (`arrive`, only when she comes by travel), else where she was left, else at the world's spawn.
 */
export function worldPart(save: Save, w: WorldEntry, from: string | null = null): Omit<GameWorld, 'groundY' | 'visit'> & { start: { x: number; z: number; facing: number }; crystals: () => string } {
  const ws = worldState(save, w.id);
  const came = from !== null ? w.arrive?.(from) ?? null : null;
  const start = came
    ? { x: came.x, z: came.z, facing: came.facing ?? ENTRY_HEADING }
    : { x: ws.pos?.[0] ?? w.spawn.x, z: ws.pos?.[1] ?? w.spawn.z, facing: ENTRY_HEADING };
  return { worldId: w.id, ws, ground: w.ground, world: w, start, crystals: w.crystals };
}

/** `shared` is the shared load (the heroine's model and the cat's, src/game/boot.ts), `world` the world to play. */
export function createGame(o: {
  scene: THREE.Scene; camera: THREE.PerspectiveCamera; renderer: THREE.WebGLRenderer; save: Save; touch: boolean;
  debug: boolean; speech: Speech; rng: Rng; shared: Shared; world: WorldEntry;
}): Game {
  const { scene, save, speech } = o;
  // TECH-15: the world's part, swapped whole by `enter` - nothing below keeps a field of it. `groundY` is the one
  // function of the session (the camera, the cat, the guide and the butterflies keep it): it reads the ground played.
  let part = worldPart(save, o.world);
  let visit = 0, between = false;
  const watchers: ((now: 'leave' | 'enter') => void)[] = [];
  const groundY = (x: number, z: number) => part.ground.height(x, z);
  const { start } = part;
  const sparks = new Sparks(scene);
  const flies = new Butterflies(scene, 96, groundY);

  // ----- hero -----
  const hero = new Actor(o.shared.heroRig);
  hero.root.position.set(start.x, 0, start.z);
  hero.heading = Math.PI; hero.root.rotation.y = Math.PI;
  scene.add(hero.root);
  hero.play('Idle');

  // ----- cat companion -----
  const cat = new Actor(o.shared.catRig);
  cat.root.position.set(hero.root.position.x + 1, 0, hero.root.position.z + 0.6);
  scene.add(cat.root);
  cat.play('Idle');
  tint(cat.model, { Cat_Main: '#f7a94b', Cat_Secondary: '#d27a2c', Ears: '#f9a8bd', Eye_White: '#ffffff' });

  const cam: Cam = { yaw: 0, pitch: 0.36, dist: tuning.camDist, target: new THREE.Vector3(), focus: null };
  cam.target.copy(hero.root.position);

  const persist = () => { part.ws.pos = [hero.root.position.x, hero.root.position.z]; storeSave(save); };
  // A task of the entry `mine`. Once its world is left it opens nothing, and one that was open at that moment does
  // not end the silence the change of world keeps (src/game/travel.ts).
  const live = (mine: number) => !between && mine === visit;
  const taskOf = (mine: number) => async (open: () => Promise<TaskResult>): Promise<TaskResult> => {
    if (!live(mine)) return { solved: false, wrong: 0 };
    beginTask(); try { return await open(); } finally { if (live(mine)) endTask(); }
  };
  const refreshHud = () => { setCounter('stars', String(save.stars)); setCounterIcon('crystals', part.world.crystalsIcon?.() ?? '💎'); setCounter('crystals', part.crystals()); };
  // The one writer of the stars (src/game/no-penalties.test.ts reads this line): it only ever adds.
  const addStars = (n: number, at: THREE.Vector3) => { save.stars += n; sparks.burst(at, '#ffe066', 24); sfx('chime'); refreshHud(); persist(); };
  const above = (p: THREE.Vector3, dy: number) => p.clone().setY(p.y + dy);
  async function praise() {
    sfx('good'); cat.once('Yes', 'Idle');
    sparks.burst(above(hero.root.position, 1.2), '#ff9ed2', 30, 4);
    speech.caption(null);
    const k = pick(PRAISE);
    await say(k, voiceText(k), 'story');
  }

  // ----- panel tasks -----
  // The helpers of a task (the owl, the abacus, src/game/helpers.ts): her stock, stored after each one taken.
  const helpers = taskHelpers(save, () => persist());
  const hooksFor = (speaker: string): TaskHooks => ({
    prompt: (key, ask) => { void (ask ? speech.ask(ask, key, 'task', speaker) : speech.line(key, 'task', 0, speaker)); },
    number: (n) => { const k = tapKey(n); if (k) void say(k, voiceText(k), 'task'); },
    wrong: () => { sfx('soft'); const k = TRY[randInt(0, TRY.length - 1)]; return say(k, voiceText(k), 'task'); },
    hint: speech.hintLine,
    good: () => sfx('pop'),
    helpers,
  });

  // The pets read the game live (`busy`, the heroine): they are made of it right after it.
  let pets: PetsInWorld | null = null;
  let mystery: MysteryInWorld | null = null;
  const g: Game = {
    scene, camera: o.camera, renderer: o.renderer, save, touch: o.touch, debug: o.debug, speech,
    hero, cat, sparks, flies, cam, heroRig: o.shared.heroRig, petGear: o.shared.petGear ?? {}, rng: o.rng,
    get pets() { return pets!; },
    get mystery() { return mystery!; },
    plan: createPlanner(save),
    busy: false, paused: false, still: false, auto: null, camOverride: null, camTask: null, finale: 0, failNext: false,
    // the world's part (GameWorld): everything `worldPart` made, the way `enter` swaps it
    ...part, groundY, get visit() { return visit; },
    started: () => el.start.classList.contains('hidden'),
    persist, refreshHud, addStars, above,
    fault: () => { if (g.failNext) { g.failNext = false; throw new Error('broken on purpose by __game.failNext()'); } },
    praise, task: taskOf(visit), hooksFor,
    leave: () => { for (const fn of watchers) fn('leave'); between = true; visit++; },
    enter: (w, from = null) => {
      part = worldPart(save, w, from);
      // All of it at once, not field by field: a field added to `worldPart` is swapped with no line here.
      Object.assign(g, part, { task: taskOf(visit) });
      between = false;
      const { x, z, facing } = part.start;
      hero.root.position.set(x, groundY(x, z), z); hero.heading = facing; hero.root.rotation.y = facing;
      cat.root.position.set(x + 1, groundY(x + 1, z + 0.6), z + 0.6);
      cam.yaw = facing - ENTRY_HEADING; cam.focus = null; cam.target.copy(hero.root.position);
      g.auto = null;
      // The pets of the world entered: its own pet at its place, the chosen one by the heroine (the ones of the world
      // left were taken out with it, src/game/travel.ts).
      pets?.dispose(); pets = petsOf();
      mystery?.dispose(); mystery = mysteryOf();
      for (const fn of watchers) fn('enter');
    },
    onWorld: (fn) => { watchers.push(fn); },
  };
  // The chain a pet waits for is read through `g` each time (the world played, its progress): nothing kept from now.
  // TECH-15: the pets are made anew for every world entered (`enter` above): the pet of a world is its own.
  const petsOf = (): PetsInWorld => createPets(g, {
    pet: g.world.pet, rigs: o.shared.petRigs,
    chainDone: (id) => { const c = g.world.characters?.find((x) => x.id === id); return !!c && (g.ws.quests[c.id] ?? 0) >= c.steps.length; },
  });
  pets = petsOf();
  // The mysterious stars of the world entered, with a stage of that entry (src/game/mystery-stars.ts).
  const mysteryOf = (): MysteryInWorld => createMystery(g, o.shared.starGeo, () => createStage(g, () => {}));
  mystery = mysteryOf();
  return g;
}

/**
 * Every scene that takes the controls goes through playScene (game/stage.ts): they come back whatever happens inside.
 * `afterRelease` is the world's part of the end of a scene (the bubble of the star search).
 */
export function createStage(g: Game, afterRelease: () => void): Stage {
  // TECH-15: a stage is of the entry into the world it was made in. Once that world is left, a scene of it that still
  // runs starts nothing new and does not give the controls back: whoever changes the world does (src/game/travel.ts).
  const mine = g.visit, left = () => g.visit !== mine;
  return {
    busy: () => g.busy || left(),
    take: () => { g.busy = true; g.auto = null; setAct(null); },
    release: () => {
      if (left()) return;
      g.busy = false; g.cam.focus = null; g.finale = 0;
      g.hero.play('Idle');
      afterRelease();
    },
  };
}
