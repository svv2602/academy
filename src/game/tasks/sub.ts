/** Take away: of `total` things the last `gone` fade out, how many are left? Up to four numbers around the rest. */
import { pick, randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import { THINGS, numberChoices, tilts, type Spec, type TaskModel } from './types';

export interface SubBody {
  thing: string;
  total: number;
  /** How many of the things are gone: the last ones. */
  gone: number;
  /** One tilt per thing, `total` of them. */
  tilt: number[];
  options: number[];
  answer: number;
}
export type SubSpec = Spec<'sub', SubBody>;

/** The largest number of things of a level (a level above 3 is asked as the third). */
export const MAX = (level: number) => (level === 1 ? 5 : level === 2 ? 8 : 10);

export function generate(level: number, rng: Rng): SubSpec {
  const max = MAX(level);
  const total = randInt(3, max, rng), gone = randInt(1, total - 1, rng), thing = pick(THINGS, rng);
  const tilt = tilts(total, rng);
  const answer = total - gone;
  return {
    type: 'sub', level, prompt: 't_sub',
    hint: { key: 'h_left', steps: [{ do: 'countAloud', which: 'left' }, { do: 'pulseAnswer', fromMistake: 2 }] },
    body: { thing, total, gone, tilt, options: numberChoices(rng, answer, 10), answer },
  };
}

export const sub: TaskModel<SubSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
