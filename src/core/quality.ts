/**
 * The graphics quality (TECH-04, TECH-16). 2: bloom + shadows, 1: shadows, 0: plain.
 * Free of the DOM and the renderer: main.ts hands in what the save and the address hold, src/core/renderer.ts hands in
 * the frames of each second.
 *
 * The tier the game starts with (`startTier`) and the one it keeps by itself while it is played (`autoSecond`,
 * `autoMayRaise`, `autoRaise`; decision of the customer 2026-11-20). The numbers come from the measure on S22 of
 * 2026-11-20 (docs/perf.md, "Замер на S22 (2026-11-20)"): the first world on a warm phone gave 36 fps on q2 with a
 * third of its frames late, where q1 gives about 53 and the hub on q2 about 48.
 * - down: below DOWN_FPS for DOWN_SECONDS seconds in a row;
 * - up: the last UP_SECONDS counted seconds at UP_FPS or more, but for at most UP_SLOW_MAX of them and none below
 *   UP_FLOOR (a phone's real frames dip now and then: a streak of 30 good seconds in a row was broken by one second of
 *   57.9 and never came - the check on S22 of 2026-11-20); no sooner than UP_GAP_S after the last change, and only
 *   while the frame of a change of world is closed (the bloom coming back is not seen);
 * - a raise that falls back within its trial (TRIAL_S seconds of open frames) failed: the gap before the next try
 *   doubles, and after UP_FAILS failures no other try is made this session. A raise at the launch (`startTier`:
 *   the tenth launch, or a launch after a break) is on trial the same way;
 * - a tier fixed by ?q= or by the parent never moves.
 */
export type Tier = 0 | 1 | 2;
/** Every tenth launch tries one tier above the remembered one: the phone may have been busy that day. */
export const RETRY_EVERY = 10;
/** A launch this long after the last frame of play tries one tier above the remembered one: the phone has cooled. */
export const COOL_GAP_MS = 30 * 60_000;
/** Down: the frames of a second below this... */
export const DOWN_FPS = 45;
/** ...this many seconds in a row. */
export const DOWN_SECONDS = 5;
/** Up: the frames of a second at this or more... */
export const UP_FPS = 58;
/** ...over the last this many counted seconds... */
export const UP_SECONDS = 30;
/** ...all but at most this many of them... */
export const UP_SLOW_MAX = 2;
/** ...and none of them below this. */
export const UP_FLOOR = 50;
/** Seconds since the last change before a try up; doubled after each failed try. */
export const UP_GAP_S = 180;
/** Seconds of open frames after a raise in which falling back means the raise failed. */
export const TRIAL_S = 15;
/** Failed tries up after which the session tries no more. */
export const UP_FAILS = 2;
/** Seconds after a change of tier or of world before the frames count: the new tier or world settles first. */
export const WARM_S = 4;

export const isTier = (v: unknown): v is Tier => v === 0 || v === 1 || v === 2;

export interface StartTier {
  tier: Tier;
  /** The launch counter including this launch. */
  launches: number;
  /** Where the tier came from. Only a remembered one ('saved') is kept by the game itself (lowered and raised). */
  by: 'param' | 'pin' | 'saved';
  /** The tier is one above the remembered one (the tenth launch, a launch after a break): it starts on trial. */
  raised: boolean;
}

/**
 * `param` is the `?q=` of the address (null without it), `pinned` the tier the parent fixed (null = auto), `saved` the
 * tier the last session ended on, `launches` the launches counted before this one, `gapMs` the time since the last
 * frame of play (undefined or null: not known, as before the first "Play"). `?q=` wins over everything (a value other
 * than 0, 1, 2 counts as no parameter), then the parent's choice, then the remembered tier; every tenth launch, and a
 * launch COOL_GAP_MS or more after the last frame of play, try the remembered tier one higher, never above 2.
 */
export function startTier(o: { param: string | null; pinned: unknown; saved: unknown; launches: unknown; gapMs?: number | null }): StartTier {
  const before = typeof o.launches === 'number' && Number.isInteger(o.launches) && o.launches >= 0 ? o.launches : 0;
  const launches = before + 1;
  const q = o.param === null || o.param.trim() === '' ? NaN : Number(o.param);
  if (isTier(q)) return { tier: q, launches, by: 'param', raised: false };
  if (isTier(o.pinned)) return { tier: o.pinned, launches, by: 'pin', raised: false };
  const saved: Tier = isTier(o.saved) ? o.saved : 2;
  const cooled = typeof o.gapMs === 'number' && o.gapMs >= COOL_GAP_MS;
  const tier = (launches % RETRY_EVERY === 0 || cooled ? Math.min(2, saved + 1) : saved) as Tier;
  return { tier, launches, by: 'saved', raised: tier > saved };
}

/** What the game keeps of its own tier while it is played. */
export interface Auto {
  readonly tier: Tier;
  /** Seconds since the last change of tier, or of world (the frames count again after WARM_S of them). */
  readonly warm: number;
  /** Seconds in a row below DOWN_FPS. */
  readonly slow: number;
  /** The frames of the last UP_SECONDS counted seconds (open frame, past the warm-up), the oldest first. */
  readonly recent: readonly number[];
  /** Seconds since the last change of tier. */
  readonly since: number;
  /** Failed tries up this session. */
  readonly fails: number;
  /** Open, counted seconds since a raise still on trial; null - none on trial. */
  readonly trial: number | null;
}

/** The start of a session at `tier`; `raised` - the launch raised it (`StartTier.raised`): on trial from the start. */
export const autoStart = (tier: Tier, raised = false): Auto => ({ tier, warm: 0, slow: 0, recent: [], since: 0, fails: 0, trial: raised ? 0 : null });

/**
 * One second of frames: `fps` of it, `closed` - the frame of a change of world was closed in it (a world loaded and
 * built behind it: its slow frames say nothing of the tier), `hidden` - the page was hidden (nothing counts).
 * Lowers the tier after DOWN_SECONDS slow seconds in a row; a fall within the trial of a raise is a failed try.
 */
export function autoSecond(a: Auto, fps: number, o: { closed?: boolean; hidden?: boolean } = {}): Auto {
  if (o.hidden) return a;
  const since = a.since + 1;
  if (o.closed) return { ...a, since, warm: 0, slow: 0 };
  const warm = a.warm + 1;
  if (warm <= WARM_S) return { ...a, since, warm };
  const slow = fps < DOWN_FPS ? a.slow + 1 : 0;
  const recent = [...a.recent, fps].slice(-UP_SECONDS);
  const trial = a.trial === null ? null : a.trial + 1;
  if (slow >= DOWN_SECONDS && a.tier > 0) {
    const failed = trial !== null && trial <= TRIAL_S;
    return { tier: (a.tier - 1) as Tier, warm: 0, slow: 0, recent: [], since: 0, fails: a.fails + (failed ? 1 : 0), trial: null };
  }
  return { ...a, since, warm, slow, recent, trial: trial !== null && trial > TRIAL_S ? null : trial };
}

/** The gap before a try up: UP_GAP_S, doubled for each failed try (3, 6 minutes). */
export const upGap = (fails: number): number => UP_GAP_S * 2 ** fails;

/** The frames of the last seconds are good enough for a try up: UP_SECONDS of them, few below UP_FPS, none below UP_FLOOR. */
export function goodFrames(recent: readonly number[]): boolean {
  return recent.length >= UP_SECONDS && recent.filter((f) => f < UP_FPS).length <= UP_SLOW_MAX && recent.every((f) => f >= UP_FLOOR);
}

/** Whether a try up may be made now (the caller makes it only while the frame of a change of world is closed). */
export function autoMayRaise(a: Auto): boolean {
  return a.tier < 2 && a.fails < UP_FAILS && a.trial === null && a.since >= upGap(a.fails) && goodFrames(a.recent);
}

/** The try up: one tier higher, on trial. */
export function autoRaise(a: Auto): Auto {
  return { ...a, tier: Math.min(2, a.tier + 1) as Tier, warm: 0, slow: 0, recent: [], since: 0, trial: 0 };
}
