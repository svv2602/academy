/**
 * Memory pairs: cards lie face down, two equal pictures make a pair. The input is the index of a tapped card.
 * Memory has no "wrong" move: a non-matching pair is a miss, only counted, never scolded or hinted (`hint: null`).
 */
import { shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import { THINGS, type Spec, type TaskModel } from './types';

export interface PairsBody {
  /** The picture of each card, in the order laid out. */
  deck: string[];
  pairs: number;
  /** Cards per row. */
  cols: number;
  /** How long every face is shown before the first tap counts. */
  peekMs: number;
}
export type PairsSpec = Spec<'pairs', PairsBody>;
/** The cards face up and not yet matched (at most one between taps), the matched cards and the misses so far. */
export interface PairsState { open: number[]; done: boolean[]; misses: number }

/**
 * Memory pairs open with every face shown for a moment (by level), before the first tap counts: the child sees that
 * the pictures come in twos and roughly where they lie. Six cards can be taken in at about half a second each; twelve
 * cannot be learnt in any short look, so the third level only gets a reminder and stays a memory game.
 * This is not a time limit: the game has not started yet, and nothing is lost when the cards turn face down.
 */
export const PAIRS_PEEK_MS = [0, 3000, 2500, 2000];
/** The pairs of a level (a level above 3 is asked as the third). */
export const PAIRS = (level: number) => (level === 1 ? 3 : level === 2 ? 4 : 6);

export function generate(level: number, rng: Rng): PairsSpec {
  const pairs = PAIRS(level);
  const deck = shuffle(shuffle(THINGS, rng).slice(0, pairs).flatMap((s) => [s, s]), rng);
  // A level without a peek of its own (above 3) turns the cards at once, as the unset timeout did before the split.
  return { type: 'pairs', level, prompt: 't_pairs', hint: null, body: { deck, pairs, cols: pairs === 3 ? 3 : 4, peekMs: PAIRS_PEEK_MS[level] ?? 0 } };
}

/** The other card with the same picture. */
const partner = (s: PairsSpec, card: number) => s.body.deck.findIndex((p, i) => p === s.body.deck[card] && i !== card);

export const pairs: TaskModel<PairsSpec, PairsState, number> = {
  generate,
  start: (s) => ({ open: [], done: s.body.deck.map(() => false), misses: 0 }),
  /** Turns the card over: `step` for the first card of a try and for a found pair, `miss`, `right` for the last pair. */
  answer(s, st, card) {
    if (st.done[card] || st.open.includes(card)) return 'ignored';
    st.open.push(card);
    if (st.open.length < 2) return 'step';
    const [x, y] = st.open;
    st.open = [];
    if (s.body.deck[x] !== s.body.deck[y]) { st.misses++; return 'miss'; }
    st.done[x] = st.done[y] = true;
    return st.done.every(Boolean) ? 'right' : 'step';
  },
  /** The cards left, pair by pair; a card already face up gets its partner first. */
  solution(s, st) {
    const out = st.open.map((c) => partner(s, c));
    s.body.deck.forEach((_, i) => { if (!st.done[i] && !st.open.includes(i) && !out.includes(i)) out.push(i, partner(s, i)); });
    return out;
  },
  /**
   * Finding every pair takes about one miss per pair even with a perfect memory; more than that is guessing.
   * The result is then shaky (1), not the miss count: two or more would drop the level at once.
   */
  result: (s, st, wrongs) => (st.misses > s.body.pairs ? 1 : wrongs),
};
