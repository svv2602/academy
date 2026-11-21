/**
 * The puzzle (LEARN-19): a picture of a glade cut into pieces; the child drags each piece into its place in the frame.
 * The picture is the glade of "find the differences" (./diff.ts things, drawn by src/game/taskviews/diff-scene.ts):
 * the generator lays out its things, cuts it into COLS x ROWS pieces, scatters them and, on the top level, turns some.
 *
 * The ladder (docs/11-learning.md, «Сборка картинки», changed by the customer on 2026-11-21: 2 x 2 was too easy at 6):
 *   1 - 6 pieces (3 x 2), a bright full glade, a pale picture in the frame to go by;
 *   2 - 9 (3 x 3), the picture in the frame paler;
 *   3 - 12 (4 x 3), the frame empty;
 *   4 - 16 (4 x 4), a calmer glade - fewer things, more grass and sky, pieces alike;
 *   5 - 20 (5 x 4), some pieces turned: a touch turns a piece a quarter round.
 * A piece dropped anywhere but its place, or turned wrong, goes back - no mistake (LEARN-14); the hints come with time.
 */
import { pick, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import { COLS as GLADE_COLS, DIFF_COLORS, PROPS, ROWS as GLADE_ROWS, type DiffThing } from './diff';
import type { Outcome, Spec, TaskModel } from './types';

/** The cut and the frame of each level. `guide`: how strongly the picture shows in the frame (0 - not at all). */
export const PUZZLE_LEVELS: Record<number, { cols: number; rows: number; guide: number; calm: boolean; turn: boolean }> = {
  1: { cols: 3, rows: 2, guide: 0.45, calm: false, turn: false },
  2: { cols: 3, rows: 3, guide: 0.25, calm: false, turn: false },
  3: { cols: 4, rows: 3, guide: 0, calm: false, turn: false },
  4: { cols: 4, rows: 4, guide: 0, calm: true, turn: false },
  5: { cols: 5, rows: 4, guide: 0, calm: false, turn: true },
};
export const levelOf = (level: number) => PUZZLE_LEVELS[Math.min(5, Math.max(1, level))];

export interface PuzzleBody {
  /** The glade drawn (the things of its slots; a calm glade leaves some slots empty: `prop` none is not drawn). */
  things: DiffThing[];
  cols: number; rows: number; guide: number;
  /** The pieces in the order they lie scattered: each the number of its cell (row by row) and its quarter turns (0-3). */
  pieces: { cell: number; turn: number }[];
}
export type PuzzleSpec = Spec<'puzzle', PuzzleBody>;

export function generate(level: number, rng: Rng): PuzzleSpec {
  const L = levelOf(level);
  const things: DiffThing[] = [];
  for (let row = 0; row < GLADE_ROWS; row++) {
    for (let col = 0; col < GLADE_COLS; col++) {
      const small = row === 2;
      // a calm glade: a third of the slots stay grass, and fewer kinds of things
      if (L.calm && rng() < 0.4) continue;
      const prop = L.calm ? PROPS[row][0] : pick(PROPS[row], rng);
      things.push({ col, row, prop, color: small ? Math.floor(rng() * DIFF_COLORS.length) : 0, n: small ? 1 + Math.floor(rng() * 3) : 1 });
    }
  }
  const n = L.cols * L.rows;
  const order = shuffle(Array.from({ length: n }, (_, i) => i), rng);
  // on the top level a third to a half of the pieces lie turned, never all of them
  const turned = L.turn ? new Set(shuffle([...order], rng).slice(0, Math.max(1, Math.min(n - 1, Math.round(n * (0.33 + rng() * 0.17)))))) : new Set<number>();
  const pieces = order.map((cell) => ({ cell, turn: turned.has(cell) ? 1 + Math.floor(rng() * 3) : 0 }));
  return { type: 'puzzle', level, prompt: 't_puzzle', hint: null, body: { things, cols: L.cols, rows: L.rows, guide: L.guide, pieces } };
}

/** The state: where each piece is now (null - scattered) and its turn now, by its index in `pieces`. */
export interface PuzzleState { placed: (number | null)[]; turn: number[] }
/** An input: a piece turned a quarter round, or dropped on a cell (null - off the frame). */
export type PuzzleInput = { piece: number; turn: true } | { piece: number; cell: number | null };

export const puzzle: TaskModel<PuzzleSpec, PuzzleState, PuzzleInput> = {
  generate,
  start: (s) => ({ placed: s.body.pieces.map(() => null), turn: s.body.pieces.map((p) => p.turn) }),
  answer(s, st, input): Outcome {
    const p = input.piece;
    if (p < 0 || p >= s.body.pieces.length || st.placed[p] !== null) return 'ignored';
    if ('turn' in input) { st.turn[p] = (st.turn[p] + 1) % 4; return 'ignored'; }
    // its own cell and the right way up: it stays; anything else - it goes back, no mistake
    if (input.cell !== s.body.pieces[p].cell || st.turn[p] !== 0) return 'miss';
    st.placed[p] = input.cell;
    return st.placed.every((c) => c !== null) ? 'right' : 'step';
  },
  solution: (s, st) => s.body.pieces.flatMap((piece, i): PuzzleInput[] => {
    if (st.placed[i] !== null) return [];
    const turns = (4 - st.turn[i]) % 4;
    return [...Array.from({ length: turns }, (): PuzzleInput => ({ piece: i, turn: true })), { piece: i, cell: piece.cell }];
  }),
};
