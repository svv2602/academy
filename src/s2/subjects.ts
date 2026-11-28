/**
 * The subject of every kind of task, and which subject comes next where the subjects alternate (Season 2, step 2,
 * part I; layout §4, the customer's В6 and В7: R03, R09, R10).
 * - Every kind belongs to one subject (`SUBJECT_OF`). A task of two subjects - counting in English, the note with the
 *   nuts to add - is of its first one: English, reading.
 * - Two tasks of one subject never come in a row where another subject is to be had (as LEARN-13, the key the subject).
 * - Of the subjects left the one furthest behind its share comes (45 / 25 / 15 / 15 with the parent's steps,
 *   ./shares.ts), counted over the last RECENT_KEPT tasks (`save.recent`).
 * Where the subjects alternate: the replay of a finished chain, Pip's request once it is done (src/game/planner.ts
 * `replayStep`), and the day's set of the mysterious stars (src/game/mystery.ts). Never in the first pass of a chain.
 * Pure: no randomness - of two subjects equally far behind the first of SUBJECTS comes.
 */
import type { Save } from '../core/save';
import type { TaskType } from '../game/tasks/types';
import { RECENT_KEPT, SUBJECTS, type Subject } from './types';

/** The subject of each kind of task (layout §4); the tasks in breadth are examples of numbers, mathematics. */
export const SUBJECT_OF: Readonly<Record<TaskType, Subject>> = {
  count: 'math', add: 'math', sub: 'math', compare: 'math', signs: 'math', neighbors: 'math', order: 'math', missing: 'math', house: 'math',
  sum3: 'math', gap: 'math', chain: 'math', exprs: 'math', story: 'math',
  pattern: 'logic', pairs: 'logic', simon: 'logic', sort: 'logic', odd: 'logic', diff: 'logic', puzzle: 'logic',
  en_tap: 'en', en_count: 'en',
  note: 'read',
};

/**
 * The kinds of the new subjects a place of replays may give beside its own (R33: a finished chain may be replayed in
 * English or as reading): none before Pip is met - the words are his, and the notes are "Pip's notes"; English only
 * while the parent has it on.
 */
export function newSubjectKinds(save: Pick<Save, 'pip' | 'english'>): TaskType[] {
  if (!save.pip.met) return [];
  return [...(save.english ? (['en_tap', 'en_count'] as const) : []), 'note'];
}

/** Notes a solved task of `subject` among the last ones: the ring keeps RECENT_KEPT, the oldest first. */
export function noteSubject(save: Pick<Save, 'recent'>, subject: Subject): void {
  save.recent.push(subject);
  if (save.recent.length > RECENT_KEPT) save.recent.splice(0, save.recent.length - RECENT_KEPT);
}

/**
 * The subject of the next task: one of `available` (the subjects this place can give).
 * - A subject whose share is 0 (English turned off) is not given while the place has another.
 * - The subject of the last task (the end of `recent`) is not given while another is left.
 * - Of the rest: the one furthest behind its share over the ring as it will be with this task in it - its share of
 *   that many tasks less the tasks of it among the last ones; of two alike the first of SUBJECTS.
 * The rule of the row comes first: a share over a half cannot be met where another subject is to be had.
 */
export function pickSubject(recent: readonly Subject[], shares: Readonly<Record<Subject, number>>, available: readonly Subject[]): Subject {
  const here = SUBJECTS.filter((k) => available.includes(k));
  if (!here.length) throw new Error('no subject is available to pick from');
  const on = here.filter((k) => shares[k] > 0);
  const open = on.length ? on : here;
  const last = recent[recent.length - 1];
  const other = open.filter((k) => k !== last);
  const from = other.length ? other : open;
  const ring = recent.slice(-(RECENT_KEPT - 1));
  const behind = (k: Subject) => shares[k] * (ring.length + 1) - ring.filter((r) => r === k).length;
  return from.reduce((best, k) => (behind(k) > behind(best) ? k : best));
}
