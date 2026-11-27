/**
 * «А складніше зможеш?» (LEARN-28, decision Q19): when a character may offer an example a level harder.
 *
 * The level of a skill goes up by itself, one step for two clean solves. A child for whom the tasks have become easy
 * may not want to wait: after a task she solved cleanly and by herself the character asks whether she can do a harder
 * one, and she takes it or leaves it. Taken and solved cleanly, it is her level from then on (`recordDare` of
 * src/game/skills.ts); a mistake in it, closing it or saying "another time" changes nothing.
 *
 * It is offered only where it adds something:
 * - after a task of the panel solved at the first try, with no helper;
 * - when this very solve was no step up: the second clean one in a row is, and in the fast climb of a skill every
 *   clean one - so while a skill climbs the question is never asked;
 * - below the top level of the skill - there the tasks in breadth are what is harder (src/game/wide.ts);
 * - when the parent has not fixed the level of the skill;
 * - once in a conversation (the conversation keeps that count, src/game/dialogue.ts).
 */
import type { Save } from '../core/save';
import { LEVELS, statOf, type SkillId } from './skills';

/** How a task ended, as far as the offer reads it (TaskResult of the panel). */
export interface Solved { solved: boolean; wrong: number; helped?: boolean }

/**
 * Whether a harder example may be offered after a task of `skill` given on level `given` that ended as `res`. Asked
 * once the task is recorded: her level then tells whether this solve was a step up.
 */
export function mayDare(save: Save, skill: SkillId, given: number, res: Solved): boolean {
  if (!res.solved || res.wrong !== 0 || res.helped === true) return false;
  const fixed = save.fixed[skill];
  if (typeof fixed === 'number' && fixed > 0) return false;
  // her level is still the one the task was given on: the solve was no step up (in the fast climb it always is)
  return statOf(save, skill).level === given && given < LEVELS[skill][1];
}

/** The level of the harder example offered after a task given on level `given`: the next one. */
export const dareLevel = (given: number) => given + 1;
