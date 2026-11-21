/**
 * The planner of the panel tasks: which task the conversations give next.
 * - LEARN-11: an example of addition, take away or the composition of a number that had a mistake is kept in the save
 *   (`save.hard`); it comes back no earlier than after two other tasks, and again, until it is solved cleanly twice
 *   since its last mistake. The number house is not kept: its "example" is a whole house of floors, not one sum.
 * - LEARN-13: the same task (the same numbers, or the same things) is never given twice in a row, of any type.
 * - LEARN-16: replaying a finished chain plays the step whose skill has the lowest share of clean solves.
 * Every random choice comes from the rng it is given (ARCH-08): one seed, one sequence of tasks.
 */
import type { Rng } from '../core/rng';
import { pick } from '../core/util';
import { HARD_MAX, type HardExample, type Save } from '../core/save';
import type { SkillId } from './skills';
import { generate, type TaskSpec } from './tasks/index';
import type { TaskType } from './tasks/types';
import { example as addExample } from './tasks/add';
import { example as subExample } from './tasks/sub';
import { example as missingExample } from './tasks/missing';
import { showTask, type TaskHooks, type TaskResult } from './taskviews/panel';

/** How many other tasks come between an example with a mistake and its return (LEARN-11). */
export const GAP = 2;
/** How many clean solves since its last mistake take an example off the list (LEARN-11). */
export const CLEAN = 2;
/** How many times a task is drawn again when it is the one given just before (LEARN-13). */
const REDRAWS = 50;
/** The types whose examples with mistakes are kept: addition, take away, the missing addend (the composition of a number). */
const KEPT: readonly TaskType[] = ['add', 'sub', 'missing'];

/**
 * What makes a task the same task (LEARN-13: the same numbers or the same things), and for the kept types the key of
 * the example in the save. A task of numbers is its numbers, whatever things are drawn and wherever they lie (8 + 5 of
 * flowers is 8 + 5 of stars); a task of things is its things; the order on screen counts only where it is the task
 * (a row, a sequence to repeat, the cards laid out).
 */
export function sameness(s: TaskSpec): string {
  switch (s.type) {
    case 'add': return `add:${s.body.a}+${s.body.b}`;
    case 'sub': return `sub:${s.body.total}-${s.body.gone}`;
    case 'missing': return `missing:${s.body.a}+?=${s.body.sum}`;
    case 'count': return `count:${s.body.n}`;
    case 'compare': return `compare:${s.body.groups.join(',')}:${s.body.more ? 'more' : 'fewer'}`;
    case 'signs': return `signs:${s.body.a},${s.body.b}`;
    case 'neighbors': return `neighbors:${s.body.n}:${s.body.before ? 'before' : 'after'}`;
    case 'order': return `order:${[...s.body.sorted].join(',')}`;
    case 'house': return `house:${s.body.roof}:${s.body.floors.map((f) => f.join('+')).join(',')}:${s.body.gap.floor}${s.body.gap.side}`;
    case 'odd': return `odd:${[...s.body.things].sort().join(',')}:${s.body.things[s.body.answer]}`;
    case 'pairs': return `pairs:${s.body.deck.join(',')}`;
    case 'sort': return `sort:${s.body.colors.join(',')}:${s.body.queue.join(',')}`;
    case 'pattern': return `pattern:${s.body.unit}:${s.body.row.join(',')}`;
    case 'simon': return `simon:${s.body.pads.join(',')}:${s.body.seq.join(',')}`;
    case 'diff': return `diff:${s.body.things.map((t) => `${t.prop}${t.color}${t.n}`).join(',')}:${s.body.changes.map((c) => c.at).join(',')}`;
    case 'puzzle': return `puzzle:${s.body.cols}x${s.body.rows}:${s.body.things.map((t) => `${t.col}${t.row}${t.prop}`).join(',')}`;
  }
}

const typeOfKey = (k: string) => k.slice(0, k.indexOf(':')) as TaskType;
const inRange = (...xs: number[]) => xs.every((x) => Number.isInteger(x) && x >= 1 && x <= 20);

/** The task of a kept example, built anew on its level (the things and choices from `rng`); null for a damaged one. */
function rebuild(h: HardExample, rng: Rng): TaskSpec | null {
  const level = Math.min(5, Math.max(1, h.l));
  let m = /^add:(\d+)\+(\d+)$/.exec(h.k);
  if (m) { const [a, b] = [+m[1], +m[2]]; return inRange(a, b, a + b) ? addExample(level, a, b, rng) : null; }
  m = /^sub:(\d+)-(\d+)$/.exec(h.k);
  if (m) { const [total, gone] = [+m[1], +m[2]]; return inRange(total, gone) && gone < total ? subExample(level, total, gone, rng) : null; }
  m = /^missing:(\d+)\+\?=(\d+)$/.exec(h.k);
  if (m) { const [a, sum] = [+m[1], +m[2]]; return inRange(a, sum) && a < sum ? missingExample(level, a, sum, rng) : null; }
  return null;
}

/** An example as the parents read it, in numbers: "8 + 5", "13 − 6", "3 + ? = 7". */
export function exampleText(k: string): string {
  const [, body = k] = /^\w+:(.*)$/.exec(k) ?? [];
  return body.replace(/([+\-=])/g, ' $1 ').replace(/-/g, '−').replace(/\s+/g, ' ').trim();
}

/** The `n` hardest examples kept (PLAY-15): the most wrong answers first, of two alike the one met last. */
export function hardest(save: Save, n = 5): string[] {
  return [...save.hard.list].sort((x, y) => y.e - x.e || y.at - x.at).slice(0, n).map((h) => exampleText(h.k));
}

/** The share of clean solves of a skill; a skill never played counts as none solved cleanly yet. */
const cleanShare = (save: Save, skill: SkillId) => {
  const k = save.skills[skill];
  return k && k.tasks > 0 ? k.first / k.tasks : 0;
};

/**
 * The step to replay of a finished chain (LEARN-16): one whose skill has the lowest share of clean solves; of several
 * such steps one is picked by `rng` (always one draw, as the random pick of before).
 */
export function weakest<S>(steps: readonly S[], skillOf: (s: S) => SkillId, save: Save, rng: Rng): S {
  const low = Math.min(...steps.map((s) => cleanShare(save, skillOf(s))));
  return pick(steps.filter((s) => cleanShare(save, skillOf(s)) === low), rng);
}

export interface Planner {
  /** The next task of `type` on `level`: an example with a mistake that is due, or a new one unlike the one before. */
  next(type: TaskType, level: number, rng: Rng): TaskSpec;
  /** Notes how a task given by `next` ended: a mistake keeps its example, a clean solve counts towards taking it off. */
  done(spec: TaskSpec, res: TaskResult): void;
  /** `runTask` of the panel through the planner: the task is planned, shown, and its end noted. */
  runTask(type: TaskType, level: number, hooks: TaskHooks, rng: Rng): Promise<TaskResult>;
}

export function createPlanner(save: Save): Planner {
  let last: string | null = null;                      // the task given just before (LEARN-13), for this session
  const given = new WeakMap<TaskSpec, number>();      // the number of the task each spec was given as

  /**
   * The kept example of `type` that waited longest, once two other tasks have come since it was given. Only of the
   * very type: the composition of a number plays the number house on level 4 (R34), and a kept missing addend must not
   * take its place there.
   */
  const due = (type: TaskType, n: number) => save.hard.list
    .filter((h) => typeOfKey(h.k) === type && n - h.at > GAP && h.k !== last)
    .sort((x, y) => x.at - y.at)[0];
  /** A kept example given too early: it waits for its turn. */
  const early = (k: string, n: number) => save.hard.list.some((h) => h.k === k && n - h.at <= GAP);

  function next(type: TaskType, level: number, rng: Rng): TaskSpec {
    const n = save.hard.n++;
    let spec: TaskSpec | null = null;
    for (let h = due(type, n); h && !spec; h = due(type, n)) {
      spec = rebuild(h, rng);
      if (!spec) save.hard.list.splice(save.hard.list.indexOf(h), 1);     // a damaged example is forgotten
    }
    if (!spec) {
      spec = generate(type, level, rng);
      for (let i = 0; i < REDRAWS && (sameness(spec) === last || early(sameness(spec), n)); i++) spec = generate(type, level, rng);
    }
    const k = (last = sameness(spec));
    const kept = save.hard.list.find((h) => h.k === k);
    if (kept) kept.at = n;
    given.set(spec, n);
    return spec;
  }

  function done(spec: TaskSpec, res: TaskResult) {
    if (!KEPT.includes(spec.type)) return;
    const list = save.hard.list, k = sameness(spec), at = given.get(spec) ?? save.hard.n - 1;
    const h = list.find((x) => x.k === k);
    if (res.wrong > 0) {
      if (h) Object.assign(h, { l: spec.level, e: h.e + res.wrong, c: 0, at });
      else list.push({ k, l: spec.level, e: res.wrong, c: 0, at });
      // Over the limit: the example with the fewest mistakes goes, of two alike the older one, never the one just noted.
      while (list.length > HARD_MAX) {
        const out = list.filter((x) => x.k !== k).sort((x, y) => x.e - y.e || x.at - y.at)[0];
        list.splice(list.indexOf(out), 1);
      }
    } else if (res.solved && h && ++h.c >= CLEAN) list.splice(list.indexOf(h), 1);
  }

  return {
    next, done,
    async runTask(type, level, hooks, rng) {
      const spec = next(type, level, rng);
      const res = await showTask(spec, hooks);
      done(spec, res);
      return res;
    },
  };
}
