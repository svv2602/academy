/**
 * The signs (LEARN-09): two numbers up to 20 and the empty place between them; the child puts the sign `>`, `<` or `=`.
 * Level 5 of comparing (the ladder of docs/11-learning.md); the type is the same on every level, the skill plays it on
 * its 5 only (`BY_LEVEL` of `tasks/index.ts`). Equal numbers come up.
 */
import { pick, randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import { THINGS, ladder, type Spec, type TaskModel } from './types';

/** The sign between two numbers, as the child puts it: the open side faces the larger number. */
export type Sign = '>' | '<' | '=';
/** The three sign buttons, always in this order. */
export const SIGNS: readonly Sign[] = ['>', '<', '='];
export interface SignsBody {
  /** The two numbers, left and right of the empty place of the sign. */
  a: number;
  b: number;
  /** What the hint lays the numbers out as: one thing for both. */
  thing: string;
  options: readonly Sign[];
  answer: Sign;
}
export type SignsSpec = Spec<'signs', SignsBody>;

/** The largest number of the signs (up to 20, as level 4 of comparing), and how often the two numbers are the same. */
export const SIGNS_MAX = 20, SAME = 0.25;
export const signOf = (a: number, b: number): Sign => (a > b ? '>' : a < b ? '<' : '=');

export function generate(level: number, rng: Rng): SignsSpec {
  const a = randInt(1, SIGNS_MAX, rng);
  // Equal numbers come up (the sign "="), otherwise the second is any other number of 1..20.
  let b = a;
  if (rng() >= SAME) { b = randInt(1, SIGNS_MAX - 1, rng); if (b >= a) b++; }
  const thing = pick(THINGS, rng);
  return {
    type: 'signs', level, prompt: 't_signs',
    // Rung 2 (R13: "the hint shows both numbers as things"): both numbers in ten frames, matched in pairs.
    hint: ladder('h1_signs', { key: 'h2_signs', steps: [{ do: 'pairUp' }] }),
    body: { a, b, thing, options: SIGNS, answer: signOf(a, b) },
  };
}

export const signs: TaskModel<SignsSpec, null, Sign> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
