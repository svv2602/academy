import * as THREE from 'three';
import { clipFor, dropped, inTask, musicPlaying, speaking, voiceLog } from '../core/audio';
import { shardsSettled } from './dialogue';
import { tuning } from '../core/tuning';
import { CAT_TAP_Y } from './companion';
import { uTime } from '../core/materials';
import { cheatTask } from './taskviews/panel';
import { worldTaskDoor } from './worldtasks/core';
import { transition } from './transition';
import type { Game } from './context';
import { achState, queue } from '../ui/achieve';
import { breakHold } from '../ui/session';
import { giftState } from '../ui/welcome';
import { mysteryHold } from './mystery-stars';
import { over, played, stopPoint, type StopWhere } from './stops';
import { describeWorld, look, missing, problems, type Need } from './describe';
import type { WorldItem } from './world';

/** The key of the tab's storage that keeps the walkthrough's lever of the gift (`__game.gift`) over a reload. */
export const GIFT_HOLD = 'amw-gift-hold';
/** The same for the walkthrough's lever of the break (`__game.brk`). */
export const BREAK_HOLD = 'amw-break-hold';
/** The same for the walkthrough's lever of the mysterious stars (`__game.mystery`). */
export const MYSTERY_HOLD = 'amw-mystery-hold';

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

/** The change of world as window.__game shows it (src/game/travel.ts). */
export interface DebugTravel { readonly world: string; readonly active: boolean; go(id: string): Promise<boolean>; readonly built?: DebugBuilt | null }
/** What the world played built, as far as window.__game reads it (null between two worlds): its own items of the world description, if it hands any in. */
export interface DebugBuilt { items?(): readonly WorldItem[] }

/**
 * Test/debug hook (ARCH-11): window.__game, only with ?debug or on the development server. The walkthrough
 * (tools/shot.mjs) reads and writes these very objects, so they are handed out as they are, never copied; the flags
 * are getters over `g`, read at the moment of the question. Returns what a change of world calls with the debug part
 * of the new world: `npcs`, `talk`, `cheat` and the world's own names are then the new world's.
 */
export function exposeDebug(g: Game, extras: DebugExtras, travel: DebugTravel): (next: DebugExtras) => void {
  // The walkthrough's lever of the gift of the day, pulled in this tab before (window.__game.gift below).
  try { giftState.held = sessionStorage.getItem(GIFT_HOLD) === '1'; } catch { /* ignore */ }
  try { breakHold.held = sessionStorage.getItem(BREAK_HOLD) === '1'; } catch { /* ignore */ }
  try { mysteryHold.held = sessionStorage.getItem(MYSTERY_HOLD) === '1'; } catch { /* ignore */ }
  const { hero, cat, cam, save, flies, scene, camera, renderer } = g;
  let world = extras;
  // The description of the world played at the moment of the question (ARCH-16): null for a world that hands in no items.
  const described = (): WorldItem[] | null => { const built = travel.built; return built?.items ? describeWorld(g, built.items()) : null; };
  const game: Record<string, unknown> = {
    hero, cat, cam, save, flies, scene, camera, renderer, THREE, npcs: world.npcs, voice: voiceLog, dropped, tuning,
    get busy() { return g.busy; },
    /** Where a tap on the cat aims, m over its feet (src/game/companion.ts). */
    catTapY: CAT_TAP_Y,
    /** The pet that follows the heroine (PLAY-09), null when none: its actor, for the measure of the feet (tools/feet.mjs). */
    get pet() { return g.pets.follower; },
    /**
     * The change of world (TECH-15, src/game/travel.ts): `world` is the id of the world played, `travel(id)` changes
     * it and settles when the frame is open again (true - in the world asked for, false - back in the one before),
     * `transitioning` is true from the call to that moment.
     */
    get world() { return travel.world; },
    get transitioning() { return travel.active; },
    travel(id: string) { return travel.go(id); },
    /**
     * The description of the world played (ARCH-16, src/game/describe.ts), after a change of world - of the new one:
     * `items` - the points of the world template as plain values ({ kind, id, at, how, after, done, active }, `done` and
     * `active` read now); `missing(need)` - what the description lacks of the template, in its words (`need`: how many
     * of a kind are enough, by default the numbers of the template); `itemProblems` - where it disagrees with what the
     * world declares. All three are null for a world that hands in no items: it has no description.
     */
    get items() { const d = described(); return d && look(d); },
    missing(need?: Need) { const d = described(); return d && missing(d, need); },
    get itemProblems() { const d = described(); return d && problems(g.world, d); },
    /** The sound for the walkthrough: the notes of the music that plays (null in silence), is a line sounding, which clip a speaker says a line with. */
    get music() { return musicPlaying(); },
    get speaking() { return speaking(); },
    clipFor,
    /** The shards whose "go on" was decided (src/game/dialogue.ts): said, or not, once their thanks ended. */
    get shardsSettled() { return shardsSettled.n; },
    /** The planner of spoken lines: is a task open for it, and the line a tap on the bubble or the cat would repeat. */
    get inTask() { return inTask(); },
    get line() { return g.speech.shown?.key ?? null; },
    get finale() { return g.finale; },
    /**
     * The achievements (PLAY-08): `scene` - the one whose card is on screen, else null; `shown` - scenes ended since the
     * launch, `log` - their ids in order; `queue` - received, scene not shown yet; `hold()` / `release()` - the walkthrough's
     * own lever around a block a scene would disturb (the game never holds them), `held` - whether it is pulled;
     * `stop(where)` - a stop point now.
     */
    ach: {
      get scene() { return achState.scene; },
      get shown() { return achState.shown; },
      get log() { return [...achState.log]; },
      get queue() { return queue(g); },
      get held() { return achState.held; },
      hold() { achState.held = true; },
      release() { achState.held = false; },
      stop(where: StopWhere) { return stopPoint(where, g); },
      /** The stop points of "Play" over since the page loaded. */
      get plays() { return played.n; },
      /** The stop points over since the page loaded, by place ('finale', 'book', ...). */
      get over() { return { ...over }; },
    },
    /**
     * The gift of the day (PLAY-21, src/ui/welcome.ts): `hold()` - no gift, the meeting is the same-day welcome back,
     * `release()` - the gift by the clock again, `held` - whether it is pulled. The walkthrough's own lever (R61: the saves
     * of its pieces do not depend on the real date), never the game's; it lasts for the tab (sessionStorage), reloads too.
     */
    /** The break (PLAY-20, src/ui/session.ts): `hold()` - no card at the points, `release()` - the card when its minutes come. */
    brk: {
      get held() { return breakHold.held; },
      hold() { breakHold.held = true; try { sessionStorage.setItem(BREAK_HOLD, '1'); } catch { /* ignore */ } },
      release() { breakHold.held = false; try { sessionStorage.removeItem(BREAK_HOLD); } catch { /* ignore */ } },
    },
    /**
     * The mysterious stars (src/game/mystery-stars.ts): `hold()` - none in any world, `release()` - by the clock again,
     * `day(key)` - the day they are of (null: today), `today` - the stars of the day in the world played (id, kind, step, pos, solved),
     * `open(id)` - what the action button does at that star. The walkthrough's own lever (R61), never the game's; the hold
     * lasts for the tab (sessionStorage).
     */
    mystery: {
      get held() { return mysteryHold.held; },
      hold() { mysteryHold.held = true; try { sessionStorage.setItem(MYSTERY_HOLD, '1'); } catch { /* ignore */ } },
      release() { mysteryHold.held = false; try { sessionStorage.removeItem(MYSTERY_HOLD); } catch { /* ignore */ } },
      day(key: string | null) { mysteryHold.day = key; },
      get today() { return g.mystery.today; },
      unsolved: () => g.mystery.unsolved(),
      open(id: number) { const s = g.mystery.today.find((x) => x.id === id); const spot = s && g.mystery.spots.find((p) => p.pos === s.pos); if (spot?.on()) spot.run(); return !!spot; },
    },
    /**
     * The finds of the collections in the world played (src/game/collect-items.ts, PLAY-25), read only: each with its id,
     * kind, way, where it is now (`pos`, a butterfly flies), the ground under it and whether it is found. Nothing here
     * takes one: the walkthrough walks, jumps and taps as she would.
     */
    collect: {
      get items() {
        return g.collect.items.map((i) => ({ id: i.id, kind: i.kind, way: i.way, flock: i.flock, x: i.pos.x, y: i.pos.y, z: i.pos.z,
          home: { x: i.home.x, z: i.home.z }, ground: g.groundY(i.pos.x, i.pos.z), taken: i.taken }));
      },
      /** The top of a support at (x, z) for feet that high (WorldGround.support), null where there is none. */
      support: (x: number, z: number, feet: number) => g.ground.support?.(x, z, feet) ?? null,
      /** The relief at (x, z), without the supports. */
      ground: (x: number, z: number) => g.groundY(x, z),
    },
    gift: {
      get held() { return giftState.held; },
      hold() { giftState.held = true; try { sessionStorage.setItem(GIFT_HOLD, '1'); } catch { /* ignore */ } },
      release() { giftState.held = false; try { sessionStorage.removeItem(GIFT_HOLD); } catch { /* ignore */ } },
    },
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
    /**
     * Frames with no game time while true (pictures that must match): the world, the creatures and the companions stand
     * still. Everything on game time waits too - a change of world under it does not close until it is let go.
     */
    still(v: boolean) { g.still = v; },
    /** Whether frames are drawn with no game time now (`still`). */
    get isStill() { return g.still; },
    fade: transition,
    talk(id: string) { world.talk(id); },
    /**
     * The task played in the world now (src/game/worldtasks/core.ts), whatever its kind: `solve()`, `wrong()` (one wrong
     * move), `close()` (the close button), and `state` - its kind, phase (input / mistake / solved / closed), wrong moves,
     * the rung of the hint on screen, its middle; null when none is open.
     */
    worldTask: worldTaskDoor(g),
    /** Does the right thing for whatever task is on screen; returns what it did. */
    cheat() {
      const done = world.cheatWorld();
      if (done) return done;
      return cheatTask() ? 'panel' : '';
    },
  };
  // The world's own names join the ones above, which win; a change of world takes the names of the world left away
  // and lays in the new one's. The shared members stay the very same objects: the walkthrough keeps hold of them.
  const shared = new Set(Object.keys(game));
  const lay = (more: Record<string, unknown>) => { for (const [k, v] of Object.entries(more)) if (!shared.has(k)) game[k] = v; };
  lay(world.more);
  (window as unknown as Record<string, unknown>).__game = game;
  return (next) => {
    for (const k of Object.keys(world.more)) if (!shared.has(k)) delete game[k];
    world = next;
    game.npcs = next.npcs;
    lay(next.more);
  };
}
