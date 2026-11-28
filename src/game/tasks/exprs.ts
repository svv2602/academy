/**
 * Comparing two examples (LEARN-27, a task in breadth): "8 + 5 ○ 7 + 7" - the child works both out and puts `>`, `<`
 * or `=` between them. A side is a sum of two numbers of 2..9 or a difference (5..20 less 2..9, at least 2 left); in a
 * third of the tasks one of the sides is a number alone ("8 + 5 ○ 12"). The two values are 2..20 and near each other -
 * they differ by 3 at most, so the sign is not told at a glance - and are the same in a quarter of the tasks. The two
 * sides are never one example twice, nor one sum with its numbers the other way round.
 *
 * The numbers do not follow the level: the task is given on the top level of addition only (src/game/wide.ts), and the
 * level it is asked with is kept in the description as it is.
 */
import { pick, randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import { THINGS, ladder, type Spec, type TaskModel } from './types';
import { SIGNS, signOf, type Sign } from './signs';

/** One side: "a + b", "a − b", or the number `a` alone (`sign` empty, `b` 0); `value` is what it comes to. */
export interface Side { a: number; sign: '+' | '−' | ''; b: number; value: number }
export interface ExprsBody {
  /** The two sides, left and right of the empty place of the sign. */
  sides: readonly [Side, Side];
  /** What the hint lays the two values out as: one thing for both. */
  thing: string;
  options: readonly Sign[];
  answer: Sign;
}
export type ExprsSpec = Spec<'exprs', ExprsBody>;

/** The smallest and the largest value of a side, and how far apart the two values may be. */
export const VALUE = [2, 20] as const, NEAR = 3;
/** How often the two values are the same, and how often one side is a number alone. */
export const SAME = 0.25, ALONE = 3;

/** A side as it is read: "8 + 5", "13 − 6", "12". */
export const textOf = (s: Side) => (s.sign ? `${s.a} ${s.sign} ${s.b}` : String(s.a));
const alone = (value: number): Side => ({ a: value, sign: '', b: 0, value });

/** Every sum and every difference a side may be. */
export const EXAMPLES: readonly Side[] = (() => {
  const out: Side[] = [];
  for (let a = 2; a <= 9; a++) for (let b = 2; b <= 9; b++) out.push({ a, sign: '+', b, value: a + b });
  for (let a = 5; a <= VALUE[1]; a++) for (let b = 2; b <= 9; b++) if (a - b >= VALUE[0]) out.push({ a, sign: '−', b, value: a - b });
  return out;
})();
/** Whether two sides are one example, or one sum with its numbers the other way round: nothing to work out then. */
export const alike = (x: Side, y: Side) => x.sign === y.sign && ((x.a === y.a && x.b === y.b) || (x.sign === '+' && x.a === y.b && x.b === y.a));

export function generate(level: number, rng: Rng): ExprsSpec {
  const one = pick(EXAMPLES, rng);
  // the other value: the same one in a quarter of the tasks, else one of the values near it
  let value = one.value;
  if (rng() >= SAME) {
    const near: number[] = [];
    for (let d = -NEAR; d <= NEAR; d++) if (d !== 0 && one.value + d >= VALUE[0] && one.value + d <= VALUE[1]) near.push(one.value + d);
    value = pick(near, rng);
  }
  // the other side: a number alone in a third of the tasks - and whenever no other example comes to that value (19, 20)
  const others = EXAMPLES.filter((e) => e.value === value && !alike(e, one));
  const other = randInt(1, ALONE, rng) === 1 || others.length === 0 ? alone(value) : pick(others, rng);
  return example(level, randInt(0, 1, rng) === 1 ? [one, other] : [other, one], rng);
}

/**
 * The task of two sides already chosen (the generator; the walkthrough's own entry); the thing of the hint comes from
 * `rng`, as the generator draws it.
 */
export function example(level: number, sides: readonly [Side, Side], rng: Rng): ExprsSpec {
  const thing = pick(THINGS, rng);
  return {
    type: 'exprs', level, prompt: 't_exprs',
    // Rung 2: under each side what it comes to, as a number and as things in ten frames matched in pairs.
    hint: ladder('h1_exprs', { key: 'h2_exprs', steps: [{ do: 'pairUp' }] }),
    body: { sides, thing, options: SIGNS, answer: signOf(sides[0].value, sides[1].value) },
  };
}

export const exprs: TaskModel<ExprsSpec, null, Sign> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
