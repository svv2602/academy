/**
 * Continue the row: a unit of colours (AB, AAB, ABAC, ...) repeats, which colour comes next? Level 4 is a growing row
 * (one thing, two, three, ...: how many come next?), level 5 changes two features at once (the colour goes by one unit,
 * the shape by another: which figure comes next?).
 */
import { pick, randInt, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import { ladder, type Spec, type TaskModel } from './types';
import { FIG_COLORS, FIG_SHAPES, figure } from './odd';

export interface PatternBody {
  /**
   * The repeating unit, letters A, B, C for three different colours. Level 4: "grow"; level 5: the unit of the colour
   * and the unit of the shape, as "AB/ABC" (colour first).
   */
  unit: string;
  /**
   * The row as shown: two whole units and the start of the third; element i is letter `i % unit.length` of the unit.
   * Level 4: the groups of the row, each a string of one colour repeated (1, 2, 3, ... times); level 5: figure keys.
   */
  row: string[];
  /** The three choices, in the order of the buttons: colours, groups (level 4) or figure keys (level 5). */
  options: string[];
  answer: string;
}
export type PatternSpec = Spec<'pattern', PatternBody>;

/** The units of a level (levels 1-3; a level above 3 has rows of its own, see `generate`). */
export const UNITS = (level: number) => (level === 1 ? ['AB'] : level === 2 ? ['AAB', 'ABB', 'ABC'] : ['AABB', 'ABAC', 'ABCB', 'AABC']);
export const COLORS = ['🔴', '🔵', '🟡', '🟢', '🟣', '🟠'];
/** The units of the two features on level 5: one of them is AB, the other one of these - every 2 and every 3, never together. */
export const THREES = ['ABC', 'AAB', 'ABB'];

/** Level 4: groups of 1, 2 (, 3) of one colour; the next group has one more. The choices: one less, right, one more. */
function growing(rng: Rng) {
  const color = pick(COLORS, rng), groups = randInt(2, 3, rng);
  const group = (n: number) => color.repeat(n);
  const row = Array.from({ length: groups }, (_, i) => group(i + 1)), answer = group(groups + 1);
  return { unit: 'grow', row, answer, options: shuffle([group(groups), answer, group(groups + 2)], rng) };
}

/**
 * Level 5: the colour goes by a unit of 2 and the shape by a unit of 3 (or the other way round), six or seven figures
 * are shown. The choices: the right figure, the right shape in another colour of the row, the right colour in another
 * shape of the row - neither feature alone gives the answer.
 */
function twoFeatures(rng: Rng) {
  const three = pick(THREES, rng), [cu, su] = pick([true, false], rng) ? ['AB', three] : [three, 'AB'];
  const colors = shuffle([...FIG_COLORS], rng).slice(0, 3), shapes = shuffle([...FIG_SHAPES], rng);
  const len = randInt(6, 7, rng);
  const at = (i: number) => ({ c: colors[cu.charCodeAt(i % cu.length) - 65], s: shapes[su.charCodeAt(i % su.length) - 65] });
  const row = Array.from({ length: len }, (_, i) => figure(at(i).c, at(i).s)), next = at(len);
  const otherColor = [...new Set(Array.from({ length: len }, (_, i) => at(i).c))].find((c) => c !== next.c)!;
  const otherShape = [...new Set(Array.from({ length: len }, (_, i) => at(i).s))].find((s) => s !== next.s)!;
  const answer = figure(next.c, next.s);
  return { unit: `${cu}/${su}`, row, answer, options: shuffle([answer, figure(otherColor, next.s), figure(next.c, otherShape)], rng) };
}

export function generate(level: number, rng: Rng): PatternSpec {
  if (level === 4) {
    return {
      type: 'pattern', level, prompt: 't_pattern',
      hint: ladder('h1_pattern_grow', { key: 'h2_pattern_grow', steps: [{ do: 'showNumbers' }] }), body: growing(rng),
    };
  }
  if (level >= 5) {
    return {
      type: 'pattern', level, prompt: 't_pattern',
      hint: ladder('h1_pattern_two', { key: 'h2_pattern_two', steps: [{ do: 'markUnits' }] }), body: twoFeatures(rng),
    };
  }
  const unit = pick(UNITS(level), rng);
  const colors = shuffle(COLORS, rng).slice(0, 3);
  const len = unit.length * 2 + randInt(1, unit.length - 1 || 1, rng);
  const seq = Array.from({ length: len + 1 }, (_, i) => colors[unit.charCodeAt(i % unit.length) - 65]);
  return {
    type: 'pattern', level, prompt: 't_pattern',
    hint: ladder('h_pattern', { key: 'h2_pattern', steps: [{ do: 'markUnits' }] }),
    body: { unit, row: seq.slice(0, len), options: shuffle(colors, rng), answer: seq[len] },
  };
}

export const pattern: TaskModel<PatternSpec, null, string> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
