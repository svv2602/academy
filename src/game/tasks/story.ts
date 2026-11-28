/**
 * A problem in two actions told in pictures (LEARN-27, a task in breadth): there were some, then some came and some
 * went away - or the other way round - how many are there now? Three pictures of things and no example written out:
 * the child reads the story off the pictures and finds the two actions herself. The numbers are the ones of a chain of
 * two actions (./chain.ts): the first 5..15, the two others 2..9 and not the same, never past 20 on the way.
 *
 * No line tells the story: its numbers are new every time, and only recorded lines are said. One general question
 * asks what became of the things.
 *
 * The numbers do not follow the level: the task is given on the top level of take away only (src/game/wide.ts), and
 * the level it is asked with is kept in the description as it is.
 */
import { pick, randInt } from '../../core/util';
import type { Rng } from '../../core/rng';
import { THINGS, ladder, numberChoices, tilts, type Spec, type TaskModel } from './types';
import { ADD_FIRST, SUB_FIRST, WITHIN, run, type Chain } from './chain';

export interface StoryBody {
  thing: string;
  /** How many there were. */
  first: number;
  /** Whether some came first (and then some went away), or the other way round. */
  addsFirst: boolean;
  /** How many the first action is of, and the second one. */
  second: number;
  third: number;
  /** How many there were after the first action. */
  mid: number;
  /** One tilt per thing drawn: the things of the first picture, then of the second, then of the third. */
  tilt: number[];
  options: number[];
  answer: number;
}
export type StorySpec = Spec<'story', StoryBody>;

export function generate(level: number, rng: Rng): StorySpec {
  const addsFirst = randInt(0, 1, rng) === 1;
  return example(level, addsFirst, pick(addsFirst ? ADD_FIRST : SUB_FIRST, rng), rng);
}

/**
 * The task of a story already chosen (the generator; the walkthrough's own entry). The rest - the things, their tilts,
 * the choices - comes from `rng` in the order the generator draws it, so one seed still builds one task.
 */
export function example(level: number, addsFirst: boolean, chain: Chain, rng: Rng): StorySpec {
  const [first, second, third] = chain, [mid, answer] = run(addsFirst, chain);
  const thing = pick(THINGS, rng);
  const tilt = tilts(first + second + third, rng);
  return {
    type: 'story', level, prompt: 't_story',
    // Rung 1 says the way: one action, then the other. Rung 2 writes the story out as an example in numbers and works
    // it out action by action, as for a chain.
    hint: ladder('h1_chain', { key: 'h2_chain', steps: [{ do: 'showExample' }, { do: 'showMid' }] }),
    body: { thing, first, addsFirst, second, third, mid, tilt, options: numberChoices(rng, answer, WITHIN[1]), answer },
  };
}

export const story: TaskModel<StorySpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
