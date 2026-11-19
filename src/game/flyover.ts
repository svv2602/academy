import * as THREE from 'three';
import { stopVoice } from '../core/audio';
import type { SpokenKey } from '../ui/strings';
import { el, setAct } from '../ui/ui';
import type { Game } from './context';

/**
 * The tour of a world (WORLD-11): on the first entry the camera flies along the world's own path while the cat says
 * one line; a tap anywhere ends it. A world hands its path and its "visited" mark in with `setTour`, the start of the
 * game (src/game/start.ts) plays it with `tour`, the camera (src/game/camera.ts) follows it with `flyoverOf`.
 * The time is the game's (a frame counts at most 0.05 s), never the wall clock.
 */

export type Vec3 = readonly [number, number, number];
/** A point of the path: where the camera stands and where it looks. */
export interface FlyPoint { pos: Vec3; look: Vec3 }
/** `line` null: the tour is silent (a world whose line is not recorded yet - the grey build of the hub, R34). */
export interface FlyoverPath { points: readonly FlyPoint[]; seconds: number; line: SpokenKey | null }

export const POINTS = { min: 5, max: 8 } as const;
export const SECONDS = { min: 10, max: 15 } as const;
/** Seconds the camera takes to come back to the heroine after the path. */
export const BACK_SECONDS = 1;

/** What is wrong with a path; empty when its number of points and its seconds are within POINTS and SECONDS. */
export function pathProblems(p: FlyoverPath): string[] {
  const out: string[] = [];
  if (p.points.length < POINTS.min || p.points.length > POINTS.max) out.push(`${p.points.length} points, not ${POINTS.min}-${POINTS.max}`);
  if (!(p.seconds >= SECONDS.min && p.seconds <= SECONDS.max)) out.push(`${p.seconds} s, not ${SECONDS.min}-${SECONDS.max}`);
  return out;
}

/** Speeding up from the first point and slowing down to the last (smoothstep), and its inverse. */
export const ease = (u: number) => u * u * (3 - 2 * u);
export const easeInv = (y: number) => 0.5 - Math.sin(Math.asin(1 - 2 * y) / 3);

export interface Flyover {
  readonly path: FlyoverPath;
  /** The camera is on the path. */
  readonly active: boolean;
  /** Seconds of game time since the start of the path. */
  readonly elapsed: number;
  /** The moment (seconds from the start) the camera passes each point. */
  readonly times: readonly number[];
  /** Flies the path; settles with how it ended. A path already flying settles at once with 'busy'. */
  start(): Promise<'end' | 'skip' | 'busy'>;
  /** Ends the path where the camera is (a tap). */
  skip(): void;
  /** Debug: hold the camera exactly on point `i` (null: fly on from there). */
  hold(i: number | null): void;
  /** One frame of game time. */
  update(dt: number): void;
  /** How much of the camera is the path's: 1 on it, then down to 0 in BACK_SECONDS. */
  weight(): number;
  /** Where the camera of the path stands and looks now. */
  pose(pos: THREE.Vector3, look: THREE.Vector3): void;
}

export function createFlyover(path: FlyoverPath): Flyover {
  const v = (p: Vec3) => new THREE.Vector3(p[0], p[1], p[2]);
  const along = new THREE.CatmullRomCurve3(path.points.map((p) => v(p.pos)), false, 'centripetal');
  const looks = new THREE.CatmullRomCurve3(path.points.map((p) => v(p.look)), false, 'centripetal');
  const n = path.points.length;
  const times = path.points.map((_, i) => path.seconds * easeInv(i / (n - 1)));
  let active = false, elapsed = 0, back = 0, held: number | null = null;
  let done: ((how: 'end' | 'skip') => void) | null = null;
  const finish = (how: 'end' | 'skip') => {
    if (!active) return;
    active = false; held = null; back = BACK_SECONDS;
    const d = done; done = null; d?.(how);
  };
  return {
    path, times,
    get active() { return active; },
    get elapsed() { return elapsed; },
    start() {
      if (active) return Promise.resolve('busy');
      active = true; elapsed = 0; back = 0; held = null;
      return new Promise((resolve) => { done = resolve; });
    },
    skip: () => finish('skip'),
    hold: (i) => {
      if (!active) return;
      held = i === null ? null : Math.max(0, Math.min(n - 1, Math.round(i)));
      if (held !== null) elapsed = times[held];
    },
    update: (dt) => {
      if (active) {
        if (held !== null) return;
        elapsed = Math.min(elapsed + dt, path.seconds);
        if (elapsed >= path.seconds) finish('end');
      } else back = Math.max(0, back - dt);
    },
    weight: () => (active ? 1 : ease(back / BACK_SECONDS)),
    pose: (pos, look) => {
      const u = ease(Math.min(1, elapsed / path.seconds));
      along.getPoint(u, pos); looks.getPoint(u, look);
    },
  };
}

/** What a world hands in: its path, whether it counts as visited, and the mark that it now is. */
export interface WorldTour { path: FlyoverPath; visited(): boolean; mark(): void }

const tours = new WeakMap<Game, { player: Flyover; visited(): boolean; mark(): void }>();

/** The world's tour (src/worlds/<id>/index.ts, while it is built); returns its player. */
export function setTour(g: Game, t: WorldTour): Flyover {
  const player = createFlyover(t.path);
  tours.set(g, { player, visited: t.visited, mark: t.mark });
  return player;
}

/** The player of the world's tour, or null for a world without one. */
export const flyoverOf = (g: Game): Flyover | null => tours.get(g)?.player ?? null;

/**
 * Plays the tour: only for a world not visited yet, and the world is marked visited as it starts (`record: false` -
 * the debug command - plays it anyway and marks nothing). Meanwhile the heroine stands (`g.busy`), the joystick and
 * the buttons are hidden, and a tap anywhere ends it; the cat's line is cut with it. True when it was played.
 */
export async function tour(g: Game, o: { record?: boolean } = {}): Promise<boolean> {
  const t = tours.get(g);
  const record = o.record ?? true;
  if (!t || t.player.active || g.busy) return false;
  // A world visited before the tour existed (an old save) gets its mark too: the world's description reads the flag.
  if (record && t.visited()) { t.mark(); return false; }
  if (record) t.mark();
  g.busy = true; g.auto = null; setAct(null);
  const hide = [el.joy, el.btnJump], was = hide.map((e) => e.classList.contains('hidden'));
  for (const e of hide) e.classList.add('hidden');
  // A capturing listener of the window: the tap reaches neither the canvas (no walk) nor a button.
  const skip = (e: Event) => { e.preventDefault(); e.stopPropagation(); t.player.skip(); };
  addEventListener('pointerdown', skip, { capture: true });
  const line = t.player.path.line;
  const said = line === null ? null : g.speech.line(line, 'story');
  try {
    const how = await t.player.start();
    if (how === 'skip') { if (said) { stopVoice(); g.speech.caption(null); } } else await said;
  } finally {
    removeEventListener('pointerdown', skip, { capture: true });
    hide.forEach((e, i) => e.classList.toggle('hidden', was[i]));
    g.busy = false;
  }
  return true;
}
