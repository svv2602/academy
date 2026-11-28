/**
 * Three addends (LEARN-27, a task in breadth): a + b + c = ? The sum is 11..20, each number 2..9. In two tasks of three
 * two of the numbers make ten, and not always the two that stand side by side (7 + 5 + 3: seven and three) - the way is
 * to find that pair and start with it; in the third no two make ten, and the way is the one of adding across ten.
 *
 * The numbers do not follow the level: the task is given on the top level of addition only (src/game/wide.ts), and the
 * level it is asked with is kept in the description as it is.
 */
import { pick, randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import { THINGS, ladder, numberChoices, tilts, type Spec, type TaskModel } from './types';

export type Three = readonly [number, number, number];
export interface Sum3Body {
  thing: string;
  /** The three addends in the order they stand. */
  parts: Three;
  /** The places (0..2) of two addends that make ten, the lower place first; null when no two do. */
  ten: readonly [number, number] | null;
  /** One tilt per thing: the things of the first addend, then of the second, then of the third. */
  tilt: number[];
  options: number[];
  answer: number;
}
export type Sum3Spec = Spec<'sum3', Sum3Body>;

/** The smallest and the largest addend. */
export const PART = [2, 9] as const;
/** The smallest and the largest sum: always past ten (the hint fills a ten and counts on), never past twenty. */
export const SUM = [11, 20] as const;

/** The places of two addends that make ten - of several such pairs the first of 0-1, 0-2, 1-2 - or null. */
export function tenOf(parts: Three): readonly [number, number] | null {
  for (const [i, j] of [[0, 1], [0, 2], [1, 2]] as const) if (parts[i] + parts[j] === 10) return [i, j];
  return null;
}

/** Every three addends of the task in which no two make ten: one of them is picked by one draw, none is drawn again. */
export const PLAIN: readonly Three[] = (() => {
  const out: Three[] = [];
  for (let a = PART[0]; a <= PART[1]; a++) for (let b = PART[0]; b <= PART[1]; b++) for (let c = PART[0]; c <= PART[1]; c++) {
    const parts: Three = [a, b, c], sum = a + b + c;
    if (sum >= SUM[0] && sum <= SUM[1] && !tenOf(parts)) out.push(parts);
  }
  return out;
})();

/**
 * The three numbers. Two tasks of three: a pair that makes ten (2 + 8 ... 8 + 2) and a third number put before the
 * pair, between its numbers or after it. The third task: three numbers no two of which make ten (`PLAIN`).
 */
function numbers(rng: Rng): Three {
  if (randInt(1, 3, rng) === 3) return pick(PLAIN, rng);
  const x = randInt(2, 8, rng), third = randInt(PART[0], PART[1], rng), at = randInt(0, 2, rng);
  const out = [x, 10 - x];
  out.splice(at, 0, third);
  return [out[0], out[1], out[2]];
}

export function generate(level: number, rng: Rng): Sum3Spec {
  return example(level, numbers(rng), rng);
}

/**
 * The task "a + b + c" for numbers already chosen (the generator; the walkthrough's own entry). The rest - the things,
 * their tilts, the choices - comes from `rng` in the order the generator draws it, so one seed still builds one task.
 */
export function example(level: number, parts: Three, rng: Rng): Sum3Spec {
  const thing = pick(THINGS, rng);
  const answer = parts[0] + parts[1] + parts[2];
  const tilt = tilts(answer, rng);
  const ten = tenOf(parts);
  return {
    type: 'sum3', level, prompt: 't_sum3',
    // Rung 1 says the way: the pair that makes ten where there is one, else the way of any sum across ten. Rung 2 is
    // the same for both: a frame is filled up to ten, the rest is counted on.
    hint: ladder(ten ? 'h1_sum3' : 'h1_add_cross', { key: 'h2_add_cross', steps: [{ do: 'fillTen' }] }),
    body: { thing, parts, ten, tilt, options: numberChoices(rng, answer, SUM[1]), answer },
  };
}

export const sum3: TaskModel<Sum3Spec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
