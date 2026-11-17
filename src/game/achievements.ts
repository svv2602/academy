/**
 * Achievements (PLAY-08): the twelve of the customer's decision of 2026-11-15 (R42), for exploring, for trying and for
 * keeping at it. Each condition is a pure function of the save and of what the open worlds are made of (`AchContext`);
 * none reads the time of an answer, a frame count or the length of a session (R04). A received achievement is written
 * into `save.achievements` for ever (R51): nothing here removes one, and a mistake moves no counter but the current run
 * of clean solves (src/game/skills.ts, countClean).
 *
 * This file only knows the conditions and the counters; when the game checks them and shows the scene is PLAY-08's
 * other part. The texts: `ach_<id>_t` (title) and `ach_<id>_d` (description) of src/ui/strings.ts.
 */
import type { Save, WorldState } from '../core/save';
import { dayKey } from './playtime';
import type { SkillId } from './skills';

export type AchievementId =
  | 'first_shard' | 'secret_chest' | 'all_world_stars' | 'first_artifact' | 'three_secrets'
  | 'first_task' | 'try_again' | 'all_skills' | 'fifty_tasks'
  | 'clean_ten' | 'days_3' | 'days_5';

/** What a world is made of, as the conditions need it; the world gives it (no world's names in this file). */
export interface WorldFacts {
  /** The world id, the key of its progress in `save.worlds`. */
  id: string;
  /** Its characters' chains: a chain is done (its part of the artifact given) when all its steps are. */
  quests: readonly { id: string; steps: readonly unknown[] }[];
  /** The ids of the stars that lie on its ground (not those of a search or a chest). */
  groundStars: readonly number[];
  /** The flag of its chest, if it has one. */
  chest?: string;
  /** The flags of its secrets (the chest is one of them). */
  secrets: readonly string[];
}

export interface AchContext {
  /** The worlds that can be played. */
  worlds: readonly WorldFacts[];
  /** The skills the tasks of those worlds train: `all_skills` asks for one task of each. */
  skills: readonly SkillId[];
}

export interface Achievement {
  id: AchievementId;
  group: 'explore' | 'effort' | 'series';
  icon: string;
  test(save: Save, ctx: AchContext): boolean;
}

/** The stored progress of a world, read without creating it (asking must change nothing). */
function stored(s: Save, id: string): Partial<WorldState> {
  const w = s.worlds[id];
  return typeof w === 'object' && w !== null ? w : {};
}
const anyWorld = (ctx: AchContext, s: Save, ok: (w: Partial<WorldState>, f: WorldFacts) => boolean) =>
  ctx.worlds.some((f) => ok(stored(s, f.id), f));
const flag = (w: Partial<WorldState>, name: string) => w.flags?.[name] === true;

/** Tasks solved, of every skill, and those solved after a mistake. */
const solved = (s: Save) => Object.values(s.skills).reduce((n, k) => n + (k.tasks || 0), 0);
const afterMistake = (s: Save) => Object.values(s.skills).reduce((n, k) => n + Math.max(0, (k.tasks || 0) - (k.first || 0)), 0);

/** The twelve, in the order of the texts (e4-texts.md §1): exploring, trying, keeping at it. */
export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first_shard', group: 'explore', icon: '💎',
    test: (s, ctx) => anyWorld(ctx, s, (w, f) => f.quests.some((q) => (w.quests?.[q.id] ?? 0) >= q.steps.length)) },
  { id: 'secret_chest', group: 'explore', icon: '🎁',
    test: (s, ctx) => anyWorld(ctx, s, (w, f) => f.chest !== undefined && flag(w, f.chest)) },
  { id: 'all_world_stars', group: 'explore', icon: '⭐',
    test: (s, ctx) => anyWorld(ctx, s, (w, f) => f.groundStars.length > 0 && f.groundStars.every((id) => w.starsTaken?.includes(id))) },
  { id: 'first_artifact', group: 'explore', icon: '🔮',
    test: (s, ctx) => anyWorld(ctx, s, (w) => w.final === true) },
  { id: 'three_secrets', group: 'explore', icon: '🗝️',
    test: (s, ctx) => ctx.worlds.reduce((n, f) => n + f.secrets.filter((k) => flag(stored(s, f.id), k)).length, 0) >= 3 },
  { id: 'first_task', group: 'effort', icon: '👣', test: (s) => solved(s) >= 1 },
  { id: 'try_again', group: 'effort', icon: '💪', test: (s) => afterMistake(s) >= 1 },
  { id: 'all_skills', group: 'effort', icon: '🎨',
    test: (s, ctx) => ctx.skills.length > 0 && ctx.skills.every((k) => (s.skills[k]?.tasks ?? 0) >= 1) },
  { id: 'fifty_tasks', group: 'effort', icon: '📚', test: (s) => solved(s) >= 50 },
  { id: 'clean_ten', group: 'series', icon: '🎯', test: (s) => (s.clean?.best ?? 0) >= 10 },
  { id: 'days_3', group: 'series', icon: '🌤️', test: (s) => (s.days?.n ?? 0) >= 3 },
  { id: 'days_5', group: 'series', icon: '🌈', test: (s) => (s.days?.n ?? 0) >= 5 },
];

/** The achievements whose condition is met and that the save does not hold yet, in the order of ACHIEVEMENTS. */
export function earned(save: Save, ctx: AchContext): AchievementId[] {
  return ACHIEVEMENTS.filter((a) => !(a.id in save.achievements) && a.test(save, ctx)).map((a) => a.id);
}

/** Writes a received achievement with the time it came; one already received keeps its time. Never removes one. */
export function grant(save: Save, id: AchievementId, now = Date.now()) {
  if (!(id in save.achievements)) save.achievements[id] = now;
}

/** Grants every achievement earned now and returns them (none twice). */
export function check(save: Save, ctx: AchContext, now = Date.now()): AchievementId[] {
  const ids = earned(save, ctx);
  for (const id of ids) grant(save, id, now);
  return ids;
}

/** The achievements received whose scene has not been shown yet, in the order of ACHIEVEMENTS (they wait in a queue). */
export function unshown(save: Save): AchievementId[] {
  return ACHIEVEMENTS.filter((a) => a.id in save.achievements && !(save.achShown ?? []).includes(a.id)).map((a) => a.id);
}

/** Marks the scene of an achievement shown. */
export function markShown(save: Save, id: AchievementId) {
  const shown = (save.achShown ??= []);
  if (!shown.includes(id)) shown.push(id);
}

/**
 * Counts a day of play (R44): called at the first "Play" / "Continue" of a launch. A local date other than the last
 * counted one is a new day; the count never goes down, and a clock set back and forward again may count a day more
 * (allowed by the decision of 2026-11-15). Returns whether a new day was counted.
 */
export function noteDay(save: Pick<Save, 'days'>, now = Date.now()): boolean {
  const key = dayKey(new Date(now)), d = (save.days ??= { n: 0, last: '' });
  if (key === d.last) return false;
  d.n++;
  d.last = key;
  return true;
}
