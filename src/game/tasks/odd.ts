/** The odd one out: things of one group and one thing of another, which does not belong? The answer is its index. */
import { pick, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import { ladder, type Spec, type TaskModel } from './types';

export interface OddBody {
  /** The things in the order shown. */
  things: string[];
  /** The index of the thing from the other group. */
  answer: number;
}
export type OddSpec = Spec<'odd', OddBody>;

/** Groups of things that belong together; the odd one is always taken from another group. */
export const GROUPS = [['🍎', '🍐', '🍊', '🍋', '🍓', '🍇'], ['🐱', '🐶', '🐰', '🦊', '🐻', '🐼'], ['🌸', '🌼', '🌷', '🌻', '🌹', '💐'], ['🚗', '🚌', '🚲', '🚀', '⛵', '🚂'], ['🍰', '🍭', '🍩', '🍪', '🍫', '🧁']];

export function generate(level: number, rng: Rng): OddSpec {
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
