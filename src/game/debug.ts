import * as THREE from 'three';
import { clipFor, dropped, inTask, musicPlaying, speaking, voiceLog } from '../core/audio';
import { shardsSettled } from './dialogue';
import { tuning } from '../core/tuning';
import { CAT_TAP_Y } from './companion';
import { uTime } from '../core/materials';
import { cheatTask, runTask, type TaskResult } from './taskviews/panel';
import { dealState } from './deal';
import { PET_GEAR, wearPetGear, type PetGearId, type PetWearer } from './petgear';
import { dealOf } from './shop';
import type { TaskType } from './tasks/types';
import { worldTaskDoor, worldTaskOf } from './worldtasks/core';
import { blockersOf } from './worldtasks/blockers';
import { transition } from './transition';
import type { Game } from './context';
import { achState, queue } from '../ui/achieve';
import { breakHold } from '../ui/session';
import { giftState } from '../ui/welcome';
import { mysteryHold } from './mystery-stars';
import { exploreOf, fillExplore } from './explore';
import { knownWorlds } from './artifacts';
import { EXPLORE_WORDS, exploreLeadOf } from './explore-lead';
import { easelState } from '../ui/easel';
import { guideState, type HintsChoice } from './guide-rule';
import { cpaHold, cpaOf, type Cpa } from './tasks/cpa';
import { over, played, stopPoint, type StopWhere } from './stops';
import { describeWorld, look, missing, problems, type Need } from './describe';
import type { WorldItem } from './world';
import { tradeHold, tradeHooks } from './trade';
import { dailyDay, dailyState } from './daily-find';
import { tradeState } from '../ui/trade';

/** The key of the tab's storage that keeps the walkthrough's lever of the gift (`__game.gift`) over a reload. */
export const GIFT_HOLD = 'amw-gift-hold';
/** The walkthrough's moment of the gift of the day (ms), kept for the tab over reloads (src/ui/welcome.ts giftState.at). */
export const GIFT_AT = 'amw-gift-at';
/** The walkthrough's lever of the deal of the day (src/game/deal.ts), kept for the tab like the gift's. */
export const DEAL_HOLD = 'amw-deal-hold';
/** The same for the walkthrough's lever of the break (`__game.brk`). */
export const BREAK_HOLD = 'amw-break-hold';
/** The same for the walkthrough's lever of the mysterious stars (`__game.mystery`). */
export const MYSTERY_HOLD = 'amw-mystery-hold';
/** The same for its lever `all` (`__game.mystery.all()`): a star at every place of the world - the measure of the draw calls. */
export const MYSTERY_ALL = 'amw-mystery-all';
/** The same for the walkthrough's lever of the trades of the characters (`__game.trade`). */
export const TRADE_HOLD = 'amw-trade-hold';

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
  try { const at = Number(sessionStorage.getItem(GIFT_AT)); giftState.at = at > 0 ? at : null; } catch { /* ignore */ }
  try { breakHold.held = sessionStorage.getItem(BREAK_HOLD) === '1'; } catch { /* ignore */ }
  try { dealState.held = sessionStorage.getItem(DEAL_HOLD) === '1'; } catch { /* ignore */ }
  try { mysteryHold.held = sessionStorage.getItem(MYSTERY_HOLD) === '1'; } catch { /* ignore */ }
  try { mysteryHold.all = sessionStorage.getItem(MYSTERY_ALL) === '1'; } catch { /* ignore */ }
  try { tradeHold.held = sessionStorage.getItem(TRADE_HOLD) === '1'; } catch { /* ignore */ }
  const { hero, cat, cam, save, flies, scene, camera, renderer } = g;
  let world = extras;
  // The description of the world played at the moment of the question (ARCH-16): null for a world that hands in no items.
  const described = (): WorldItem[] | null => { const built = travel.built; return built?.items ? describeWorld(g, built.items()) : null; };
  const game: Record<string, unknown> = {
    hero, cat, cam, save, flies, scene, camera, renderer, THREE, npcs: world.npcs, voice: voiceLog, dropped, tuning,
    get busy() { return g.busy; },
    /** The picture is lost (src/core/contextloss.ts): the game stands. */
    get dark() { return g.dark; },
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
     * `release()` - the gift by the clock again, `held` - whether it is pulled; `pin(ms)` - the day of the gift read from
     * that moment, not the clock (null - the clock again). The walkthrough's own lever (R61: the saves
     * of its pieces do not depend on the real date), never the game's; it lasts for the tab (sessionStorage), reloads too.
     */
    /**
     * The deal of the day (src/game/deal.ts): `hold()` - no deal, every price its own (all pieces, R61), `release()` -
     * the deal again; `day(key)` - the day taken as today (null: the real one); `today` - the deal now, or null.
     */
    deal: {
      get held() { return dealState.held; },
      hold() { dealState.held = true; try { sessionStorage.setItem(DEAL_HOLD, '1'); } catch { /* ignore */ } },
      release() { dealState.held = false; try { sessionStorage.removeItem(DEAL_HOLD); } catch { /* ignore */ } },
      day(key: string | null) { dealState.day = key; },
      get today() { return dealOf(save); },
    },
    /** The break (PLAY-20, src/ui/session.ts): `hold()` - no card at the points, `release()` - the card when its minutes come. */
    brk: {
      get held() { return breakHold.held; },
      hold() { breakHold.held = true; try { sessionStorage.setItem(BREAK_HOLD, '1'); } catch { /* ignore */ } },
      release() { breakHold.held = false; try { sessionStorage.removeItem(BREAK_HOLD); } catch { /* ignore */ } },
    },
    /**
     * The mysterious stars (src/game/mystery-stars.ts): `hold()` - none in any world, `release()` - by the clock again,
     * `day(key)` - the day they are of (null: today), `today` - the stars of the day in the world played (id, kind, step, pos, solved),
     * `open(id)` - what the action button does at that star; `all(on)` - a star at every place of the world, not the ten of
     * the day (the worst case for the measure of the draw calls), `drawn` - whether they are drawn this frame (`showR`). The walkthrough's own lever (R61), never the game's; the hold
     * lasts for the tab (sessionStorage).
     */
    // the explorer's key (PLAY-36, ./explore.ts): a world's points, `fill` gives them up to a share; `lead` - in the world played
    explore: {
      points: (id: string = g.worldId) => { const w = knownWorlds().find((k) => k.id === id); return w ? exploreOf(g.save, w) : null; },
      fill: (id: string, share: number) => { const w = knownWorlds().find((k) => k.id === id); if (!w) return null; const e = fillExplore(g.save, w, share); g.persist(); return e; },
      lead: () => { const l = exploreLeadOf(g); const p = l?.leading(); return { leading: p ? { x: p.x, z: p.z } : null, words: Object.values(EXPLORE_WORDS).filter((k) => g.ws.flags[k] === true) }; },
    },
    mystery: {
      get held() { return mysteryHold.held; },
      hold() { mysteryHold.held = true; try { sessionStorage.setItem(MYSTERY_HOLD, '1'); } catch { /* ignore */ } },
      release() { mysteryHold.held = false; try { sessionStorage.removeItem(MYSTERY_HOLD); } catch { /* ignore */ } },
      day(key: string | null) { mysteryHold.day = key; },
      all(on = true) { mysteryHold.all = on; try { if (on) sessionStorage.setItem(MYSTERY_ALL, '1'); else sessionStorage.removeItem(MYSTERY_ALL); } catch { /* ignore */ } },
      get drawn() { return g.mystery.drawn; },
      /** How many places the world played names (0: none, the world has no mysterious stars) and its `showR` (null: always drawn). */
      get places() { return g.world.mystery?.spots.length ?? 0; },
      /** Where the world's places are (each on ground she walks, its test): the walkthrough stands at one away from the stars of the day. */
      get placesAt() { return (g.world.mystery?.spots ?? []).map((p) => ({ x: p.x, z: p.z })); },
      get showR() { return g.world.mystery?.showR ?? null; },
      get today() { return g.mystery.today; },
      unsolved: () => g.mystery.unsolved(),
      open(id: number) { const s = g.mystery.today.find((x) => x.id === id); const spot = s && g.mystery.spots.find((p) => p.pos === s.pos); if (spot?.on()) spot.run(); return !!spot; },
    },
    /**
     * The easel of the world played (src/game/easel.ts, PLAY-29): `open()` - what its action button does (false: none
     * here, or open already); `card` - the open card (src/ui/easel.ts): whether open, the cells set, the pieces lying by
     * it; `setAll()` - every piece lying by it dropped on its cell, as a finger would.
     */
    /**
     * The cat's sparkles (src/game/guide.ts): what they show now, the seconds with no progress, whether a tap on the cat
     * asked for the way; `choice(c)` sets the parent's choice (Save.hints), `ask()` asks as a tap on the cat does.
     */
    guide: {
      get state() { const { show, quiet, asked, choice } = guideState; return { show, quiet, asked, choice }; },
      choice: (c: HintsChoice) => { if (c === 'world') delete g.save.hints; else g.save.hints = c; },
      ask: () => guideState.ask(),
    },
    /**
     * The steps «things → picture → numbers» of the number tasks (src/game/tasks/cpa.ts): `step(level)` - the one a task
     * of that level is drawn at now; `hold(n)` fixes it for every task (null - the world's again).
     */
    cpa: {
      step: (level: number) => cpaOf(level),
      hold: (n: Cpa | null) => { cpaHold.step = n; },
    },
    easel: {
      open: () => g.easel.open(),
      get card() { return { open: easelState.open, set: [...easelState.set], loose: [...easelState.loose] }; },
      setAll: () => { easelState.setAll?.(); },
      /** Its hints (the customer's word of 2026-11-27): the sign over it, whether it is the cat's goal, the lead after the first piece. */
      get hints() { return g.easel.state(); },
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
      /** The moment the gift reads its day from (ms; null - the clock again), kept over reloads: one day for a whole block. */
      get at() { return giftState.at; },
      pin(at: number | null) {
        giftState.at = at;
        try { if (at === null) sessionStorage.removeItem(GIFT_AT); else sessionStorage.setItem(GIFT_AT, String(at)); } catch { /* ignore */ }
      },
    },
    /** Seconds of game time: a frame counts at most 0.05 s, so on a slow machine it runs behind the wall clock. */
    get time() { return uTime.value; },
    /** The next scene (a conversation or the finale) throws once, right after it has taken the controls. */
    failNext() { g.failNext = true; },
    teleport(x: number, z: number) { hero.root.position.set(x, g.groundY(x, z), z); },
    /** Whether a walker of radius `r` at (x, z) stands clear of the world's obstacles (WorldGround.resolve leaves it there). */
    free(x: number, z: number, r: number) { const p = { x, z }; g.ground.resolve(p, r); return Math.hypot(p.x - x, p.z - z) < 1e-6; },
    closeup(d: number | null) { g.camOverride = d; },
    /** The camera behind her at once where it glides to, the next frame (the budget's measures, tools/grey-route.mjs). */
    settleCamera() { g.camSnap = true; },
    /** s of game time each frame steps from now (null: the real time again), the budget's measure (src/game/context.ts frameStep). */
    stepFrames(s: number | null) { g.frameStep = s; },
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
     * The trades of the characters (PLAY-28, src/game/trade.ts): the ask of `who` on `day` (today by default) in the world
     * played, null - none; `day(d)` - the day the game takes as today (also the find of the day's), null - the date;
     * `card` - the card open now and its ask (src/ui/trade.ts); `hold()` / `release()` - no character offers a trade
     * while held (the walkthrough holds it but in its block "trade").
     */
    trade: {
      get held() { return tradeHold.held; },
      hold() { tradeHold.held = true; try { sessionStorage.setItem(TRADE_HOLD, '1'); } catch { /* ignore */ } },
      release() { tradeHold.held = false; try { sessionStorage.removeItem(TRADE_HOLD); } catch { /* ignore */ } },
      offer: (who: string, day?: string) => tradeHooks.offer?.(who, day ?? dailyDay()) ?? null,
      day(d: string | null) { dailyState.day = d; },
      get card() { return { open: tradeState.open, offer: tradeState.offer }; },
    },
    /**
     * The task played in the world now (src/game/worldtasks/core.ts), whatever its kind: `solve()`, `wrong()` (one wrong
     * move), `close()` (the close button), and `state` - its kind, phase (input / mistake / solved / closed), wrong moves,
     * the rung of the hint on screen, its middle; null when none is open. `blockers()` - what stands between the camera
     * and the task now (./worldtasks/blockers.ts), the heroine and the cat aside; empty - it is seen whole; null - none open.
     */
    worldTask: Object.assign(worldTaskDoor(g), {
      blockers: () => { const s = worldTaskOf(g); return s ? blockersOf(scene, camera.position, s, [hero.root, cat.root]) : null; },
    }),
    /**
     * A panel task of `type` and `level` opened now, as a character would (the cat's hooks, the helpers of her stock):
     * the walkthrough's way to the helpers of a task (src/game/helpers.ts). The game stands while it is open; the
     * promise settles with its result. Nothing is recorded: no level, no stars. It goes through `g.task`, as every
     * task of the game does: its end cuts its own lines off - a question or a hint left sounding would turn away the
     * story line said next (the cat's "deal of the day" of the shop opened right after, a run of 2026-11-21).
     */
    task(type: TaskType, level: number): Promise<TaskResult> {
      g.busy = true;
      return g.task(() => runTask(type, level, g.hooksFor('🐱'), g.rng)).finally(() => { g.busy = false; });
    },
    /** Puts a thing of the pets on (src/game/petgear.ts; null: none), for the pictures of the fitting and the walkthrough. */
    wearPet(pet: PetWearer, id: PetGearId | null) { wearPetGear(g.petGear, pet, id); return Object.keys(g.petGear).length; },
    /** The thing shown on each pet and the bone it hangs under (null: none shown). */
    petWorn() {
      const out: Record<string, string | null> = { cat: null, fawn: null, catBone: null, fawnBone: null };
      for (const [id, o] of Object.entries(g.petGear)) {
        if (!o?.visible) continue;
        const pet = PET_GEAR[id as PetGearId].pet;
        out[pet] = id; out[`${pet}Bone`] = o.parent?.name ?? null;
      }
      return out;
    },
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
