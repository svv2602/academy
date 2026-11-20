/**
 * The middle of a task in the world kept in the world's progress (`ws.tasks`, docs/worlds/common.md part 2 item 8): a task
 * closed before its end - or the world left - goes on from there next time (the maze of the forest: from the last fork
 * passed). What is kept is the list of numbers `progress()` of the task gave, by the step of the chain.
 *
 * Mended where read: only whole finite numbers are kept, a list with anything else is none; a task solved takes its step
 * away, and an empty `tasks` goes with its last step (the save does not gather empty records).
 */
import type { WorldState } from '../../core/save';

/** The middle kept for `step`, or [] for none (or a damaged one). */
export function keptOf(ws: Pick<WorldState, 'tasks'>, step: string): number[] {
  const list = ws.tasks && typeof ws.tasks === 'object' ? (ws.tasks as Record<string, unknown>)[step] : undefined;
  return Array.isArray(list) && list.every((n) => typeof n === 'number' && Number.isInteger(n)) ? [...list] : [];
}

/** Keeps the middle `list` of `step`; an empty one is the same as none. */
export function keep(ws: Pick<WorldState, 'tasks'>, step: string, list: readonly number[]): void {
  if (!list.length) { forget(ws, step); return; }
  if (!ws.tasks || typeof ws.tasks !== 'object' || Array.isArray(ws.tasks)) ws.tasks = {};
  ws.tasks[step] = [...list];
}

/** The task of `step` is over: its middle goes, and `tasks` with it once it is empty. */
export function forget(ws: Pick<WorldState, 'tasks'>, step: string): void {
  if (!ws.tasks || typeof ws.tasks !== 'object') { delete ws.tasks; return; }
  delete ws.tasks[step];
  if (!Object.keys(ws.tasks).length) delete ws.tasks;
}
