/**
 * Find the differences (LEARN-18): two pictures of one glade side by side, the second differs from the first in a few
 * things; the child touches them on either picture. The glade is a grid of slots (COLS x ROWS) in the coordinates of the
 * picture (0..1 across and down): the back row holds the big things (trees, rocks), the middle one the bushes and stumps,
 * the front one the small things (mushrooms, flowers) - the view draws each thing so that its middle falls in its slot
 * (src/game/taskviews/diff.ts). A difference is one slot changed in the second picture: the thing swapped for another of
 * its size, its colour, or the number of things in its group. The touch zone of a difference is its slot, so two zones
 * never overlap.
 *
 * The ladder (docs/11-learning.md, «Внимательность»): 1 - two differences, big things swapped; 2 - three; 3 - three,
 * smaller (the front row); 4 - four, one of them in colour; 5 - five, one of them in the number of things.
 * A touch elsewhere takes nothing and is no mistake ('miss'); the hints come with time, not with mistakes (the view).
 */
import { pick, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import type { Outcome, Spec, TaskModel } from './types';

export const COLS = 4, ROWS = 3;
/** The things of a glade by the row they stand in (0 - back, 1 - middle, 2 - front). */
export const PROPS = [['tree', 'pine', 'rock'], ['bush', 'stump', 'fern'], ['mushrooms', 'flowers']] as const;
export type Prop = typeof PROPS[number][number];
/** The colours a thing of the front row may take (a mushroom's cap, a flower), by index. */
export const DIFF_COLORS = ['#e8453c', '#f2c230', '#9b5de5', '#4a90e2', '#ff8fb8'] as const;
export const MAX_GROUP = 4;

/** One thing of the glade: its slot, what it is, its colour (front row) and how many of it stand together (front row). */
export interface DiffThing { col: number; row: number; prop: Prop; color: number; n: number }
export type DiffKind = 'swap' | 'color' | 'count';
/** A difference: the thing `at` (its index) as the second picture shows it. */
export interface DiffChange { at: number; kind: DiffKind; to: DiffThing }
export interface DiffBody { things: DiffThing[]; changes: DiffChange[] }
export type DiffSpec = Spec<'diff', DiffBody>;

/** How many differences, in which row the swaps are, and which kinds besides the swaps, by level. */
const LEVELS: Record<number, { n: number; rows: readonly number[]; also: readonly DiffKind[] }> = {
  1: { n: 2, rows: [0, 1], also: [] },
  2: { n: 3, rows: [0, 1], also: [] },
  3: { n: 3, rows: [2], also: [] },
  4: { n: 4, rows: [1, 2], also: ['color'] },
  5: { n: 5, rows: [1, 2], also: ['count'] },
};
export const diffCount = (level: number) => LEVELS[Math.min(5, Math.max(1, level))].n;

/** The rectangle of a slot in the picture: x, y its top left corner, w, h its size (0..1). */
export const slotRect = (col: number, row: number) => ({ x: col / COLS, y: (row + 0.4) / (ROWS + 0.4), w: 1 / COLS, h: 1 / (ROWS + 0.4) });

export function generate(level: number, rng: Rng): DiffSpec {
  const L = LEVELS[Math.min(5, Math.max(1, level))];
  const things: DiffThing[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const small = row === 2;
      things.push({ col, row, prop: pick(PROPS[row], rng), color: small ? Math.floor(rng() * DIFF_COLORS.length) : 0, n: small ? 1 + Math.floor(rng() * 3) : 1 });
    }
  }
  const changes: DiffChange[] = [], used = new Set<number>();
  const free = (rows: readonly number[]) => shuffle(things.map((_, i) => i).filter((i) => !used.has(i) && rows.includes(things[i].row)), rng);
  // the kinds besides the swaps first (they need the front row), then the swaps
  for (const kind of L.also) {
    const i = free([2])[0], t = things[i];
    used.add(i);
    if (kind === 'color') changes.push({ at: i, kind, to: { ...t, color: (t.color + 1 + Math.floor(rng() * (DIFF_COLORS.length - 1))) % DIFF_COLORS.length } });
    else changes.push({ at: i, kind, to: { ...t, n: t.n >= MAX_GROUP ? t.n - 1 : t.n === 1 ? 2 : t.n + pick([-1, 1], rng) } });
  }
  while (changes.length < L.n) {
    const i = free(L.rows)[0], t = things[i];
    used.add(i);
    const others = PROPS[t.row].filter((p) => p !== t.prop);
    changes.push({ at: i, kind: 'swap', to: { ...t, prop: pick(others, rng) } });
  }
  changes.sort((a, b) => a.at - b.at);
  return { type: 'diff', level, prompt: 't_diff', hint: null, body: { things, changes } };
}

/** The second picture: the things of the first with the differences in. */
export const secondPicture = (b: DiffBody): DiffThing[] => b.things.map((t, i) => b.changes.find((c) => c.at === i)?.to ?? t);

/** The difference a touch at (x, y) of either picture meets (its index in `changes`), or null. */
export function diffAt(b: DiffBody, x: number, y: number): number | null {
  const k = b.changes.findIndex((c) => {
    const t = b.things[c.at], r = slotRect(t.col, t.row);
    return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  });
  return k < 0 ? null : k;
}

/** The state: which differences are found. */
export interface DiffState { found: boolean[] }
/** An input: a touch at (x, y) in the coordinates of a picture. */
export interface DiffInput { x: number; y: number }

export const diff: TaskModel<DiffSpec, DiffState, DiffInput> = {
  generate,
  start: (s) => ({ found: s.body.changes.map(() => false) }),
  answer(s, st, input): Outcome {
    const k = diffAt(s.body, input.x, input.y);
    if (k === null) return 'miss';
    if (st.found[k]) return 'ignored';
    st.found[k] = true;
    return st.found.every(Boolean) ? 'right' : 'step';
  },
  solution: (s, st) => s.body.changes.flatMap((c, k) => {
    if (st.found[k]) return [];
    const t = s.body.things[c.at], r = slotRect(t.col, t.row);
    return [{ x: r.x + r.w / 2, y: r.y + r.h / 2 }];
  }),
};
