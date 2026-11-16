import type * as THREE from 'three';
import type { Rig } from '../core/assets';
import type { Save } from '../core/save';
import type { Key, SpokenKey, WorldStrings } from '../ui/strings';
import type { Actor } from './actor';
import type { Game } from './context';
import type { DebugExtras } from './debug';
import type { Gear } from './gear';
import type { Look } from './hero';
import type { WorldFrame } from './loop';
import type { TaskType } from './tasks/types';
import type { Skill, TaskResult } from './taskviews/panel';

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
}

/** The heroine's model: the start screen changes her look on it. */
export type HeroRig = Rig & { setLook(l: Look): void };

/** What the renderer needs of a world's sky: the sun follows the heroine (and the quality tier sets its shadows). */
export interface WorldSky { sun: THREE.DirectionalLight; sunOffset: THREE.Vector3 }

export interface MusicParams { scale: readonly number[]; chords: readonly (readonly number[])[] }

/** A step of a character's chain: a panel task, or the id of one of the world's own tasks. */
export type Step = TaskType | (string & {});

// Field names stay: tools/shot.mjs reads def.id / def.x / def.z of __game.npcs.
export interface CharacterDef {
  id: string; emoji: string; x: number; z: number; heading: number;
  steps: readonly Step[]; shard: string; hi?: SpokenKey;
}

export interface Npc { def: CharacterDef; actor: Actor; pos: THREE.Vector3; mark: THREE.Mesh; idle: string; timer: number }

/** The lines of the shared conversation that belong to a world. */
export interface WorldLines { intro?: SpokenKey; partGiven: SpokenKey; allParts: SpokenKey; partTitle: Key; partText: Key }

/**
 * A task played out in the world rather than on the panel; a chain names it by its key in the world's tasks
 * (src/game/dialogue.ts plays the chains). `skill` sets its level, and a foreground task records its result there.
 */
export interface WorldTask {
  skill: Skill;
  /** Foreground (like the butterflies): the conversation waits for it. */
  run?(n: Npc, level: number): Promise<TaskResult>;
  /** Background (like the star search): the conversation ends, `done` moves the chain on (and gives its stars). */
  start?(n: Npc, done: () => void): void;
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
 * A world once built: its parts of the frame, what window.__game reads of it, the book, its lines, the HUD counter and
 * the heroine's items (src/game/gear.ts: the shop screen puts on what the save holds and what she tries on).
 */
export interface BuiltWorld { frame: WorldFrame; debug: DebugExtras; book: BookInfo; lines: WorldLines; hud(): string; gear: Gear }

export interface WorldDef<L = unknown, S extends WorldSky = WorldSky> {
  readonly id: string;
  readonly spawn: { x: number; z: number };
  readonly ground: WorldGround;
  readonly characters: readonly CharacterDef[];
  readonly strings: WorldStrings;
  readonly music?: MusicParams;
  /** Before the quality tier is made: it needs the sun. */
  sky(scene: THREE.Scene): S;
  /** The heroine and the cat load here, with the world. Null = failed for good, the notice is already shown. */
  load(scene: THREE.Scene, save: Save, touch: boolean): Promise<(L & { heroRig: HeroRig; catRig: Rig }) | null>;
  build(g: Game, loads: L, sky: S): BuiltWorld;
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
