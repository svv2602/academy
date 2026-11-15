/** Add two groups of the same thing: a + b = ? The answer is picked from up to four numbers around the sum. */
import { pick, randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import { THINGS, numberChoices, tilts, type Spec, type TaskModel } from './types';

export interface AddBody {
  thing: string;
  a: number;
  b: number;
  /** One tilt per thing: the `a` things of the first group, then the `b` of the second. */
  tilt: number[];
  options: number[];
  answer: number;
}
export type AddSpec = Spec<'add', AddBody>;

/** The largest sum of a level (a level above 3 is asked as the third). */
export const MAX = (level: number) => (level === 1 ? 5 : level === 2 ? 8 : 10);

export function generate(level: number, rng: Rng): AddSpec {
  const max = MAX(level);
  const a = randInt(1, max - 1, rng), b = randInt(1, max - a, rng), thing = pick(THINGS, rng);
  const tilt = tilts(a + b, rng);
  const answer = a + b;
  return {
    type: 'add', level, prompt: 't_add',
    hint: { key: 'h_count', steps: [{ do: 'countAloud', which: 'all' }, { do: 'pulseAnswer', fromMistake: 2 }] },
    body: { thing, a, b, tilt, options: numberChoices(rng, answer, 10), answer },
  };
}

export const add: TaskModel<AddSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
