/**
 * The tasks in breadth (LEARN-27, decision Q18): when the next task of a skill is one of them, and which.
 *
 * A child who solves the usual examples of the top level of addition or of take away cleanly is not given larger
 * numbers: she is given other kinds of example within the same twenty (`WIDE` of src/game/skills.ts - three addends, the
 * missing number of a take away). They come where a conversation or a mysterious star was to give the usual example of
 * the skill, every other time, so the usual ones keep coming and keep telling the level.
 *
 * - On: the tasks of the skill are given on its top level (her own, or the one the parent fixed) and its run of clean
 *   solves is `WIDE_FROM` or longer. A level fixed below the top: none.
 * - Off again: a usual task with a mistake ends the run; so do two tasks in breadth in a row with two wrong answers or
 *   more (`recordTask`). Two usual tasks solved cleanly turn them on again.
 * - Every other time: the task after one in breadth is a usual one. What was given last is remembered for the session,
 *   by the save played, and is no part of the save.
 * - Which: one of the skill's kinds, by `rng`; not the kind given the last time, when the skill has another.
 *
 * How a task in breadth is counted - it never moves the level - is the rule of `recordTask` (src/game/skills.ts).
 */
import type { Rng } from '../core/rng';
import { pick } from '../core/util';
import type { Save } from '../core/save';
import { LEVELS, WIDE, levelFor, statOf, type SkillId } from './skills';
import type { TaskType } from './tasks/types';

/** How many usual tasks of the top level solved cleanly in a row turn the tasks in breadth on. */
export const WIDE_FROM = 2;

/** The usual kind of task of each skill that has tasks in breadth: one in breadth takes the place of that kind only. */
const USUAL: Readonly<Record<keyof typeof WIDE, TaskType>> = { add: 'add', sub: 'sub' };
const usualOf = (skill: SkillId): TaskType | undefined => (USUAL as Partial<Record<SkillId, TaskType>>)[skill];
/** The kinds in breadth of a skill; none for a skill without them. */
export const wideKinds = (skill: SkillId): readonly TaskType[] => (WIDE as Partial<Record<SkillId, readonly TaskType[]>>)[skill] ?? [];

/** Whether the tasks in breadth of `skill` are on for this save now. */
export function wideOn(save: Save, skill: SkillId): boolean {
  return wideKinds(skill).length > 0 && levelFor(save, skill) === LEVELS[skill][1] && statOf(save, skill).streak >= WIDE_FROM;
}

/** The last task of a skill given through `mixWide`: whether it was one in breadth, and the last kind in breadth given. */
interface Turn { wide: boolean; kind: TaskType | null }
const turns = new WeakMap<Save, Map<SkillId, Turn>>();

/**
 * The type of the task to give where a task of `type` of `skill` was to be given: `type` itself, or a kind in breadth
 * in its place. Only the usual example of a skill is ever replaced (a step that plays another type of the skill, and a
 * skill without tasks in breadth, get `type` back and nothing is remembered). One draw of `rng` when a task in breadth
 * is given, none otherwise.
 */
export function mixWide(save: Save, skill: SkillId, type: TaskType, rng: Rng): TaskType {
  if (usualOf(skill) !== type) return type;
  let of = turns.get(save);
  if (!of) turns.set(save, of = new Map());
  const last = of.get(skill);
  if (!wideOn(save, skill) || last?.wide) { of.set(skill, { wide: false, kind: last?.kind ?? null }); return type; }
  const kinds = wideKinds(skill), other = kinds.filter((k) => k !== last?.kind);
  const kind = pick(other.length ? other : kinds, rng);
  of.set(skill, { wide: true, kind });
  return kind;
}
