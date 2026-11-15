import * as THREE from 'three';
import { dropped, inTask, voiceLog } from '../core/audio';
import { tuning } from '../core/tuning';
import { uTime } from '../core/materials';
import { cheatTask } from './taskviews/panel';
import type { Game } from './context';

/** What only the world has: its characters and tasks, and the right move for a task of its own on screen. */
export interface DebugExtras {
  npcs: unknown; search: unknown; bf: unknown;
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
    hero, cat, cam, save, flies, scene, camera, renderer, THREE, npcs: extras.npcs, search: extras.search, bf: extras.bf, voice: voiceLog, dropped, tuning,
    get busy() { return g.busy; },
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
    talk(id: string) { extras.talk(id); },
    /** Does the right thing for whatever task is on screen; returns what it did. */
    cheat() {
      const done = extras.cheatWorld();
      if (done) return done;
      return cheatTask() ? 'panel' : '';
    },
  };
}
