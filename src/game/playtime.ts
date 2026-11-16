/**
 * The minutes played by day (R33, PLAY-15): the frame adds its time to the local date of today in `save.playMinutes`
 * (`YYYY-MM-DD` -> minutes), only the last 7 days are kept, and the parents' section reads them. It is for the grown-ups
 * only: the child is never shown or reminded of the time, and nothing in the game depends on it (no break reminders).
 * The tick only changes the save in memory; the usual saving writes it (every 10 s, a hidden page, `pagehide`: start.ts).
 */
import type { Save } from '../core/save';

/** The days the save keeps and the parents' section shows: today and the six before it. */
export const KEEP_DAYS = 7;

const pad = (n: number) => String(n).padStart(2, '0');
/** The local date of `d` as the save keys it: `YYYY-MM-DD`. */
export const dayKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** The local midnight `days` days after (or before, below 0) the day of `d`. */
const midnight = (d: Date, days = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** Today's key and the time it ends, so that a frame does not build a date of its own. */
let today = { key: '', from: 0, until: 0 };
function todayAt(now: number) {
  if (now < today.from || now >= today.until) {
    const d = new Date(now);
    today = { key: dayKey(d), from: midnight(d).getTime(), until: midnight(d, 1).getTime() };
  }
  return today.key;
}

/** Drops every day but the last `KEEP_DAYS` up to today (a day after today, of a clock set wrong, too), and damaged ones. */
function prune(minutes: Save['playMinutes'], now: number) {
  const first = dayKey(midnight(new Date(now), 1 - KEEP_DAYS)), last = todayAt(now);
  for (const k of Object.keys(minutes)) if (!(k >= first && k <= last) || typeof minutes[k] !== 'number') delete minutes[k];
}

/**
 * Adds `seconds` of play to today. A frame of a page that is not seen (`visible` false: the same `document.hidden`
 * that pauses the sound, TECH-05) is not play and adds nothing. The first frame of a day drops the days too old to keep.
 */
export function tickPlayTime(save: Pick<Save, 'playMinutes'>, seconds: number, visible: boolean, now = Date.now()) {
  if (!visible || !(seconds > 0)) return;
  const key = todayAt(now), m = save.playMinutes;
  if (!(key in m)) prune(m, now);
  const was = m[key];
  m[key] = (typeof was === 'number' && Number.isFinite(was) && was > 0 ? was : 0) + seconds / 60;
}

/** One day of the parents' section: its key, its weekday (0 = Sunday, as `p_wd0`) and its whole minutes. */
export interface PlayDay { key: string; weekday: number; minutes: number }

/** The last `KEEP_DAYS` days, the oldest first and today last; a day not played has 0 minutes. */
export function lastDays(save: Pick<Save, 'playMinutes'>, now = Date.now()): PlayDay[] {
  const out: PlayDay[] = [];
  for (let i = 1 - KEEP_DAYS; i <= 0; i++) {
    const d = midnight(new Date(now), i), key = dayKey(d), v = save.playMinutes[key];
    out.push({ key, weekday: d.getDay(), minutes: typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : 0 });
  }
  return out;
}
