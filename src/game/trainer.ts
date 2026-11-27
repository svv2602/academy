/**
 * The trainer «Чарівна дошка» on the hub's glade (the customer's word of 2026-11-26: «отчёт и тренажёр — делаем»):
 * she picks a skill, plays TRAIN_TASKS tasks of it in a row at its level (adaptive, or the one the parent fixed), every
 * answer recorded in that skill (src/game/skills.ts `recordTask`, so the parents' report sees it). A session played to
 * its end pays a star, the first one of a day that goes on from yesterday two (`trainReward`); at most TRAIN_PAID paid
 * sessions a day - after them a session is played for the cat's praise alone, so the board is no farm of stars. Closing
 * a task ends the session: what she solved is recorded, nothing is paid, nothing taken (LEARN-14).
 *
 * The days in a row (`save.train`, ./trainer.ts `trainDays`): a day missed starts them again quietly - nowhere does the
 * game say a run was lost; the board shows "N days in a row" from two on.
 */
import type { Save } from '../core/save';
import { BY_LEVEL } from './tasks';
import type { TaskType } from './tasks/types';
import { levelFor, recordTask, shownSkills, type SkillId } from './skills';
import { answerOf } from './taskviews/panel';
import type { Game } from './context';
import type { Rng } from '../core/rng';
import { dayKey } from './playtime';

/** Tasks in one session (the plan of 2026-11-26: about 2-3 minutes). */
export const TRAIN_TASKS = 6;
/** Sessions a day that pay their stars. */
export const TRAIN_PAID = 3;

/**
 * The task types of each skill the board can give: a skill whose type follows its level (compare, series, compose) is
 * played by that rule (src/game/tasks BY_LEVEL); a skill with two types of its own alternates them.
 */
const TYPES: Record<SkillId, readonly TaskType[] | keyof typeof BY_LEVEL> = {
  count: ['count'], add: ['add'], sub: ['sub'], compare: 'compare', series: 'series', pattern: ['pattern'],
  memory: ['pairs', 'simon'], classify: ['odd', 'sort'], compose: 'compose', attention: ['diff'], assemble: ['puzzle'],
};

/** The skills the board offers: the ones the parents' section shows (a late skill once its first task is played). */
export const trainSkills = (s: Save): SkillId[] => shownSkills(s);

/** The type of the `i`-th task of a session of `skill` on `level`. */
export function trainType(skill: SkillId, level: number, i: number, rng: Rng): TaskType {
  const t = TYPES[skill];
  if (typeof t === 'string') return BY_LEVEL[t](level);
  return t.length === 1 ? t[0] : t[(i + Math.floor(rng() * 2)) % t.length];
}

/** The local day before `day` (YYYY-MM-DD). */
const yesterday = (day: string) => { const [y, m, d] = day.split('-').map(Number); return dayKey(new Date(y, m - 1, d - 1)); };

/** The days in a row she trained, as of `today`: 0 once a day was missed. */
export function trainDays(s: Pick<Save, 'train'>, today = dayKey(new Date())): number {
  const t = s.train;
  return t && (t.last === today || t.last === yesterday(today)) ? t.days : 0;
}

/**
 * A session played to its end on `today`: moves the days in a row and the paid sessions of the day, and says what it
 * pays - 2 for the first session of a day that goes on from yesterday (`again`: the cat's word of it), 1 for any other
 * paid one, 0 past TRAIN_PAID.
 */
export function trainReward(s: Pick<Save, 'train'>, today = dayKey(new Date())): { pay: 0 | 1 | 2; again: boolean; days: number } {
  const t = s.train;
  if (t && t.last === today) {
    if (t.paid >= TRAIN_PAID) return { pay: 0, again: false, days: t.days };
    t.paid++;
    return { pay: 1, again: false, days: t.days };
  }
  const on = !!t && t.last === yesterday(today);
  s.train = { days: on ? t!.days + 1 : 1, last: today, paid: 1 };
  return { pay: on ? 2 : 1, again: on, days: s.train.days };
}

/** What of the game a session uses; read live through it. */
export type TrainHost = Pick<Game, 'save' | 'task' | 'plan' | 'hooksFor' | 'rng' | 'addStars' | 'above' | 'hero' | 'praise' | 'persist'>;

/**
 * A session of `skill`: TRAIN_TASKS tasks, each at the skill's level as it is then, each answer recorded. Played to its
 * end - the stars of `trainReward` and the cat's praise; a task closed - the session ends there, nothing paid.
 * `said`: the cat's word at its end, of a day going on from yesterday or of any other (the board's lines).
 */
export async function runTraining(g: TrainHost, skill: SkillId, said?: (again: boolean) => Promise<unknown> | void): Promise<'done' | 'closed'> {
  for (let i = 0; i < TRAIN_TASKS; i++) {
    const level = levelFor(g.save, skill), type = trainType(skill, level, i, g.rng);
    const res = await g.task(() => g.plan.runTask(type, level, g.hooksFor('🐱'), g.rng));
    if (!res.solved) return 'closed';
    recordTask(g.save, skill, res.wrong, res.helped === true, answerOf(res));
    g.persist();
  }
  const r = trainReward(g.save);
  // the reward does not depend on mistakes (src/game/no-penalties.test.ts reads the literals)
  if (r.pay > 0) g.addStars(r.pay === 2 ? 2 : 1, g.above(g.hero.root.position, 1.4));
  else g.persist();
  await said?.(r.again);
  await g.praise();
  return 'done';
}
