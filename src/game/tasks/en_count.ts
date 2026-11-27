/**
 * "How many? - let's count!" in English (Season 2, step 2, part D1): the task of "count" with 1-5 things - the numbers
 * the book has recorded (wordbook §1: one…five) - its answers the digits 1-5. The question and the hint are the cat's
 * recorded lines of "count" (no new line: the lead's decision 2026-11-27); every number is said in English: a thing
 * tapped, the count of the hint, the answer given (./../taskviews/en_count.ts).
 */
import { pick, randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import type { WordId } from '../../s2/types';
import { THINGS, ladder, tilts, type Spec, type TaskModel } from './types';
import type { CountBody } from './count';

export type EnCountSpec = Spec<'en_count', CountBody>;

/** The numbers said in English, 1-5 (the words of the book). */
export const EN_NUMBERS = ['one', 'two', 'three', 'four', 'five'] as const satisfies readonly WordId[];
export const TOP = EN_NUMBERS.length;
/** The clip of number `n` (1..5); null above. */
export const numberClip = (n: number): string | null => (n >= 1 && n <= TOP ? `wb_w_${EN_NUMBERS[n - 1]}` : null);
/** The fewest and the most things of a level. */
export const RANGE = (level: number): [number, number] => (level <= 1 ? [1, 3] : level === 2 ? [2, 4] : [3, 5]);
export const OPTIONS = [1, 2, 3, 4, 5];

export function generate(level: number, rng: Rng): EnCountSpec {
  const n = randInt(...RANGE(level), rng);
  const thing = pick(THINGS, rng);
  return {
    type: 'en_count', level, prompt: 't_count',
    hint: ladder('h1_count', { key: 'h_count', steps: [{ do: 'countAloud', which: 'all' }] }),
    body: { thing, n, tilt: tilts(n, rng), options: [...OPTIONS], answer: n },
  };
}

export const en_count: TaskModel<EnCountSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
