import * as THREE from 'three';
import { dropped, inTask, voiceLog } from '../core/audio';
import { shardsSettled } from './dialogue';
import { tuning } from '../core/tuning';
import { uTime } from '../core/materials';
import { cheatTask } from './taskviews/panel';
import { transition } from './transition';
import type { Game } from './context';

/** What only the world has: its characters and tasks, and the right move for a task of its own on screen. */
export interface DebugExtras {
  npcs: unknown;
  /**
   * The world's own objects and commands, laid into window.__game as they are, under their own names (the first
   * world: the state of its star search and of its butterflies, the debug show of "sort" in the world). The members
   * of __game below win over a name of the same.
   */
  more: Record<string, unknown>;
  talk(id: string): void;
  /** Does the right thing for a task of the world on screen; returns what it did, or '' when there is none. */
  cheatWorld(): string;
}

/**
 * Test/debug hook (ARCH-11): window.__game, only with ?debug or on the development server. The walkthrough
 * (tools/shot.mjs) reads and writes these very objects, so they are handed out as they are, never copied; the flags
 * are getters over `g`, read at the moment of the question.
 */
export function exposeDebug(g: Game, extras: DebugExtras) {
  const { hero, cat, cam, save, flies, scene, camera, renderer } = g;
  (window as unknown as Record<string, unknown>).__game = {
    ...extras.more,
    hero, cat, cam, save, flies, scene, camera, renderer, THREE, npcs: extras.npcs, voice: voiceLog, dropped, tuning,
    get busy() { return g.busy; },
    /** The shards whose "go on" was decided (src/game/dialogue.ts): said, or not, once their thanks ended. */
    get shardsSettled() { return shardsSettled.n; },
    /** The planner of spoken lines: is a task open for it, and the line a tap on the bubble or the cat would repeat. */
    get inTask() { return inTask(); },
    get line() { return g.speech.shown?.key ?? null; },
    get finale() { return g.finale; },
    /** Seconds of game time: a frame counts at most 0.05 s, so on a slow machine it runs behind the wall clock. */
    get time() { return uTime.value; },
    /** The next scene (a conversation or the finale) throws once, right after it has taken the controls. */
    failNext() { g.failNext = true; },
    teleport(x: number, z: number) { hero.root.position.set(x, g.groundY(x, z), z); },
    closeup(d: number | null) { g.camOverride = d; },
    /**
     * The transition between worlds (TECH-15), stopped at the point `p` of its closing (0 - open, 1 - closed, with the
     * loading ring at `progress`); null lets it go. `fade` is the transition itself: its state (`phase`, `active`,
     * `closed`, `frames`) and its commands (`start`, `setProgress`, `ready`).
     */
    transition(p: number | null, progress?: number) { transition.freeze(p, progress); },
    fade: transition,
    talk(id: string) { extras.talk(id); },
    /** Does the right thing for whatever task is on screen; returns what it did. */
    cheat() {
      const done = extras.cheatWorld();
      if (done) return done;
      return cheatTask() ? 'panel' : '';
    },
  };
}
