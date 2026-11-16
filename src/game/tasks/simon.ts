/**
 * Repeat after me: the pads light up one by one, then the child taps the same pads in the same order.
 * The input is the symbol of a pad. The show itself (timing, light, sound) belongs to the view.
 */
import { pick, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import type { SpokenKey } from '../../ui/strings';
import { ladder, type Spec, type TaskModel } from './types';

export interface SimonBody {
  /** The symbols of the pads, in their order. */
  pads: string[];
  /** The pads as they light up: the order to repeat. */
  seq: string[];
  /** What the cat says once the show is over. */
  repeat: SpokenKey;
}
export type SimonSpec = Spec<'simon', SimonBody>;
/** How many pads of the sequence are repeated since the last show. */
export interface SimonState { pos: number }

export const SYMBOLS = ['🌸', '⭐', '🍄', '🦋', '💎', '🍓'];

export function generate(level: number, rng: Rng): SimonSpec {
  const len = level + 2, pads = shuffle(SYMBOLS, rng).slice(0, level + 3);
  const seq = Array.from({ length: len }, () => pick(pads, rng));
  return {
    type: 'simon', level, prompt: 't_simon_watch',
    // Rung 1 says the way and the child goes on where she missed; rung 2 is the show once more (from 6 steps on with
    // a pause after each pair), after which she repeats from the start; rung 3 lights the pad to tap next.
    hint: ladder(len >= 6 ? 'h1_simon_long' : 'h1_simon', { key: 'h_simon', steps: [{ do: 'replay' }] }, [{ do: 'pulseNext' }]),
    body: { pads, seq, repeat: 't_simon_repeat' },
  };
}

export const simon: TaskModel<SimonSpec, SimonState, string> = {
  generate,
  /** Also the state after each show: the repetition starts over. */
  start: () => ({ pos: 0 }),
  /** A mistake does not start over: the child goes on from the pad she missed, until the hint shows the sequence again. */
  answer(s, st, pad) {
    if (pad !== s.body.seq[st.pos]) return 'wrong';
    return ++st.pos === s.body.seq.length ? 'right' : 'step';
  },
  solution: (s, st) => s.body.seq.slice(st.pos),
};
