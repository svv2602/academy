/**
 * The number house (LEARN-07): the number on the roof, and on each floor a pair of numbers that make it; one pane of
 * the whole house is empty, and the child picks the number hidden there. Level 4 of the composition of a number (the
 * ladder of docs/11-learning.md): roofs up to 10.
 */
import { randInt, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import { ladder, numberChoices, type Spec, type TaskModel } from './types';

export interface HouseBody {
  /** The number on the roof. */
  roof: number;
  /** The floors from the top: two numbers each, together the roof. */
  floors: [number, number][];
  /** The one empty pane: its floor (from the top) and its side (0 left, 1 right). */
  gap: { floor: number; side: 0 | 1 };
  options: number[];
  /** The number of the empty pane. */
  answer: number;
}
export type HouseSpec = Spec<'house', HouseBody>;

/** The roofs of the house and how many floors it has. */
export const ROOF = [4, 10] as const, FLOORS = 3;

export function generate(level: number, rng: Rng): HouseSpec {
  const roof = randInt(ROOF[0], ROOF[1], rng);
  // Three different pairs, no zero: three different left numbers out of 1..roof-1.
  const lefts = shuffle(Array.from({ length: roof - 1 }, (_, i) => i + 1), rng).slice(0, FLOORS);
  const floors = lefts.map((a): [number, number] => [a, roof - a]);
  const gap = { floor: randInt(0, FLOORS - 1, rng), side: randInt(0, 1, rng) as 0 | 1 };
  const answer = floors[gap.floor][gap.side];
  return {
    type: 'house', level, prompt: 't_house',
    hint: ladder('h1_house', { key: 'h2_house', steps: [{ do: 'countUp' }] }),
    body: { roof, floors, gap, options: numberChoices(rng, answer, roof), answer },
  };
}

export const house: TaskModel<HouseSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
