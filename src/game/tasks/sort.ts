/**
 * Sort the gems: each gem of the queue goes into the basket of its colour. The input is a colour (a basket key).
 * Level 5 on the panel sorts by two features: four baskets, two colours times two shapes, each figure into the one
 * basket of its colour and its shape (the keys are then figure keys, "red circle").
 */
import { shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import { ladder, type Spec, type TaskModel } from './types';
import { FIG_COLORS, FIG_SHAPES, figure } from './odd';

export interface SortBody {
  /** The colours of the baskets, in their order (level 5 on the panel: figure keys, colour times shape). */
  colors: string[];
  /** The gems to sort, the first one is shown first; every colour comes equally often. */
  queue: string[];
}
export type SortSpec = Spec<'sort', SortBody>;
/** How many gems of the queue are sorted. */
export interface SortState { pos: number }

export const COLORS = ['red', 'blue', 'yellow', 'green'];

/**
 * Sorting by colour, for the panel up to level 4 and for the world on every level: the world paints its pedestals by
 * colour, two features in the world are a later step - so its level 5 stays the colours of level 4 (9 gems, 3 colours).
 */
export function generate(level: number, rng: Rng): SortSpec {
  const colors = shuffle(COLORS, rng).slice(0, level === 1 ? 2 : 3);
  const queue = shuffle(Array.from({ length: level >= 3 ? 9 : 6 }, (_, i) => colors[i % colors.length]), rng);
  return { type: 'sort', level, prompt: 't_sort', hint: ladder('h_sort', { key: 'h2_sort', steps: [{ do: 'tryBaskets' }] }, [{ do: 'pulseNext' }]), body: { colors, queue } };
}

/** Level 5 on the panel: two colours times two shapes, two figures of each basket - eight to sort. */
export function generateTwo(level: number, rng: Rng): SortSpec {
  const [c1, c2] = shuffle([...FIG_COLORS], rng), [s1, s2] = shuffle([...FIG_SHAPES], rng);
  const colors = [figure(c1, s1), figure(c1, s2), figure(c2, s1), figure(c2, s2)];
  const queue = shuffle([...colors, ...colors], rng);
  return {
    type: 'sort', level, prompt: 't_sort_two',
    // Rung 2: the baskets of the other colour go dim, then those of the other shape - one is left (`tryBaskets` on the panel).
    hint: ladder('h1_sort_two', { key: 'h2_sort_two', steps: [{ do: 'tryBaskets' }] }, [{ do: 'pulseNext' }]), body: { colors, queue },
  };
}

export const sort: TaskModel<SortSpec, SortState, string> = {
  generate: (level, rng) => (level >= 5 ? generateTwo(level, rng) : generate(level, rng)),
  start: () => ({ pos: 0 }),
  answer(s, st, color) {
    if (st.pos >= s.body.queue.length) return 'ignored';
    if (color !== s.body.queue[st.pos]) return 'wrong';
    return ++st.pos === s.body.queue.length ? 'right' : 'step';
  },
  solution: (s, st) => s.body.queue.slice(st.pos),
};
