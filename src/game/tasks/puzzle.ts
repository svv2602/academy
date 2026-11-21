/**
 * The puzzle (LEARN-19): a frame of a story of the first world cut into pieces; the child drags each piece into its
 * place in the frame. The picture is a whole scene - sky, rainbow, gazebo, path - so the pieces are tied by their lines
 * and colours (the customer's word of 2026-11-21: «да, переключаем на кадры заставок»). A frame is 16:9; the puzzle
 * takes its middle 4:3 (PICTURE_CROP).
 *
 * The ladder (docs/11-learning.md, «Сборка картинки», changed by the customer on 2026-11-21: 2 x 2 was too easy at 6):
 *   1 - 6 pieces (3 x 2), a pale picture in the frame to go by;
 *   2 - 9 (3 x 3), the picture in the frame paler;
 *   3 - 12 (4 x 3), the frame empty;
 *   4 - 16 (4 x 4), a calm frame - much sky and grass, pieces alike;
 *   5 - 20 (5 x 4), a busy frame, some pieces turned: a touch turns a piece a quarter round.
 * The frames of a story she has not seen yet are not used (`setPuzzleSeen`): the crystal's story tells how the world
 * ends.
 *
 * Pieces alike: two pieces that look the same (sky, grass) are one to the child, so a piece dropped on the free cell
 * of a piece alike to it stays there, and that piece takes its cell instead (`alike`, given by the view, which compares
 * the cells of the picture drawn). A piece dropped anywhere else, or turned wrong, goes back - no mistake (LEARN-14);
 * the hints come with time.
 */
import { pick, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import type { Outcome, Spec, TaskModel } from './types';

/**
 * The frames of the first world's stories (public/story/<id>.webp, src/worlds/fairy/story.ts) the puzzle takes: the
 * story each belongs to, and whether it is calm (much sky and grass, pieces alike - level 4) or busy (level 5).
 */
export const PUZZLE_PICTURES = [
  { id: 'w1_intro_1', story: 'story_intro', calm: true },
  { id: 'w1_intro_2', story: 'story_intro', calm: true },
  { id: 'w1_intro_3', story: 'story_intro', calm: false },
  { id: 'w1_intro_4', story: 'story_intro', calm: true },
  { id: 'w1_intro_5', story: 'story_intro', calm: false },
  { id: 'w1_crystal_1', story: 'story_crystal', calm: false },
  { id: 'w1_crystal_2', story: 'story_crystal', calm: false },
  { id: 'w1_crystal_3', story: 'story_crystal', calm: false },
] as const;
export type PuzzlePicture = typeof PUZZLE_PICTURES[number]['id'];
/** The stories whose frames may be used before she has seen them: the beginning tells nothing away. */
const OPEN_STORIES: readonly string[] = ['story_intro'];
/** The size of a frame (px) and the middle 4:3 the puzzle takes of it. */
export const PICTURE_SIZE = { w: 960, h: 536 } as const;
export const PICTURE_CROP = { x: Math.round((PICTURE_SIZE.w - PICTURE_SIZE.h * 4 / 3) / 2), w: Math.round(PICTURE_SIZE.h * 4 / 3), h: PICTURE_SIZE.h } as const;

let seen: (story: string) => boolean = () => false;
/** Tells the generator which stories she has seen (the game, from the save); returns the undo. */
export function setPuzzleSeen(fn: (story: string) => boolean): () => void {
  seen = fn;
  return () => { seen = () => false; };
}
/** The frames she may get now. */
export const openPictures = () => PUZZLE_PICTURES.filter((p) => OPEN_STORIES.includes(p.story) || seen(p.story));

/** The cut and the frame of each level. `guide`: how strongly the picture shows in the frame (0 - not at all). */
export const PUZZLE_LEVELS: Record<number, { cols: number; rows: number; guide: number; pictures: 'any' | 'calm' | 'busy'; turn: boolean }> = {
  1: { cols: 3, rows: 2, guide: 0.45, pictures: 'any', turn: false },
  2: { cols: 3, rows: 3, guide: 0.25, pictures: 'any', turn: false },
  3: { cols: 4, rows: 3, guide: 0, pictures: 'any', turn: false },
  4: { cols: 4, rows: 4, guide: 0, pictures: 'calm', turn: false },
  5: { cols: 5, rows: 4, guide: 0, pictures: 'busy', turn: true },
};
export const levelOf = (level: number) => PUZZLE_LEVELS[Math.min(5, Math.max(1, level))];

export interface PuzzleBody {
  /** The frame cut (PUZZLE_PICTURES). */
  picture: PuzzlePicture;
  cols: number; rows: number; guide: number;
  /** The pieces in the order they lie scattered: each the number of its cell (row by row) and its quarter turns (0-3). */
  pieces: { cell: number; turn: number }[];
}
export type PuzzleSpec = Spec<'puzzle', PuzzleBody>;

export function generate(level: number, rng: Rng): PuzzleSpec {
  const L = levelOf(level);
  const open = openPictures(), kind = open.filter((p) => L.pictures === 'any' || p.calm === (L.pictures === 'calm'));
  const picture = pick(kind.length ? kind : open, rng).id;
  const n = L.cols * L.rows;
  const order = shuffle(Array.from({ length: n }, (_, i) => i), rng);
  // on the top level a third to a half of the pieces lie turned, never all of them
  const turned = L.turn ? new Set(shuffle([...order], rng).slice(0, Math.max(1, Math.min(n - 1, Math.round(n * (0.33 + rng() * 0.17)))))) : new Set<number>();
  const pieces = order.map((cell) => ({ cell, turn: turned.has(cell) ? 1 + Math.floor(rng() * 3) : 0 }));
  return { type: 'puzzle', level, prompt: 't_puzzle', hint: null, body: { picture, cols: L.cols, rows: L.rows, guide: L.guide, pieces } };
}

/**
 * The state, by the index of a piece in `pieces`: where it is now (null - scattered), its turn now, and the cell it
 * belongs to now (its own, until a piece alike to it took that one); `alike` - the group of each cell (cells of one
 * group look the same; each cell its own group until the view tells, `setAlike`).
 */
export interface PuzzleState { placed: (number | null)[]; turn: number[]; home: number[]; alike: number[] }
/** An input: a piece turned a quarter round, or dropped on a cell (null - off the frame). */
export type PuzzleInput = { piece: number; turn: true } | { piece: number; cell: number | null };

/** The groups of the cells alike (`groups[cell]` - its group); a piece placed keeps its cell. */
export function setAlike(st: PuzzleState, groups: readonly number[]): void {
  if (groups.length === st.alike.length) st.alike = [...groups];
}

export const puzzle: TaskModel<PuzzleSpec, PuzzleState, PuzzleInput> = {
  generate,
  start: (s) => ({ placed: s.body.pieces.map(() => null), turn: s.body.pieces.map((p) => p.turn), home: s.body.pieces.map((p) => p.cell), alike: s.body.pieces.map((_, i) => i) }),
  answer(s, st, input): Outcome {
    const p = input.piece;
    if (p < 0 || p >= s.body.pieces.length || st.placed[p] !== null) return 'ignored';
    if ('turn' in input) { st.turn[p] = (st.turn[p] + 1) % 4; return 'ignored'; }
    const to = input.cell, home = st.home[p];
    if (to === null || st.turn[p] !== 0) return 'miss';
    if (to !== home) {
      // the free cell of a piece alike to it: it stays there, and that piece takes its cell
      const other = st.home.findIndex((c, q) => c === to && st.placed[q] === null);
      if (other < 0 || st.alike[to] !== st.alike[home]) return 'miss';
      st.home[other] = home; st.home[p] = to;
    }
    st.placed[p] = to;
    return st.placed.every((c) => c !== null) ? 'right' : 'step';
  },
  solution: (s, st) => s.body.pieces.flatMap((_, i): PuzzleInput[] => {
    if (st.placed[i] !== null) return [];
    const turns = (4 - st.turn[i]) % 4;
    return [...Array.from({ length: turns }, (): PuzzleInput => ({ piece: i, turn: true })), { piece: i, cell: st.home[i] }];
  }),
};
