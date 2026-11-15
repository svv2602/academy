/** Continue the row: a unit of colours (AB, AAB, ABAC, ...) repeats, which colour comes next? */
import { pick, randInt, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import type { Spec, TaskModel } from './types';

export interface PatternBody {
  /** The repeating unit, letters A, B, C for three different colours. */
  unit: string;
  /** The row as shown: two whole units and the start of the third; element i is letter `i % unit.length` of the unit. */
  row: string[];
  /** The three colours of the task, in the order of the buttons. */
  options: string[];
  answer: string;
}
export type PatternSpec = Spec<'pattern', PatternBody>;

/** The units of a level (a level above 3 is asked as the third). */
export const UNITS = (level: number) => (level === 1 ? ['AB'] : level === 2 ? ['AAB', 'ABB', 'ABC'] : ['AABB', 'ABAC', 'ABCB', 'AABC']);
export const COLORS = ['🔴', '🔵', '🟡', '🟢', '🟣', '🟠'];

export function generate(level: number, rng: Rng): PatternSpec {
  const unit = pick(UNITS(level), rng);
  const colors = shuffle(COLORS, rng).slice(0, 3);
  const len = unit.length * 2 + randInt(1, unit.length - 1 || 1, rng);
  const seq = Array.from({ length: len + 1 }, (_, i) => colors[unit.charCodeAt(i % unit.length) - 65]);
  return {
    type: 'pattern', level, prompt: 't_pattern',
    hint: { key: 'h_pattern', steps: [{ do: 'markUnits' }, { do: 'pulseAnswer', fromMistake: 2 }] },
    body: { unit, row: seq.slice(0, len), options: shuffle(colors, rng), answer: seq[len] },
  };
}

export const pattern: TaskModel<PatternSpec, null, string> = {
  generate,
  start: () => null,
  answer: (s, _st, input) => (input === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
