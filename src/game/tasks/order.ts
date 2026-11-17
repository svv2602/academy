/** Numbers in order: tap them from the smallest to the largest. The input is a number. */
import { randInt, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import { ladder, type Spec, type TaskModel } from './types';

export interface OrderBody {
  /** The numbers in the order of the buttons. */
  shown: number[];
  /** The same numbers from the smallest: the order to tap them in. */
  sorted: number[];
}
export type OrderSpec = Spec<'order', OrderBody>;
/** How many numbers are already tapped in order. */
export interface OrderState { next: number }

/** How many numbers a level shows. */
export const COUNT = (level: number) => (level === 1 ? 4 : 5);
/**
 * The largest number a level draws from when the numbers are scattered: 10 on level 3, 20 on level 5 (LEARN-05).
 * Level 4 of the series is the neighbours of a number (LEARN-08, `tasks/neighbors.ts`, played there by `BY_LEVEL` of
 * `tasks/index.ts`); this type itself plays its level 4 as its 3.
 */
export const TOP = (level: number) => (level >= 5 ? 20 : 10);

export function generate(level: number, rng: Rng): OrderSpec {
  const n = COUNT(level);
  // The start is drawn on every level, from the third too, where the numbers are drawn from 1..TOP instead.
  const start = randInt(1, level === 1 ? 3 : 5, rng);
  const sorted = level < 3 ? Array.from({ length: n }, (_, i) => start + i) : shuffle(Array.from({ length: TOP(level) }, (_, i) => i + 1), rng).slice(0, n).sort((a, b) => a - b);
  return {
    type: 'order', level, prompt: 't_order',
    hint: ladder('h_order', { key: 'h2_order', steps: [{ do: 'track' }] }, [{ do: 'pulseNext' }]),
    body: { shown: shuffle([...sorted], rng), sorted },
  };
}

export const order: TaskModel<OrderSpec, OrderState, number> = {
  generate,
  start: () => ({ next: 0 }),
  answer(s, st, v) {
    if (s.body.sorted.slice(0, st.next).includes(v)) return 'ignored';
    if (v !== s.body.sorted[st.next]) return 'wrong';
    return ++st.next === s.body.sorted.length ? 'right' : 'step';
  },
  solution: (s, st) => s.body.sorted.slice(st.next),
};
