/**
 * The shared frame of the tasks played in the world (PLAY-01, docs/worlds/common.md). A kind of task (sorting on the
 * pedestals, the stones across the stream, later the twelve kinds of worlds 2-5) draws its things and judges its input;
 * the frame keeps what every kind does the same way:
 *
 * - the description is the panel's (`tasks/*.ts`), the show draws no random numbers;
 * - a mistake takes nothing away; what follows it is the course of every task (`taskviews/flow.ts`: the line, then the
 *   rung of the hint) - and whether a mistake makes a sound is decided here, once, for every kind (`MISTAKE_SOUND`);
 * - the task ends solved or closed and reports it (`done`); the world, not the task, marks what it gives;
 * - its timers are the world's (`WorldScope`): a world left in the middle of a task takes them away with it;
 * - one debug door for the walkthrough (`__game.worldTask`, ?debug only): solve, make a wrong move, close, and a state
 *   that says where the task stands without knowing its kind;
 * - the middle of a task can be kept (`progress` / `resume`, a list of numbers); the world's progress stores it.
 */
import type * as THREE from 'three';
import type { Spoken } from '../../core/audio';
import type { WorldScope } from '../scope';
import { afterMistake, type FlowTask, type ShownHint } from '../taskviews/flow';
import type { TaskHooks, TaskResult } from '../taskviews/panel';

/**
 * Does a wrong move say "try again"? One rule for every kind of task in the world (the panel says it too). A kind
 * whose card asks for a mistake without a sound changes it here, for all of them, with this line.
 */
export const MISTAKE_SOUND: 'try-again' | 'silent' = 'try-again';

/** Where a task stands, for the walkthrough: waiting for input, in the course of a mistake, or ended. */
export type WorldTaskPhase = 'input' | 'mistake' | 'solved' | 'closed';

export interface WorldTaskState {
  /** The kind of task (`sort`, `stones`, ...): for the log only - the walkthrough decides nothing by it. */
  readonly kind: string;
  readonly phase: WorldTaskPhase;
  /** Wrong moves so far. */
  readonly wrongs: number;
  /** The rung of the hint shown (the round of the mistake whose steps are on screen); 0 - none. */
  readonly rung: number;
  /** The middle of the task as the world would store it. */
  readonly progress: readonly number[];
}

/** What every kind of task in the world gives the frame and the world. */
export interface WorldTaskShow {
  readonly kind: string;
  /** Settles once the task is solved or closed. */
  readonly done: Promise<TaskResult>;
  /** Where the camera looks. */
  readonly center: THREE.Vector3;
  /** A tap while the task is open takes it, even one that hits nothing (true). */
  tap(screenDist: (p: THREE.Vector3) => number): boolean;
  /** Solves the task through the same handler a tap goes through. */
  solve(): void;
  /** Makes one wrong move through the same handler a tap goes through; false when no wrong move is possible now. */
  wrong(): boolean;
  /** The close button: the task ends unsolved and leaves nothing in the scene; the save is not changed. */
  close(): void;
  update(time: number): void;
  state(): WorldTaskState;
  /** The middle of the task as a list of numbers (empty for a kind that keeps nothing). */
  progress(): number[];
  /** Goes on from a middle `progress()` gave; a kind that keeps nothing ignores it. */
  resume(state: readonly number[]): void;
}

/** The part of the course of a task the frame keeps: open or not, the mistakes and their hint, the end. */
export interface TaskCore {
  readonly done: Promise<TaskResult>;
  readonly alive: boolean;
  readonly wrongs: number;
  readonly rung: number;
  readonly phase: WorldTaskPhase;
  /** A wrong move: counted, and the course of the mistake follows (the line by MISTAKE_SOUND, then the hint's rung). */
  mistake(): Promise<void>;
  /** The child does what the hint asks by herself (a count of her own): the hint of that round is not shown over her. */
  own(): void;
  /** No more input; the task ends solved after `ms` of the world's time (the last thing lands first), or at once. */
  solve(ms?: number): void;
  /** Ends it unsolved at once. */
  close(): void;
}

/**
 * The course of one task. `hint`: the show's hint (`flow.hintOf`), `hooks`: the cat; `end(solved)` clears the scene and
 * runs once - not at all when the world is left before it (its timer is the scope's).
 */
export function taskCore(scope: WorldScope, hooks: Pick<TaskHooks, 'wrong' | 'hint'>, hint: ShownHint | null, end: (solved: boolean) => void): TaskCore {
  let finish!: (r: TaskResult) => void;
  const done = new Promise<TaskResult>((res) => { finish = res; });
  let phase: WorldTaskPhase = 'input', rung = 0, ending = false, stopped = false;
  const shown: ShownHint | null = hint && { key: (r) => hint.key(r), show: (r) => { rung = r; hint.show(r); } };
  const task: FlowTask & { alive: boolean; wrongs: number; own: number } = { alive: true, wrongs: 0, own: -1, hint: shown };
  const voice = {
    wrong: (): Spoken => (MISTAKE_SOUND === 'try-again' ? hooks.wrong() : (Promise.resolve() as Spoken)),
    hint: (key: Parameters<typeof hooks.hint>[0]) => hooks.hint(key),
  };
  const stop = (solved: boolean) => {
    if (stopped) return;
    stopped = true; task.alive = false; phase = solved ? 'solved' : 'closed';
    end(solved);
    finish({ solved, wrong: task.wrongs });
  };
  return {
    done,
    get alive() { return task.alive && !ending; },
    get wrongs() { return task.wrongs; },
    get rung() { return rung; },
    get phase() { return phase; },
    mistake: async () => {
      if (!task.alive || ending) return;
      const round = ++task.wrongs;
      phase = 'mistake';
      await afterMistake(task, round, voice);
      if (task.alive && task.wrongs === round) phase = 'input';
    },
    own: () => { task.own = task.wrongs; },
    solve: (ms = 0) => {
      if (!task.alive || ending) return;
      ending = true; phase = 'solved';
      if (ms > 0) scope.timeout(() => stop(true), ms); else stop(true);
    },
    close: () => { if (task.alive && !ending) stop(false); },
  };
}

/** The task open in the world now, for the debug door (one at a time: a scene holds the heroine meanwhile). */
const open = new WeakMap<object, WorldTaskShow>();

/** The world opens a task (and clears it once it is over): the door of the walkthrough reaches it. */
export function setWorldTask(g: object, show: WorldTaskShow | null): void {
  if (show) open.set(g, show); else open.delete(g);
}

export const worldTaskOf = (g: object): WorldTaskShow | null => open.get(g) ?? null;

/** The debug door (`__game.worldTask`): what the walkthrough does to the task open now, whatever its kind. */
export function worldTaskDoor(g: object) {
  const cur = () => open.get(g) ?? null;
  return {
    /** Solves it; false when none is open. */
    solve: () => { const s = cur(); if (!s) return false; s.solve(); return true; },
    /** One wrong move; false when none is open or none is possible. */
    wrong: () => cur()?.wrong() ?? false,
    /** The close button; false when none is open. */
    close: () => { const s = cur(); if (!s) return false; s.close(); return true; },
    /** Where the open task stands; null - none is open. */
    get state(): WorldTaskState | null { return cur()?.state() ?? null; },
  };
}
