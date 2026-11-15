/**
 * The old home of the panel tasks, kept only for its importers (ARCH-09): the descriptions are `tasks/<type>.ts`,
 * the panel and its ten shows are `taskviews/`. Nothing but re-exports lives here.
 */
export type { TaskType } from './tasks/types';
export { PAIRS_PEEK_MS } from './tasks/pairs';
export { SKILL, cheatTask, runTask } from './taskviews/panel';
export type { Skill, TaskHooks, TaskResult } from './taskviews/panel';
