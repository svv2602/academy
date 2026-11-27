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
import type { Key, SpokenKey } from '../../ui/strings';
import type { BankKey } from '../../core/voice';
import { bank } from '../../ui/strings-bank';

export type TaskType = 'count' | 'add' | 'sub' | 'compare' | 'pattern' | 'odd' | 'pairs' | 'order' | 'sort' | 'simon' | 'missing' | 'house'
  | 'neighbors' | 'signs' | 'diff' | 'puzzle' | 'en_tap' | 'en_count';

/**
 * One step of a hint, carried out by the view in the order of the list once the cat has said the line of its rung.
 * `countOn`: "10" over the full frame, then 11, 12, ... (ten frames); `fillTen`: the second group fills the first frame
 * up to ten, then the rest is counted on; `takeToTen`: the things over ten go, then the rest of the gone ones, then the
 * things left are counted; `track`: the cat walks a number track from 1; `tryBaskets`: the gem tries each basket in turn;
 * `countUp` (the composition of a number): from the known number, dots come one by one with the numbers up to the sum,
 * then the dots are counted 1, 2, 3 - how many were missing; `countCells` (the neighbours of a number): the cat counts the
 * cells of the track one by one and stops at the empty one, saying its number; `pairUp` (the signs): both numbers are laid
 * out as things in ten frames, matched in pairs one to one, the things left over of the larger number glow.
 */
export type HintStep =
  | { do: 'countAloud'; which: 'all' | 'left' } | { do: 'countOn'; which: 'all' | 'left' } | { do: 'fillTen' } | { do: 'takeToTen' }
  | { do: 'showNumbers' } | { do: 'grow' | 'shrink' } | { do: 'markUnits' } | { do: 'frameAlike' } | { do: 'track' }
  | { do: 'tryBaskets' } | { do: 'pulseNext' } | { do: 'replay' } | { do: 'pulseAnswer' } | { do: 'countUp' }
  | { do: 'countCells' } | { do: 'pairUp' } | { do: 'outline' };
/**
 * One rung of the hint: the line the cat says, and what is shown on screen once it has ended. `outline` (the English
 * words, Season 2): the right picture is outlined. A rung of no line (null: the English tasks, whose cat's lines are not
 * recorded yet - R25) carries out its steps right after the shake.
 */
export interface HintRung { key: SpokenKey | null; steps: readonly HintStep[] }
/**
 * The hint in three rungs (LEARN-10, HINTS.md): the first mistake says the way and shows nothing, the second solves it
 * together step by step, the third and every later one lights the right answer. What the second showed stays on screen.
 */
export interface Hint { rungs: readonly [HintRung, HintRung, HintRung] }
/** The hint of a type: its way (said only), its solution shown together, and the lit answer with the one line of rung 3. */
export const ladder = (way: SpokenKey, together: HintRung, lit: readonly HintStep[] = [{ do: 'pulseAnswer' }]): Hint =>
  ({ rungs: [{ key: way, steps: [] }, together, { key: 'h3_show', steps: lit }] });
/** The rung of mistake `round`: 1, 2, then 3 for the third and every later one. */
export const rungOf = (hint: Hint, round: number): HintRung => hint.rungs[Math.min(Math.max(round, 1), 3) - 1];
/**
 * `prompt`: the general question of the type (always recorded); `ask`: the clip of the bank of the old game's clips
 * that asks this very example ("Скільки буде вісім плюс п'ять?", R37), when the old game recorded one.
 */
export interface Spec<T extends TaskType, B> { type: T; level: number; prompt: SpokenKey; ask?: BankKey; hint: Hint | null; body: B }
/**
 * A question shown in the bubble and never said by the cat (the English tasks of Season 2): `key` - its text (a line of
 * no voice: no clip of it is recorded, the synthesizer never gets it), `en` - the English clips that ask it, said one
 * after the other by the voice of English (src/s2/types.ts `enVoice`).
 */
export interface ScreenAsk { key: Key; en: readonly string[] }
/** A task asked in English: no spoken question of the cat (`prompt: null`), its question on the screen (`screen`). */
export type EnSpec<T extends TaskType, B> = Omit<Spec<T, B>, 'prompt' | 'ask'> & { prompt: null; ask?: undefined; screen: ScreenAsk };
/** `key` if the bank has its clip (the bank lists every clip of public/bank/, src/ui/strings-bank.ts), else nothing. */
export const inBank = (key: BankKey): BankKey | undefined => (Object.hasOwn(bank.table.uk, key) ? key : undefined);
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
