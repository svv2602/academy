/** The odd one out: things of one group and one thing of another, which does not belong? The answer is its index. */
import { pick, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import { ladder, type Spec, type TaskModel } from './types';

export interface OddBody {
  /** The things in the order shown: pictures on levels 1-3, figures (`figure()` keys) on levels 4-5. */
  things: string[];
  /** The index of the thing from the other group. */
  answer: number;
}
export type OddSpec = Spec<'odd', OddBody>;

/** Groups of things that belong together; the odd one is always taken from another group. */
export const GROUPS = [['🍎', '🍐', '🍊', '🍋', '🍓', '🍇'], ['🐱', '🐶', '🐰', '🦊', '🐻', '🐼'], ['🌸', '🌼', '🌷', '🌻', '🌹', '💐'], ['🚗', '🚌', '🚲', '🚀', '⛵', '🚂'], ['🍰', '🍭', '🍩', '🍪', '🍫', '🧁']];

// ---------- figures: a colour, a shape and a size, shared by "odd", "pattern" and "sort" from level 4 on ----------

export const FIG_COLORS = ['red', 'blue', 'yellow', 'green'] as const;
export const FIG_SHAPES = ['circle', 'triangle', 'square'] as const;
export type FigColor = typeof FIG_COLORS[number];
export type FigShape = typeof FIG_SHAPES[number];
export interface Figure { color: FigColor; shape: FigShape; small: boolean }
/** The key of a figure: "red circle", "blue square small" - also the class names of its gem and basket in "sort". */
export const figure = (color: FigColor, shape: FigShape, small = false) => `${color} ${shape}${small ? ' small' : ''}`;
export const figureOf = (key: string): Figure => {
  const [color, shape, size] = key.split(' ');
  return { color: color as FigColor, shape: shape as FigShape, small: size === 'small' };
};

/**
 * Level 4, "odd by a feature" (shape or size): one colour for all, four figures alike, the fifth differs in the shape
 * alone or in the size alone. Level 5, "two features": two figures of colour A and shape X, two of colour B and shape Y,
 * and one of A and Y (or B and X) - no colour and no shape is alone, only the fifth has no twin in both at once.
 */
function figures(level: number, rng: Rng) {
  const [c1, c2] = shuffle([...FIG_COLORS], rng), [s1, s2] = shuffle([...FIG_SHAPES], rng);
  if (level === 4) {
    if (pick(['shape', 'size'] as const, rng) === 'shape') return { base: Array(4).fill(figure(c1, s1)), odd: figure(c1, s2) };
    const small = pick([false, true], rng);
    return { base: Array(4).fill(figure(c1, s1, small)), odd: figure(c1, s1, !small) };
  }
  return { base: [figure(c1, s1), figure(c1, s1), figure(c2, s2), figure(c2, s2)], odd: pick([figure(c1, s2), figure(c2, s1)], rng) };
}

export function generate(level: number, rng: Rng): OddSpec {
  if (level >= 4) {
    const { base, odd } = figures(Math.min(level, 5), rng), things = shuffle([...base, odd], rng);
    return {
      type: 'odd', level, prompt: 't_odd',
      hint: ladder(level === 4 ? 'h1_odd_shape' : 'h1_odd_two', { key: 'h2_odd', steps: [{ do: 'frameAlike' }] }),
      body: { things, answer: things.indexOf(odd) },
    };
  }
  const [main, other] = shuffle(GROUPS, rng);
  // Level 1 is "the obvious odd one": three copies of one thing. From level 2 on nothing repeats.
  const base: string[] = level === 1 ? Array(3).fill(pick(main, rng)) : shuffle(main, rng).slice(0, level === 2 ? 3 : 4);
  const odd = pick(other, rng), things = shuffle([...base, odd], rng);
  return {
    type: 'odd', level, prompt: 't_odd',
    // The alike things share one frame, the odd one is left without: who belongs together is seen, not read.
    hint: ladder('h_odd', { key: 'h2_odd', steps: [{ do: 'frameAlike' }] }),
    body: { things, answer: things.indexOf(odd) },
  };
}

export const odd: TaskModel<OddSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
