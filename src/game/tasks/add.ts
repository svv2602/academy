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

/** The largest sum of a level: 5, 8, 10, then 20 (a level above 5 is asked as the fifth, decision Q5). */
export const MAX = (level: number) => (level === 1 ? 5 : level === 2 ? 8 : level === 3 ? 10 : 20);

/**
 * The two numbers of a level (the ladder of docs/11-learning.md). Levels 1-3: a + b up to 5, 8, 10; from level 2 never
 * 1 + 1 (LEARN-13: such a pair is drawn again, so every other pair keeps the draws of before). Level 4: up to 20 without
 * crossing the ten - a ten and some (10..18) plus a one-digit number whose ones still fit (12 + 5). Level 5 and up: two
 * one-digit numbers that cross the ten (8 + 5), the sum 11..18.
 */
function numbers(level: number, rng: Rng): [number, number] {
  if (level === 4) { const a = randInt(10, 18, rng); return [a, randInt(1, 19 - a, rng)]; }
  if (level >= 5) { const a = randInt(2, 9, rng); return [a, randInt(11 - a, 9, rng)]; }
  const max = MAX(level);
  for (;;) {
    const a = randInt(1, max - 1, rng), b = randInt(1, max - a, rng);
    if (level < 2 || a !== 1 || b !== 1) return [a, b];
  }
}

export function generate(level: number, rng: Rng): AddSpec {
  const [a, b] = numbers(level, rng), thing = pick(THINGS, rng);
  const tilt = tilts(a + b, rng);
  const answer = a + b;
  return {
    type: 'add', level, prompt: 't_add',
    hint: { key: 'h_count', steps: [{ do: 'countAloud', which: 'all' }, { do: 'pulseAnswer', fromMistake: 2 }] },
    body: { thing, a, b, tilt, options: numberChoices(rng, answer, level <= 3 ? 10 : 20), answer },
  };
}

export const add: TaskModel<AddSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
