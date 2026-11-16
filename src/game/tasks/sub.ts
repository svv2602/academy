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

/** The largest number of things of a level: 5, 8, 10, then 20 (a level above 5 is asked as the fifth, decision Q5). */
export const MAX = (level: number) => (level === 1 ? 5 : level === 2 ? 8 : level === 3 ? 10 : 20);

/**
 * How many things and how many of them go (the ladder of docs/11-learning.md). Levels 1-3: of 3..5, 8, 10 things at
 * least one goes and one stays, so "1 - 1" never comes (LEARN-13). Level 4: up to 20 without crossing the ten -
 * of 11..19 at most the ones go (17 - 4). Level 5 and up: of 11..18 more than the ones go, 2..9 of them (13 - 6).
 */
function numbers(level: number, rng: Rng): [number, number] {
  if (level === 4) { const total = randInt(11, 19, rng); return [total, randInt(1, total - 10, rng)]; }
  if (level >= 5) { const total = randInt(11, 18, rng); return [total, randInt(total - 9, 9, rng)]; }
  const total = randInt(3, MAX(level), rng);
  return [total, randInt(1, total - 1, rng)];
}

export function generate(level: number, rng: Rng): SubSpec {
  const [total, gone] = numbers(level, rng), thing = pick(THINGS, rng);
  const tilt = tilts(total, rng);
  const answer = total - gone;
  return {
    type: 'sub', level, prompt: 't_sub',
    hint: { key: 'h_left', steps: [{ do: 'countAloud', which: 'left' }, { do: 'pulseAnswer', fromMistake: 2 }] },
    body: { thing, total, gone, tilt, options: numberChoices(rng, answer, level <= 3 ? 10 : 20), answer },
  };
}

export const sub: TaskModel<SubSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
