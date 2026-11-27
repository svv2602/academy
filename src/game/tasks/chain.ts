/**
 * A chain of two actions (LEARN-27, a task in breadth): "8 + 5 − 6 = ?" or "15 − 7 + 4 = ?" - one action adds, the
 * other takes away, in either order. The first number is 5..15, the two others 2..9 and not the same (so the answer
 * is never the first number again); the number between the actions and the answer stay within 1..20.
 *
 * The numbers do not follow the level: the task is given on the top level of addition and of take away only
 * (src/game/wide.ts), and the level it is asked with is kept in the description as it is.
 */
import { pick, randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import { THINGS, ladder, numberChoices, tilts, type Spec, type TaskModel } from './types';

/** The three numbers of a chain: the first one, then the number of each action. */
export type Chain = readonly [first: number, second: number, third: number];
export interface ChainBody {
  thing: string;
  /** The first number. */
  first: number;
  /** Whether the first action adds (then the second takes away), or the other way round. */
  addsFirst: boolean;
  /** The number of the first action and of the second one. */
  second: number;
  third: number;
  /** The number after the first action. */
  mid: number;
  /** One tilt per thing drawn: the things of the first number, then the ones the first action adds (if it adds). */
  tilt: number[];
  options: number[];
  answer: number;
}
export type ChainSpec = Spec<'chain', ChainBody>;

/** The smallest and the largest first number, number of an action, and number between the actions or at the end. */
export const FIRST = [5, 15] as const, STEP = [2, 9] as const, WITHIN = [1, 20] as const;

const within = (n: number) => n >= WITHIN[0] && n <= WITHIN[1];
/** The number after the first action of a chain, and its answer. */
export function run(addsFirst: boolean, [first, second, third]: Chain): [mid: number, answer: number] {
  const mid = addsFirst ? first + second : first - second;
  return [mid, addsFirst ? mid - third : mid + third];
}

/** Every chain of an order of the actions that the task may ask: one of them is picked by one draw. */
function chains(addsFirst: boolean): readonly Chain[] {
  const out: Chain[] = [];
  for (let first = FIRST[0]; first <= FIRST[1]; first++) for (let second = STEP[0]; second <= STEP[1]; second++) for (let third = STEP[0]; third <= STEP[1]; third++) {
    const [mid, answer] = run(addsFirst, [first, second, third]);
    if (second !== third && within(mid) && within(answer)) out.push([first, second, third]);
  }
  return out;
}
/** The chains that add first ("8 + 5 − 6") and the ones that take away first ("15 − 7 + 4"). */
export const ADD_FIRST = chains(true), SUB_FIRST = chains(false);

export function generate(level: number, rng: Rng): ChainSpec {
  const addsFirst = randInt(0, 1, rng) === 1;
  return example(level, addsFirst, pick(addsFirst ? ADD_FIRST : SUB_FIRST, rng), rng);
}

/**
 * The task of a chain already chosen (the generator; the walkthrough's own entry). The rest - the things, their tilts,
 * the choices - comes from `rng` in the order the generator draws it, so one seed still builds one task.
 */
export function example(level: number, addsFirst: boolean, chain: Chain, rng: Rng): ChainSpec {
  const [first, second, third] = chain, [mid, answer] = run(addsFirst, chain);
  const thing = pick(THINGS, rng);
  // the things drawn show the first number and the first action: the ones it adds stand after the first ones, the
  // ones it takes away are the last of the first ones
  const tilt = tilts(addsFirst ? mid : first, rng);
  return {
    type: 'chain', level, prompt: 't_chain',
    hint: ladder('h1_chain', { key: 'h2_chain', steps: [{ do: 'showMid' }] }),
    body: { thing, first, addsFirst, second, third, mid, tilt, options: numberChoices(rng, answer, WITHIN[1]), answer },
  };
}

export const chain: TaskModel<ChainSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
