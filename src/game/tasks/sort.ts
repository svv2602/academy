/** Sort the gems: each gem of the queue goes into the basket of its colour. The input is a colour. */
import { shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import { ladder, type Spec, type TaskModel } from './types';

export interface SortBody {
  /** The colours of the baskets, in their order. */
  colors: string[];
  /** The gems to sort, the first one is shown first; every colour comes equally often. */
  queue: string[];
}
export type SortSpec = Spec<'sort', SortBody>;
/** How many gems of the queue are sorted. */
export interface SortState { pos: number }

export const COLORS = ['red', 'blue', 'yellow', 'green'];

export function generate(level: number, rng: Rng): SortSpec {
  const colors = shuffle(COLORS, rng).slice(0, level === 1 ? 2 : 3);
  const queue = shuffle(Array.from({ length: level === 3 ? 9 : 6 }, (_, i) => colors[i % colors.length]), rng);
  return { type: 'sort', level, prompt: 't_sort', hint: ladder('h_sort', { key: 'h2_sort', steps: [{ do: 'tryBaskets' }] }, [{ do: 'pulseNext' }]), body: { colors, queue } };
}

export const sort: TaskModel<SortSpec, SortState, string> = {
  generate,
  start: () => ({ pos: 0 }),
  answer(s, st, color) {
    if (st.pos >= s.body.queue.length) return 'ignored';
    if (color !== s.body.queue[st.pos]) return 'wrong';
    return ++st.pos === s.body.queue.length ? 'right' : 'step';
  },
  solution: (s, st) => s.body.queue.slice(st.pos),
};
