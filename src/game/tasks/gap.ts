/**
 * The missing number of a take away (LEARN-27, a task in breadth): "13 − ? = 6" - there were 13 things, 6 are left,
 * how many were taken away? There were 11..20, 2..9 of them are gone. The number that is asked is always the one taken
 * away: the question and both lines of the hint speak of the things taken away, and an example with the first number
 * missing ("? − 5 = 8") would need lines of its own.
 *
 * The numbers do not follow the level: the task is given on the top level of take away only (src/game/wide.ts), and
 * the level it is asked with is kept in the description as it is.
 */
import { pick, randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import { THINGS, ladder, numberChoices, tilts, type Spec, type TaskModel } from './types';

export interface GapBody {
  thing: string;
  /** How many things there were: the number before "−". */
  total: number;
  /** How many are left: the number after "=". */
  left: number;
  /** One tilt per thing, `total` of them. */
  tilt: number[];
  options: number[];
  /** total - left: how many were taken away. */
  answer: number;
}
export type GapSpec = Spec<'gap', GapBody>;

/** The fewest and the most things there were, and the fewest and the most of them taken away. */
export const TOTAL = [11, 20] as const, GONE = [2, 9] as const;

export function generate(level: number, rng: Rng): GapSpec {
  const total = randInt(TOTAL[0], TOTAL[1], rng), gone = randInt(GONE[0], GONE[1], rng);
  return example(level, total, total - gone, rng);
}

/**
 * The task "total − ? = left" for numbers already chosen (the generator; the walkthrough's own entry). The rest - the
 * things, their tilts, the choices - comes from `rng` in the order the generator draws it.
 */
export function example(level: number, total: number, left: number, rng: Rng): GapSpec {
  const thing = pick(THINGS, rng);
  const tilt = tilts(total, rng), answer = total - left;
  return {
    type: 'gap', level, prompt: 't_gap',
    hint: ladder('h1_gap', { key: 'h2_gap', steps: [{ do: 'countGone' }] }),
    body: { thing, total, left, tilt, options: numberChoices(rng, answer, TOTAL[1]), answer },
  };
}

export const gap: TaskModel<GapSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
