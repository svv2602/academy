/**
 * "The second half" (WORLD-18, the turtle's ship door): the description. A shell lies open, one valve with half of a
 * pattern on it; beside it lie 2-4 valves, and the one that closes it is the mirror of its pattern across the hinge -
 * the figures at the same distance from the hinge and the same height. By the level of "Patterns" (only the figures
 * change, the hinge never does): two big coloured spots on 1-2, three figures on 3, four on 4 and five on 5 - and on
 * 4-5 one of the wrong valves is the same pattern turned round (turning as a task of its own comes later: the
 * customer's decision 2026-11-18). Every wrong valve differs from the mirror; no two valves are alike.
 *
 * The cells of a valve: COLS from the hinge outwards, ROWS from the bottom up. The show (later) draws the valve that
 * lies open with its cells mirrored, so that the right one looks the same pattern seen in a mirror.
 */
import { pick, randInt, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import { FIG_COLORS, FIG_SHAPES, type FigColor, type FigShape } from '../tasks/odd';

/** The cells of a valve: from the hinge outwards, from the bottom up. */
export const COLS = 3, ROWS = 3;

/** One figure of a pattern: its cell, its colour and its shape ('spot' - a big round spot of levels 1-2). */
export interface HalfFigure { col: number; row: number; color: FigColor; shape: FigShape | 'spot' }
export type HalfPattern = readonly HalfFigure[];

export interface HalfBody {
  /** The pattern on the valve that lies open. */
  given: HalfPattern;
  /** The valves beside it, in the order they lie; `answer` is the index of the one that closes it. */
  options: HalfPattern[];
  answer: number;
  /** On levels 4-5: the index of the wrong valve that is the pattern turned round, else -1. */
  turned: number;
}

/** "Patterns" by level: how many figures, how many valves to choose from, a turned one among them. */
export const HALF_BY_LEVEL: Readonly<Record<number, { figures: number; spots: boolean; options: number; turned: boolean }>> = {
  1: { figures: 2, spots: true, options: 2, turned: false },
  2: { figures: 2, spots: true, options: 3, turned: false },
  3: { figures: 3, spots: false, options: 3, turned: false },
  4: { figures: 4, spots: false, options: 4, turned: true },
  5: { figures: 5, spots: false, options: 4, turned: true },
};

const key = (p: HalfPattern) => [...p].map((f) => `${f.col}${f.row}${f.color}${f.shape}`).sort().join('|');
/** Two patterns are alike: the same figures in the same cells. */
export const alike = (a: HalfPattern, b: HalfPattern) => key(a) === key(b);
/** The pattern turned round on its valve (half a turn in its plane): the far cells come to the hinge, the top to the bottom. */
export const turned = (p: HalfPattern): HalfPattern => p.map((f) => ({ ...f, col: COLS - 1 - f.col, row: ROWS - 1 - f.row }));

function pattern(by: typeof HALF_BY_LEVEL[number], rng: Rng): HalfFigure[] {
  const cells = shuffle(Array.from({ length: COLS * ROWS }, (_, i) => i), rng).slice(0, by.figures);
  const colors = shuffle([...FIG_COLORS], rng);
  return cells.map((c, i) => ({
    col: c % COLS, row: Math.floor(c / COLS),
    color: by.spots ? colors[i] : pick(FIG_COLORS, rng),
    shape: by.spots ? 'spot' : pick(FIG_SHAPES, rng),
  }));
}

/** A wrong valve: the pattern with one figure changed - its colour, its shape (not of spots) or its cell. */
function changed(p: HalfPattern, spots: boolean, rng: Rng): HalfPattern {
  const out = p.map((f) => ({ ...f }));
  const f = out[randInt(0, out.length - 1, rng)];
  const how = pick(spots ? ['color', 'cell'] as const : ['color', 'shape', 'cell'] as const, rng);
  if (how === 'color') f.color = pick(FIG_COLORS.filter((c) => c !== f.color), rng);
  else if (how === 'shape') f.shape = pick(FIG_SHAPES.filter((s) => s !== f.shape), rng);
  else {
    const free = Array.from({ length: COLS * ROWS }, (_, i) => i).filter((c) => !out.some((g) => g.col === c % COLS && g.row === Math.floor(c / COLS)));
    const c = pick(free, rng);
    f.col = c % COLS; f.row = Math.floor(c / COLS);
  }
  return out;
}

export function generateHalfBody(level: number, rng: Rng): HalfBody {
  const by = HALF_BY_LEVEL[Math.min(5, Math.max(1, Math.round(level)))];
  let given = pattern(by, rng);
  // a turned pattern that looks the same as the mirror would be no wrong valve: draw again (at most a few times)
  for (let i = 0; by.turned && alike(turned(given), given) && i < 20; i++) given = pattern(by, rng);
  const options: HalfPattern[] = [given];
  if (by.turned) options.push(turned(given));
  for (let i = 0; options.length < by.options && i < 200; i++) {
    const w = changed(given, by.spots, rng);
    if (!options.some((o) => alike(o, w))) options.push(w);
  }
  const order = shuffle(options.map((_, i) => i), rng);
  return {
    given, options: order.map((i) => options[i]), answer: order.indexOf(0), turned: by.turned ? order.indexOf(1) : -1,
  };
}
