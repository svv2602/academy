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
import { neighbors, type NeighborsSpec } from './neighbors';
import { signs, type SignsSpec } from './signs';
import { diff, type DiffSpec } from './diff';
import { puzzle, type PuzzleSpec } from './puzzle';
import { sum3, type Sum3Spec } from './sum3';
import { gap, type GapSpec } from './gap';
import type { SkillId } from '../skills';

export type * from './types';
/** The description of a task of any type; `type` tells which. */
export type TaskSpec = CountSpec | AddSpec | SubSpec | CompareSpec | PatternSpec | OddSpec | PairsSpec | OrderSpec | SortSpec | SimonSpec
  | MissingSpec | HouseSpec | NeighborsSpec | SignsSpec | DiffSpec | PuzzleSpec | Sum3Spec | GapSpec;
export type SpecOf<T extends TaskType> = Extract<TaskSpec, { type: T }>;

/** The model of every type: its generator, how it takes an input, its solution (and, for pairs, its result). */
export const MODELS = { count, add, sub, compare, pattern, odd, pairs, order, sort, simon, missing, house, neighbors, signs, diff, puzzle, sum3, gap } satisfies Record<TaskType, unknown>;

/**
 * A step of a chain may name a skill instead of a task type (R34): the type is then the one the skill plays on the
 * level of the task. The composition of a number: the missing addend up to 10 on level 3, the number house on 4, the
 * missing addend up to 20 on 5 (the ladder of docs/11-learning.md). The number series: the neighbours of a number on
 * level 4 (LEARN-08), the numbers in order on the others. Comparing: the signs on level 5 (LEARN-09), the groups or
 * the digits on the others.
 */
export const BY_LEVEL = {
  compose: (level: number): TaskType => (level === 4 ? 'house' : 'missing'),
  series: (level: number): TaskType => (level === 4 ? 'neighbors' : 'order'),
  compare: (level: number): TaskType => (level === 5 ? 'signs' : 'compare'),
} satisfies Partial<Record<SkillId, (level: number) => TaskType>>;
export type SkillStep = keyof typeof BY_LEVEL;
export const isSkillStep = (step: string): step is SkillStep => Object.hasOwn(BY_LEVEL, step);
/**
 * A chain's step that names a task type whose skill plays another type on some levels (R34): the chains keep their
 * steps ("order" of the mushroom king) and their saved progress, and the step follows its skill's level.
 */
const STEP_SKILL: Partial<Record<TaskType, SkillStep>> = { order: 'series' };
/** The task type a chain's step plays on `level`: the step itself, or the type of its skill on that level. */
export function typeOf(step: TaskType | SkillStep, level: number): TaskType {
  const skill = isSkillStep(step) ? step : STEP_SKILL[step];
  return skill ? BY_LEVEL[skill](level) : (step as TaskType);
}

/** The description of a task of `type` for `level`; every random choice comes from `rng`, so one seed is one task. */
export function generate<T extends TaskType>(type: T, level: number, rng: Rng): SpecOf<T> {
  return MODELS[type].generate(level, rng) as SpecOf<T>;
}
