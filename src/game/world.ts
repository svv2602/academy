import type * as THREE from 'three';
import type { Save, WorldState } from '../core/save';
import type { Key, SpokenKey, WorldStrings } from '../ui/strings';
import type { Actor } from './actor';
import type { Game } from './context';
import type { DebugExtras } from './debug';
import type { Gate } from './gate';
import type { Gear } from './gear';
import type { WorldFrame } from './loop';
import type { MysteryDef } from './mystery';
import type { CollectDef } from './collections';
import type { DailyDef } from './daily-find';
import type { WorldScope } from './scope';
import type { TaskType } from './tasks/types';
import type { SkillId } from './skills';
import type { TaskResult } from './taskviews/panel';

/**
 * The common shape of a world (ARCH-06). A world is one object in src/worlds/<id>/ listed in src/worlds/index.ts;
 * the shared code (src/game, src/core, src/ui) knows only this interface, never a world's names, places or counts.
 */

/** The ground of a world: its relief, what keeps a walker in, and where a tap on the screen meets it. */
export interface WorldGround {
  height(x: number, z: number): number;
  resolve(p: { x: number; z: number }, radius: number): void;
  raycast(origin: THREE.Vector3, dir: THREE.Vector3, out: THREE.Vector3): boolean;
  /** A round obstacle. Pushed in call order: the order decides where resolve() puts the ground stars. */
  block(x: number, z: number, r: number): void;
  /**
   * A support she can jump up onto and stand on (a stump, a flat stone; PLAY-25 `hop`): the height of its top at
   * (x, z) when her feet at `feet` are not far below it (else she walks into its side, `resolve` keeps her out), null
   * where there is none. Absent: the world has none, she stands on its relief.
   */
  support?(x: number, z: number, feet: number): number | null;
}

/** What the renderer needs of a world's sky: the sun follows the heroine (and the quality tier sets its shadows). */
export interface WorldSky { sun: THREE.DirectionalLight; sunOffset: THREE.Vector3 }

export interface MusicParams { scale: readonly number[]; chords: readonly (readonly number[])[] }

/** A step of a character's chain: a panel task, or the id of one of the world's own tasks. */
export type Step = TaskType | (string & {});

// Field names stay: tools/shot.mjs reads def.id / def.x / def.z of __game.npcs.
export interface CharacterDef {
  id: string; emoji: string; x: number; z: number; heading: number;
  steps: readonly Step[]; shard: string; hi?: SpokenKey;
  /**
   * Its own lines, in its voice (VOICE-10; the next worlds, unset in the first): `asks` - before each step of the chain,
   * by the step's index (none or null: no line); `thanks` - with its part, in place of the world's `partGiven`;
   * `again` - one of them in turn when it is met after its chain, in place of `npc_again`.
   */
  asks?: readonly (SpokenKey | null)[]; thanks?: SpokenKey; again?: readonly SpokenKey[];
}

export interface Npc { def: CharacterDef; actor: Actor; pos: THREE.Vector3; mark: THREE.Mesh; idle: string; timer: number }

/** The lines of the shared conversation that belong to a world. */
export interface WorldLines { intro?: SpokenKey; partGiven: SpokenKey; allParts: SpokenKey; partTitle: Key; partText: Key }

/**
 * A task played out in the world rather than on the panel; a chain names it by its key in the world's tasks
 * (src/game/dialogue.ts plays the chains). `skill` sets its level, and a foreground task records its result there.
 */
export interface WorldTask {
  skill: SkillId;
  /** Foreground (like the butterflies): the conversation waits for it. */
  run?(n: Npc, level: number): Promise<TaskResult>;
  /** Whether `run` plays the step on this level (a task in the world, PLAY-01); false - the card plays it. Unset: always. */
  inWorld?(level: number): boolean;
  /**
   * Background (like the star search): the conversation ends, `done` moves the chain on (and gives its stars). A task
   * that ends in a task played in the world (the shell lock: swim to the gate, then the lock) hands `done` its result,
   * and the step records it in `skill`; `done()` alone records nothing.
   */
  start?(n: Npc, done: (played?: TaskResult) => void): void;
  /**
   * A background task that ends in a task played in the world, opened by the world where she goes (the shell lock: she
   * swims to the gate, the lock opens there) and handing its result to `done`: its step may be named in
   * WorldDef.worldTasks as a `run` one is (src/game/worldtasks/play.ts worldTaskProblems).
   */
  endsInWorld?: true;
  /** A background task is running. */
  active?(): boolean;
  /** The id of the character whose chain started the running task, else null. */
  owner?(): string | null;
  /** A talk to that character while the task runs: its question again, under the task's bubble. */
  reask?(n: Npc): Promise<void>;
}

/** What the book shows of a world. */
export interface BookInfo {
  parts(): readonly { color: string; icon: string; got: boolean }[];
  stats(): readonly { icon: string; label: Key; value: string }[];
}

/** A world's texts (ARCH-12): declared with the shared strings, in src/ui/strings.ts. */
export type { WorldStrings } from '../ui/strings';

/**
 * A point of the world template (docs/13-worlds.md) as the generic walkthrough sees it (ARCH-16). The description of a
 * world is the list of them (src/game/describe.ts): the chains and the pet are made there of what the world declares
 * (`characters`, `pet`), the rest the built world hands in itself (`BuiltWorld.items`: its secrets, the parts of the
 * artifact that lie in it, its cutscenes, its tour, its finale). An item describes what is in the game anyway: a world
 * does nothing "for the walkthrough". A world that hands in no `items` has no description: a scenario of its own plays it.
 */
export type WorldItemKind = 'chain' | 'secret' | 'part' | 'scene' | 'flyover' | 'pet' | 'finale';

export interface WorldItem {
  kind: WorldItemKind;
  /**
   * Unique within the world, and the name of the item's done mark in the world's part of the save: ws.flags[id]. For a
   * chain it is the id of its character (the mark is ws.quests[id]); the finale's mark is ws.final. One item - one mark;
   * the name does not change once published.
   */
  id: string;
  /**
   * Where the heroine has to stand for it: a point, not an object. With `how: 'act'` the world has an action spot whose
   * radius covers it. Absent: the item starts by itself (a cutscene, the tour, the finale).
   */
  at?: { x: number; z: number };
  /** What moves it on: the action button near `at`, walking into `at`, a tap on the screen, or nothing (it plays by itself). */
  how: 'act' | 'walk' | 'tap' | 'auto';
  /**
   * Ids of the items that have to be done before this one (a part that lies in a secret; the finale after everything):
   * until then the game does not let it be done. The order is set here alone: what `after` does not name is done in the
   * order of the list.
   */
  after?: readonly string[];
  /** Done. Read from the save (the world's quests and flags), never from a variable: it is still true after a reload. */
  done(): boolean;
  /** On screen or running right now (a cutscene, the tour, the finale): the walkthrough waits for its end by this, not by the clock. */
  active?(): boolean;
  /**
   * A chain only: the numbers of its steps (from 0) played as a task in the world (WorldDef.worldTasks), not on the
   * panel. The walkthrough plays each of them through the debug door of the task (src/game/worldtasks/core.ts), and a
   * task in the world on a step not named here is a failure. Absent: no step of the chain is played in the world.
   */
  inWorld?: readonly number[];
  /**
   * A chain only: those of `inWorld` whose task is written to no skill (WorldDef.noSkill - the gingerbread house of
   * world 4, WORLD-21): solved, the walkthrough expects every skill of the save as it was, not one task more in one.
   * Absent: every step of `inWorld` records its task in its skill.
   */
  noSkill?: readonly number[];
}

/**
 * A world once built: its parts of the frame, what window.__game reads of it, the book, its lines, the HUD counter and
 * the heroine's items (src/game/gear.ts: the shop screen puts on what the save holds and what she tries on).
 */
export interface BuiltWorld {
  frame: WorldFrame; debug: DebugExtras; book: BookInfo; lines: WorldLines; hud(): string; gear: Gear; items?(): readonly WorldItem[];
  /** The icon of the counter `hud` fills; absent - the shard, 💎 (the hub counts the artifacts back, its own icon). */
  hudIcon?: string;
  /**
   * The finds of the world not found yet, where they are (the chest, a secret's entrance): they twinkle while she
   * glows (the glow potion, src/game/supplyfx.ts). Asked twice a second while it acts: no new objects each time.
   */
  glimmer?(): readonly THREE.Vector3[];
  /** She is in a cramped place (a room): a giant keeps her own size there (the funny potion). Absent - nowhere. */
  cramped?(): boolean;
}

/** A place to appear at: `facing` is the heading (absent - the heading of every entry, facing -z). */
export interface Arrival { x: number; z: number; facing?: number }

export interface WorldDef<L = unknown, S extends WorldSky = WorldSky> {
  readonly id: string;
  readonly spawn: { x: number; z: number };
  /**
   * Where the heroine appears when she comes by `travel` from the world `from` (the hub: at the portal of that world;
   * a world: at its way to the hub), and where she faces (the heading, as `Actor.heading`; the camera stands behind
   * her). Null or absent: where she was left in this world, else `spawn` - as on a launch, which has no `from`.
   */
  arrive?(from: string): Arrival | null;
  /**
   * The world's own word for where she stopped, when it knows better than the shared ones (src/ui/welcome.ts
   * `leftKey`): the cat says it on a tap (`why` 'tap') and as she comes into the world again - after the meeting of
   * a game played before or a change of world (`why` 'entry'). Null or absent: the shared one on a tap, none on entry.
   */
  left?(ws: WorldState, save: Save, why: 'tap' | 'entry'): SpokenKey | null;
  readonly ground: WorldGround;
  readonly characters: readonly CharacterDef[];
  /**
   * The place of the world's artifact on the shelf of the book (0-4, src/ui/book.ts): a world with one brings an
   * artifact back with its final (src/game/artifacts.ts); absent - the world has none (the hub). The probe world has
   * the forest's place: it stands for the second world in the probe build.
   */
  readonly shelf?: number;
  /** PLAY-09: the world's pet. Its done mark is ws.flags.pet (the item `pet` of the world description); `species` is an id of src/game/pets.ts. */
  readonly pet?: {
    readonly species: string; readonly at: { readonly x: number; readonly z: number };
    /** The id of the character whose chain has to be finished before the pet shows itself; absent: it is there at once. */
    readonly after?: string;
  };
  /**
   * PLAY-07, PLAY-08: the names of ws.flags that are this world's secrets; the ids of the items of kind `secret` (items(),
   * ARCH-16) must be exactly these.
   */
  readonly secrets?: readonly string[];
  /**
   * PLAY-01, ARCH-16: the ids of the steps of the chains that are played as a task in the world (the world's `tasks`
   * with `run`, or with `start` and `endsInWorld`), so that the description can say so (WorldItem.inWorld) and the walkthrough can find them. Each must be
   * a step of some character; absent - the world declares none (its chains are played by the panel, or by a scenario
   * of its own).
   */
  readonly worldTasks?: readonly string[];
  /**
   * Those of `worldTasks` that are written to no skill (the customer's decisions: the gingerbread house of world 4,
   * WORLD-21, docs/worlds/world-4.md question 3): the level of a skill is only read for them, and the step is done with
   * no result (src/game/dialogue.ts `stepDone`). The description names their steps (WorldItem.noSkill), so the
   * walkthrough knows not to look for one task more in a skill. Absent - every task in the world is recorded.
   */
  readonly noSkill?: readonly string[];
  /**
   * The places the mysterious stars of a day may stand at (src/game/mystery.ts): out of sight, where she has to walk;
   * at least MYSTERY_MIN_SPOTS of them, MYSTERY_COUNT a day. Absent - the world has none.
   */
  readonly mystery?: MysteryDef;
  /** PLAY-25: the finds of its collections (src/game/collections.ts), SET_SIZE of each kind. Absent - none. */
  readonly collect?: CollectDef;
  /** PLAY-26: the places of its find of the day (src/game/daily-find.ts); absent - none. */
  readonly daily?: DailyDef;
  /** PLAY-08 (`secret_chest`): the flag of the world's chest, one of `secrets`. */
  readonly chest?: string;
  /** PLAY-08 (`all_world_stars`): how many stars lie on the world's ground (ids 0 to n - 1 in ws.starsTaken); a search's are not. */
  readonly groundStars?: number;
  readonly strings: WorldStrings;
  readonly music?: MusicParams;
  /**
   * How the heroine moves in the world; absent - she walks (gravity, the jump). `swim`: she swims `height` m above the
   * ground - no gravity, no jump, the swimming clips Swim and Float for walking and standing (src/game/player.ts). The
   * world brings those clips in a file of its own and lends them to her (src/game/hero.ts `worldClips`, Actor.lend).
   */
  readonly move?: { readonly kind: 'swim'; readonly height: number };
  /**
   * A test world (the probe world, TECH-15): never in the published game. It may declare the pet of another world -
   * the catalog of pets (src/game/pets.ts PETS) holds the species of the real worlds only, and a test world must have
   * a pet all the same (the template of a world asks for one).
   */
  readonly test?: boolean;
  /**
   * Before the quality tier is made: it needs the sun. `scope` (TECH-15, src/game/scope.ts), here and below, is the
   * owner of what the world adds to the scene and subscribes to: the world's handlers and timers go through it.
   */
  sky(scene: THREE.Scene, scope: WorldScope): S;
  /**
   * The world's own models, pictures and scenery: the heroine and the cat are not a world's, the shared load brings them
   * once (src/game/boot.ts) and the built world reads her model from the game (`g.heroRig`). It runs next to the shared
   * load. Null = failed for good: the failure went to `loadFailed` (src/game/boot.ts), the notice is shown.
   */
  load(scene: THREE.Scene, save: Save, touch: boolean, scope: WorldScope): Promise<L | null>;
  build(g: Game, loads: L, sky: S, scope: WorldScope): BuiltWorld;
}

/**
 * The world to play: `?world=<id>` is read only with debug on; otherwise, and for an id no world has, the world the
 * registry names as the default (src/worlds/index.ts `DEFAULT_WORLD`), wherever it stands in the list. The published
 * game never has debug on, so it always plays the default world. A default no world has is an error.
 */
export function pickWorld(worlds: readonly WorldDef[], byDefault: string, param: string | null, debug: boolean): WorldDef {
  const main = worlds.find((w) => w.id === byDefault);
  if (!main) throw new Error(`the default world "${byDefault}" is not in src/worlds/index.ts`);
  const asked = debug && param !== null ? worlds.find((w) => w.id === param) : undefined;
  return asked ?? main;
}

/** What the launch into the world where she stopped needs: the gate of worlds and the download of a world. */
export interface LaunchEnv {
  /** The gate of worlds (src/game/gate.ts): the same one every change of world asks. */
  gate: Pick<Gate, 'canEnter'>;
  /** Downloads the world in full into the cache of worlds; true when it is ready. Never rejects. */
  download(id: string): Promise<boolean>;
}

/** The world to launch, and whether the world where she stopped was refused (the cat says so once she plays). */
export interface Launch { world: WorldDef; refused: boolean }

/**
 * The world to launch (WORLD-01, TECH-09, R17, R27): `?world=` with debug as in `pickWorld`; otherwise the world where
 * she stopped (`lastWorld` of the save) - through the same gate as every change of world: in the cache, it opens; to
 * be had from the network, it is downloaded first (under the loading bar); refused or not had after all, the default
 * world opens and `refused` is true. No `lastWorld`, the default world, or a world this build does not have: the
 * default world, and the gate is not asked.
 */
export async function launchWorld(worlds: readonly WorldDef[], byDefault: string, param: string | null, debug: boolean, last: string | undefined, env: LaunchEnv): Promise<Launch> {
  const picked = pickWorld(worlds, byDefault, param, debug);
  if (debug && param !== null && worlds.some((w) => w.id === param)) return { world: picked, refused: false };
  const want = last === undefined ? undefined : worlds.find((w) => w.id === last);
  if (!want || want === picked) return { world: picked, refused: false };
  const answer = await env.gate.canEnter(want.id);
  if (!answer.enter) return { world: picked, refused: true };
  if (answer.from === 'network' && !(await env.download(want.id))) return { world: picked, refused: true };
  return { world: want, refused: false };
}
