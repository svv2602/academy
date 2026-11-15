/** Count the things: how many are there? The answer is picked from the numbers 1..10. */
import { pick, randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import { THINGS, tilts, type Spec, type TaskModel } from './types';

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
/** The fewest and the most things of a level (a level above 3 is asked as the third). */
export const RANGE = (level: number): [number, number] => (level === 1 ? [3, 6] : level === 2 ? [5, 9] : [7, 10]);

export function generate(level: number, rng: Rng): CountSpec {
  const n = randInt(...RANGE(level), rng);
  const thing = pick(THINGS, rng);
  const tilt = tilts(n, rng);
  return {
    type: 'count', level, prompt: 't_count',
    hint: { key: 'h_count', steps: [{ do: 'countAloud', which: 'all' }, { do: 'pulseAnswer', fromMistake: 2 }] },
    body: { thing, n, tilt, options: [...OPTIONS], answer: n },
  };
}

export const count: TaskModel<CountSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
