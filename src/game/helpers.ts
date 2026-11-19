/**
 * The helpers of a task (decision of 2026-11-19): bought in the shop like the potions (src/game/shop.ts SUPPLIES,
 * her stock in `save.supplies`), taken in the task itself by a tap on their button on its panel
 * (src/game/taskviews/panel.ts):
 * - the owl: the first rung of the hint at once, before any mistake - the way, never the answer (LEARN-10);
 * - the abacus: the things of a task with a number (count, add, take away, the missing number, the signs) laid out in
 *   ten frames on the levels that do not have them yet (1-3, src/game/taskviews/tenframe.ts FRAMES_FROM).
 *
 * A helper is spent only where it gives something, and never gives an answer or skips a task. A task solved with one
 * raises no level and is no clean solve (src/game/skills.ts `recordTask`, `helped`): a child must not buy her way to a
 * level she cannot hold. The parents see how many helpers were taken in the last seven days (`save.helps`, by day).
 */
import type { Save } from '../core/save';
import { dayKey, KEEP_DAYS } from './playtime';
import { HELPER_IDS, stock, type HelperId } from './shop';

/** What a task asks of its helpers (src/game/context.ts hands it over with the hooks of a task). */
export interface TaskHelpers {
  /** She has one of `id` in her stock. */
  has(id: HelperId): boolean;
  /** Takes one of `id`: one less in her stock, counted for the parents, the save stored. False - none left. */
  use(id: HelperId): boolean;
}

const midnight = (d: Date, days = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

/** One `id` taken now: one less in her stock and one more on today's count; days older than the week are dropped. */
export function takeHelper(s: Save, id: HelperId, now = Date.now()): boolean {
  const n = stock(s, id);
  if (n === 0) return false;
  const supplies = { ...s.supplies };
  if (n > 1) supplies[id] = n - 1; else delete supplies[id];
  s.supplies = supplies;
  const today = dayKey(new Date(now)), first = dayKey(midnight(new Date(now), 1 - KEEP_DAYS));
  const helps: Record<string, Record<string, number>> = {};
  for (const [day, counts] of Object.entries(s.helps ?? {})) if (day >= first && day <= today) helps[day] = { ...counts };
  const day = (helps[today] ??= {});
  day[id] = (day[id] ?? 0) + 1;
  s.helps = helps;
  return true;
}

/** How many of each helper were taken in the last seven days, today with them (the parents' section). */
export function helpsOfWeek(s: Pick<Save, 'helps'>, now = Date.now()): Record<HelperId, number> {
  const today = dayKey(new Date(now)), first = dayKey(midnight(new Date(now), 1 - KEEP_DAYS));
  const out = Object.fromEntries(HELPER_IDS.map((id) => [id, 0])) as Record<HelperId, number>;
  for (const [day, counts] of Object.entries(s.helps ?? {})) {
    if (!(day >= first && day <= today)) continue;
    for (const id of HELPER_IDS) { const n = counts?.[id]; if (typeof n === 'number' && n > 0) out[id] += n; }
  }
  return out;
}

/** The helpers of the tasks of a game: its save, stored after every one taken. */
export function taskHelpers(save: Save, persist: () => void): TaskHelpers {
  return {
    has: (id) => stock(save, id) > 0,
    use: (id) => { const ok = takeHelper(save, id); if (ok) persist(); return ok; },
  };
}
