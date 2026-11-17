/**
 * The neighbours of a number (LEARN-08): a piece of the number track, five numbers in a row up to 20, with one cell
 * empty right before or right after the marked number. "Which number stands before / after this one?" The child picks
 * the number of the empty cell. Level 4 of the number series (the ladder of docs/11-learning.md); the type is the same
 * on every level, the series plays it on its 4 only (`BY_LEVEL` of `tasks/index.ts`).
 */
import { randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import { inBank, ladder, numberChoices, type Spec, type TaskModel } from './types';

export interface NeighborsBody {
  /** The numbers of the cells, from the left: one after another. */
  cells: number[];
  /** The marked number the question is about. */
  n: number;
  /** The question: true - "which number stands before it?", false - "after it?". */
  before: boolean;
  /** The empty cell (an index of `cells`): right before the marked one, or right after it. */
  gap: number;
  options: number[];
  /** The number of the empty cell: `n - 1` or `n + 1`. */
  answer: number;
}
export type NeighborsSpec = Spec<'neighbors', NeighborsBody>;

/** How many cells the piece of the track has, and the largest number on it (up to 20, LEARN-05). */
export const CELLS = 5, TOP = 20;

export function generate(level: number, rng: Rng): NeighborsSpec {
  const before = rng() < 0.5;
  // "Before" asks about 3..20 (2 would leave nothing to count before its empty cell), "after" about 1..19.
  const n = before ? randInt(3, TOP, rng) : randInt(1, TOP - 1, rng);
  const answer = before ? n - 1 : n + 1;
  // At least one number is left of the empty cell: the hint counts from the start of the piece up to it. The marked
  // number stays on the piece, and the piece stays within 1..TOP.
  const places = Array.from({ length: CELLS - 1 }, (_, i) => i + 1)
    .filter((g) => (before ? g + 1 < CELLS : true) && answer - g >= 1 && answer - g + CELLS - 1 <= TOP);
  const gap = places[randInt(0, places.length - 1, rng)];
  const start = answer - gap;
  // Answer numbers around the answer within 1..TOP (never 0: the track starts at 1).
  const options = numberChoices(rng, answer - 1, TOP - 1).map((v) => v + 1);
  // The bank has "before" and "after" for 2..19 (src/ui/strings-bank.ts); `inBank` checks the key against its table.
  const ask = inBank(before ? `q_before_${n}` : `q_after_${n}`);
  return {
    type: 'neighbors', level, prompt: before ? 't_before' : 't_after', ask,
    hint: ladder('h1_neighbors', { key: 'h2_neighbors', steps: [{ do: 'countCells' }] }),
    body: { cells: Array.from({ length: CELLS }, (_, i) => start + i), n, before, gap, options, answer },
  };
}

export const neighbors: TaskModel<NeighborsSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
