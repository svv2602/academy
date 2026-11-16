/**
 * Two groups: where are more (or fewer) things? The answer is the index of a group, 0 or 1.
 * Levels 1-3 draw the groups as things; from level 4 the two numbers are written as digits, up to 20 (LEARN-05).
 * Level 5 (the signs `>`, `<`, `=`, LEARN-09) is not made yet and is level 4 until then.
 */
import { pick, randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import { THINGS, tilts, type Spec, type TaskModel } from './types';

export interface CompareBody {
  thing: string;
  groups: [number, number];
  /** One tilt per thing of each group; empty when the groups are digits. */
  tilt: [number[], number[]];
  /** The groups are written as numbers, without things (level 4 and up). */
  digits: boolean;
  /** The question: true - "where are more?", false - "where are fewer?". */
  more: boolean;
  answer: 0 | 1;
}
export type CompareSpec = Spec<'compare', CompareBody>;

/** The largest group of a level and the smallest difference between the groups; digits from level 4. */
export const MAX = (level: number) => (level === 1 ? 5 : level === 2 ? 8 : level === 3 ? 10 : 20);
export const DIGITS = (level: number) => level >= 4;
export const GAP = (level: number) => (level === 1 ? 2 : 1);

export function generate(level: number, rng: Rng): CompareSpec {
  const max = MAX(level), gap = GAP(level);
  const a = randInt(1, max, rng);
  let b = randInt(1, max, rng);
  while (Math.abs(a - b) < gap) b = randInt(1, max, rng);
  // The first level always asks "more", and draws nothing for it.
  const more = level === 1 || rng() < 0.6;
  const thing = pick(THINGS, rng);
  const digits = DIGITS(level);
  const tilt: [number[], number[]] = digits ? [[], []] : [tilts(a, rng), tilts(b, rng)];
  const answer = (a > b) === more ? 0 : 1;
  return {
    type: 'compare', level, prompt: more ? 't_compare_more' : 't_compare_less',
    hint: { key: 'h_compare', steps: [{ do: 'showNumbers' }, { do: more ? 'grow' : 'shrink' }, { do: 'pulseAnswer', fromMistake: 2 }] },
    body: { thing, groups: [a, b], tilt, digits, more, answer },
  };
}

export const compare: TaskModel<CompareSpec, null, 0 | 1> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
