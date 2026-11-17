/**
 * The missing addend (LEARN-06): "3 + ? = 7" - the known addend as things, the sum as a number; the child picks how
 * many are missing. The composition of a number has levels 3 to 5 (the ladder of docs/11-learning.md): up to 10 on
 * level 3 (and on 4, which plays the number house in a chain), up to 20 across the ten on level 5 (8 + ? = 13).
 */
import { pick, randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import { THINGS, ladder, numberChoices, tilts, type Spec, type TaskModel } from './types';

export interface MissingBody {
  thing: string;
  /** The known addend, drawn as things. */
  a: number;
  /** The number after "=". */
  sum: number;
  /** One tilt per thing of the known addend. */
  tilt: number[];
  options: number[];
  /** sum - a: how many are missing. */
  answer: number;
}
export type MissingSpec = Spec<'missing', MissingBody>;

/** The largest sum of a level: 10 up to level 4, 20 from level 5. */
export const MAX = (level: number) => (level >= 5 ? 20 : 10);

/**
 * The known addend and the sum. Up to level 4: a sum of 3..10 and a known addend that leaves at least one missing.
 * Level 5 and up: one-digit numbers across the ten, as the sums of "add" on level 5 (8 + ? = 13, the sum 11..18).
 */
function numbers(level: number, rng: Rng): [a: number, sum: number] {
  if (level >= 5) { const a = randInt(2, 9, rng); return [a, a + randInt(11 - a, 9, rng)]; }
  const sum = randInt(3, MAX(level), rng);
  return [randInt(1, sum - 1, rng), sum];
}

export function generate(level: number, rng: Rng): MissingSpec {
  const [a, sum] = numbers(level, rng);
  return example(level, a, sum, rng);
}

/**
 * The task "a + ? = sum" of `level` for numbers already chosen: by the generator, or by the planner when it brings
 * back an example with a mistake (LEARN-11, src/game/planner.ts). The rest comes from `rng` in the generator's order.
 */
export function example(level: number, a: number, sum: number, rng: Rng): MissingSpec {
  const thing = pick(THINGS, rng);
  const tilt = tilts(a, rng), answer = sum - a;
  // Rung 1 says the way: count on from the number that is there; across the ten - first up to ten (HINTS.md).
  return {
    type: 'missing', level, prompt: 't_missing',
    hint: ladder(sum > 10 ? 'h1_missing_ten' : 'h1_missing', { key: 'h2_missing', steps: [{ do: 'countUp' }] }),
    body: { thing, a, sum, tilt, options: numberChoices(rng, answer, MAX(level)), answer },
  };
}

export const missing: TaskModel<MissingSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
