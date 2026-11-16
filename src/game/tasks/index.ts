/**
 * The task types as data (ARCH-09): one model per type, and `generate(type, level, rng)` for any of them.
 * Pure like the generators: no page, no styles, no `Math` randomness.
 */
import type { Rng } from '../../core/rng';
import type { TaskType } from './types';
import { count, type CountSpec } from './count';
import { add, type AddSpec } from './add';
import { sub, type SubSpec } from './sub';
import { compare, type CompareSpec } from './compare';
import { pattern, type PatternSpec } from './pattern';
import { odd, type OddSpec } from './odd';
import { pairs, type PairsSpec } from './pairs';
import { order, type OrderSpec } from './order';
import { sort, type SortSpec } from './sort';
import { simon, type SimonSpec } from './simon';
import { missing, type MissingSpec } from './missing';
import { house, type HouseSpec } from './house';
import type { SkillId } from '../skills';

export type * from './types';
/** The description of a task of any type; `type` tells which. */
export type TaskSpec = CountSpec | AddSpec | SubSpec | CompareSpec | PatternSpec | OddSpec | PairsSpec | OrderSpec | SortSpec | SimonSpec
  | MissingSpec | HouseSpec;
export type SpecOf<T extends TaskType> = Extract<TaskSpec, { type: T }>;

/** The model of every type: its generator, how it takes an input, its solution (and, for pairs, its result). */
export const MODELS = { count, add, sub, compare, pattern, odd, pairs, order, sort, simon, missing, house } satisfies Record<TaskType, unknown>;

/**
 * A step of a chain may name a skill instead of a task type (R34): the type is then the one the skill plays on the
 * level of the task. The composition of a number: the missing addend up to 10 on level 3, the number house on 4, the
 * missing addend up to 20 on 5 (the ladder of docs/11-learning.md).
 */
export const BY_LEVEL = {
  compose: (level: number): TaskType => (level === 4 ? 'house' : 'missing'),
} satisfies Partial<Record<SkillId, (level: number) => TaskType>>;
export type SkillStep = keyof typeof BY_LEVEL;
export const isSkillStep = (step: string): step is SkillStep => Object.hasOwn(BY_LEVEL, step);
/** The task type a chain's step plays on `level`: the step itself, or the type of its skill on that level. */
export const typeOf = (step: TaskType | SkillStep, level: number): TaskType => (isSkillStep(step) ? BY_LEVEL[step](level) : step);

/** The description of a task of `type` for `level`; every random choice comes from `rng`, so one seed is one task. */
export function generate<T extends TaskType>(type: T, level: number, rng: Rng): SpecOf<T> {
  return MODELS[type].generate(level, rng) as SpecOf<T>;
}
