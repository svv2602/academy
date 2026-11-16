/**
 * Count the things: how many are there? Levels 1-3: up to 10, the answer picked from the numbers 1..10. Levels 4-5
 * (LEARN-05, the ladder of docs/11-learning.md): 11-15 and 16-20 things, shown in ten frames, the answer picked from up
 * to four numbers around it within 0..20.
 */
import { pick, randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import { THINGS, numberChoices, tilts, type Spec, type TaskModel } from './types';

export interface CountBody {
  thing: string;
  n: number;
  /** One tilt per thing, degrees. */
  tilt: number[];
  options: number[];
  answer: number;
}
export type CountSpec = Spec<'count', CountBody>;

export const OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
/** The fewest and the most things of a level (a level above 5 is asked as the fifth, decision Q5). */
export const RANGE = (level: number): [number, number] =>
  (level === 1 ? [3, 6] : level === 2 ? [5, 9] : level === 3 ? [7, 10] : level === 4 ? [11, 15] : [16, 20]);
/** The largest answer of the ladder. */
export const TOP = 20;

export function generate(level: number, rng: Rng): CountSpec {
  const n = randInt(...RANGE(level), rng);
  const thing = pick(THINGS, rng);
  const tilt = tilts(n, rng);
  // levels 1-3 keep their ten buttons and draw nothing more, so one seed still gives the tasks of before
  const options = level <= 3 ? [...OPTIONS] : numberChoices(rng, n, TOP);
  return {
    type: 'count', level, prompt: 't_count',
    hint: { key: 'h_count', steps: [{ do: 'countAloud', which: 'all' }, { do: 'pulseAnswer', fromMistake: 2 }] },
    body: { thing, n, tilt, options, answer: n },
  };
}

export const count: TaskModel<CountSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
