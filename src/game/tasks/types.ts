/**
 * A task as data (ARCH-09): a generator turns a level and the task's `rng` into a description of the task - what is
 * asked, what is shown, the right answer and the steps of its hint. Showing it (on the panel, later in the world) is
 * another module that takes this description and draws no random numbers of its own.
 *
 * The generators are pure: no page, no styles, no `Math` randomness - every choice comes from the `rng` they are given,
 * in the same order as the panel code drew it before the split, so one seed still builds the same task (R20).
 */
import { randInt, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import type { SpokenKey } from '../../ui/strings';

export type TaskType = 'count' | 'add' | 'sub' | 'compare' | 'pattern' | 'odd' | 'pairs' | 'order' | 'sort' | 'simon';

/** One step of a hint, carried out by the view in the order of the list once the cat has said the hint. */
export type HintStep =
  | { do: 'countAloud'; which: 'all' | 'left' } | { do: 'showNumbers' } | { do: 'grow' | 'shrink' }
  | { do: 'markUnits' } | { do: 'frameAlike' } | { do: 'pulseNext' } | { do: 'replay' } | { do: 'pulseAnswer'; fromMistake: 2 };
export interface Hint { key: SpokenKey; steps: readonly HintStep[] }
export interface Spec<T extends TaskType, B> { type: T; level: number; prompt: SpokenKey; hint: Hint | null; body: B }
/**
 * How the task takes one input: the answer is right, wrong, a right step of a longer answer, a miss that is no
 * mistake (memory pairs), or nothing at all (the input does not count now).
 */
export type Outcome = 'right' | 'wrong' | 'step' | 'miss' | 'ignored';
export interface TaskModel<S, St, In> {
  generate(level: number, rng: Rng): S;
  start(s: S): St;
  answer(s: S, st: St, input: In): Outcome;
  /** The inputs that solve the task from state `st`, in order. */
  solution(s: S, st: St): In[];
  result?(s: S, st: St, wrongs: number): number;
}

// ---------- shared by the generators ----------

export const THINGS = ['🌸', '🦋', '🍓', '⭐', '🍄', '🐞', '🍎', '🌼', '🐟', '🍒'];
/** The tilt of each of `n` drawn things, -12..12 degrees: one draw per thing, in the order of the things. */
export const tilts = (n: number, rng: Rng) => Array.from({ length: n }, () => randInt(-12, 12, rng));
/** Up to `n` answer numbers around `correct` within 0..max, sorted; `correct` is always among them. */
export function numberChoices(rng: Rng, correct: number, max: number, n = 4) {
  const set = new Set([correct]);
  for (const d of shuffle([-1, 1, -2, 2, 3, -3], rng)) { const v = correct + d; if (v >= 0 && v <= max && set.size < n) set.add(v); }
  return [...set].sort((a, b) => a - b);
}
