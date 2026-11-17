/**
 * The rhythm of a session (PLAY-20, PLAY-21), without a screen: the screens of the break (wave I) and of the greeting
 * (wave J) read and call what is here.
 *
 * The break (PLAY-20, R31-R35, Q8): once the session has lasted the minutes the parent chose (`breakMin`: 10, 15, 20 by
 * default, 30, or 0 = off), the next stop point after a task or a part of an artifact (src/game/stops.ts, never in the
 * middle of a task) puts an offer in `breakState.offer`; the screen shows it and calls `decline` or `accept`. After either,
 * no offer comes for QUIET_MIN minutes of play. Nothing here touches the stars or the progress (R51): an offer never
 * closes or holds the game.
 *
 * The minutes are those of the current session (R56), not the minutes of the day (`playMinutes`, the parents'): a seen
 * frame after "Play" counts (the rule of tickPlayTime), a reload goes on counting, a gap of RESET_GAP_MS or more between
 * two counted frames starts the session again - an evening game after a morning one does not open with a break.
 *
 * The gift of the day (PLAY-21, R37-R39, R44): the first launch on a date other than that of the last gift gives one
 * star (the greeting's screen, wave J, gives it); days skipped give no more than one, and nothing is ever taken. A clock set back gives one more (R44: allowed).
 */
import { BREAK_CHOICES, BREAK_DEFAULT, type Save, type SessionTime } from '../core/save';
import { dayKey } from './playtime';
import type { StopHost, StopWhere } from './stops';

export { BREAK_CHOICES, BREAK_DEFAULT };
/** The minutes of play with no offer after one is declined or accepted (R34, Q8). */
export const QUIET_MIN = 10;
/** A gap between two counted frames this long or longer starts the session again (R56: half an hour). */
export const RESET_GAP_MS = 30 * 60_000;
/** The stop points an offer may come at (R31: after a task or a part of an artifact). */
const OFFER_AT: readonly StopWhere[] = ['task', 'part'];
/** A thousandth of a second, in minutes: what the sum of the frames may fall short of a whole minute by. */
const EPS = 1 / 60_000;

/**
 * What the screen of the break reads (wave I): `offer` - where the offer came (the stop point), null = none waiting. It
 * lives in the page only: a reload drops a waiting offer, and the next point brings it again (the minutes are kept).
 */
export const breakState = { offer: null as StopWhere | null };

/** The minutes before a break, as the parent chose them (absent or damaged: BREAK_DEFAULT); 0 = off. */
export function breakMinutes(save: Pick<Save, 'breakMin'>): number {
  const m = save.breakMin;
  return m !== undefined && BREAK_CHOICES.includes(m) ? m : BREAK_DEFAULT;
}

/** The session of the save, made on first use (a fresh one: no minutes, no quiet). */
function sessionOf(save: Pick<Save, 'session'>, now: number): SessionTime {
  return (save.session ??= { min: 0, last: now, quiet: 0 });
}

/**
 * Adds `seconds` of play to the session: only a seen frame after "Play" (`visible`, as for tickPlayTime). A gap of
 * RESET_GAP_MS or more since the last counted frame starts the session again (and drops a waiting offer). Changes the
 * save in memory only; the usual saving writes it.
 */
export function tickSession(save: Pick<Save, 'session'>, seconds: number, visible: boolean, now = Date.now()) {
  if (!visible || !(seconds > 0)) return;
  const s = sessionOf(save, now);
  if (now - s.last >= RESET_GAP_MS) { s.min = 0; s.quiet = 0; breakState.offer = null; }
  s.min += seconds / 60;
  s.last = now;
}

/** The minutes of the current session (0 before its first frame). */
export function sessionMinutes(save: Pick<Save, 'session'>): number {
  return save.session?.min ?? 0;
}

/** Whether a break is to be offered at stop point `where`: only after a task or a part, never when off, never in the quiet. */
export function shouldOffer(save: Pick<Save, 'breakMin' | 'session'>, where: StopWhere): boolean {
  const limit = breakMinutes(save), s = save.session;
  if (limit === 0 || !s || !OFFER_AT.includes(where)) return false;
  // The minutes are a sum of fractions of a minute: a hair below the whole minute is that minute.
  return s.min + EPS >= limit && s.min + EPS >= s.quiet;
}

/**
 * The subscriber of the stop points (src/game/stops.ts subscribes it): reads the save through `g` at every point and
 * puts the offer in `breakState` when one is due. It never waits: the screen shows the offer.
 */
export function breakStop(g: Pick<StopHost, 'save'>, where: StopWhere): void {
  if (breakState.offer === null && shouldOffer(g.save, where)) breakState.offer = where;
}

/** The offer is gone, and none comes for QUIET_MIN minutes of play; the quiet is stored (it outlives a reload). */
function quiet(g: Pick<StopHost, 'save' | 'persist'>) {
  breakState.offer = null;
  const s = g.save.session;
  if (s) s.quiet = s.min + QUIET_MIN;
  g.persist();
}
/** "Play on" (R32, R34): nothing is lost, the next offer no sooner than QUIET_MIN minutes of play. */
export function decline(g: Pick<StopHost, 'save' | 'persist'>): void { quiet(g); }
/**
 * "Till tomorrow" (R36): the screen shows the sleeping cat; when the child comes back at once ("Continue") the session
 * goes on and keeps the same quiet as a decline. A rest of half an hour starts a new session anyway.
 */
export function accept(g: Pick<StopHost, 'save' | 'persist'>): void { quiet(g); }

/**
 * The gift of the day (PLAY-21): the stars to give now - 1 when `now` is on a date other than that of the last gift (the
 * date is written), else 0. Days skipped give one, not one each (R38); nothing is taken. The stars themselves are the
 * caller's to give through the game's own adding of stars, their one writer (src/game/no-penalties.test.ts); the caller
 * stores the save.
 */
export function dailyGift(save: Pick<Save, 'gift'>, now = Date.now()): 1 | 0 {
  const key = dayKey(new Date(now));
  if (save.gift === key) return 0;
  save.gift = key;
  return 1;
}
