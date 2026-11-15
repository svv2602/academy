/**
 * The ten task types as data (ARCH-09): one model per type, and `generate(type, level, rng)` for any of them.
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

export type * from './types';
/** The description of a task of any type; `type` tells which. */
export type TaskSpec = CountSpec | AddSpec | SubSpec | CompareSpec | PatternSpec | OddSpec | PairsSpec | OrderSpec | SortSpec | SimonSpec;
export type SpecOf<T extends TaskType> = Extract<TaskSpec, { type: T }>;

/** The model of every type: its generator, how it takes an input, its solution (and, for pairs, its result). */
export const MODELS = { count, add, sub, compare, pattern, odd, pairs, order, sort, simon } satisfies Record<TaskType, unknown>;

/** The description of a task of `type` for `level`; every random choice comes from `rng`, so one seed is one task. */
export function generate<T extends TaskType>(type: T, level: number, rng: Rng): SpecOf<T> {
  return MODELS[type].generate(level, rng) as SpecOf<T>;
}
