/**
 * The planner of the panel tasks: which task the conversations give next.
 * - LEARN-11: an example of addition, take away or the composition of a number that had a mistake is kept in the save
 *   (`save.hard`); it comes back no earlier than after two other tasks, and again, until it is solved cleanly twice
 *   since its last mistake. The number house is not kept: its "example" is a whole house of floors, not one sum.
 * - LEARN-13: the same task (the same numbers, or the same things) is never given twice in a row, of any type.
 * - LEARN-16: replaying a finished chain plays the step whose skill has the lowest share of clean solves.
 * - LEARN-28: a harder example she asked for is always a new one of that level - no kept example comes in its place -
 *   and a mistake in it keeps nothing: it would come back to her uninvited, a level above her own.
 * - The subjects alternate (Season 2, step 2, part I; layout §4, src/s2/subjects.ts): the subject of every task solved
 *   is noted in the ring `save.recent`, and where a place replays its tasks (`replayStep`: a finished chain, Pip's
 *   request once it is done) the subject comes first - not the one of the task before, then the one furthest behind
 *   its share - and the weakest skill within it. The first pass of a chain plays its steps as they stand (R10).
 * Every random choice comes from the rng it is given (ARCH-08): one seed, one sequence of tasks.
 */
import type { Rng } from '../core/rng';
import { pick } from '../core/util';
import { HARD_MAX, type HardExample, type Save } from '../core/save';
import type { SkillId } from './skills';
import { generate, type TaskSpec } from './tasks/index';
import { enTapExample, kindOf } from './tasks/en_tap';
import { noteExample } from './tasks/note';
import { NOTE_IDS, type NoteId } from '../s2/strings-book';
import { noteAnswer } from './answers';
import { isWord, type Subject } from '../s2/types';
import { targetShares } from '../s2/shares';
import { SUBJECT_OF, noteSubject, pickSubject } from '../s2/subjects';
import { meetWord } from '../ui/wordbook';
import type { TaskType } from './tasks/types';
import { example as addExample } from './tasks/add';
import { example as subExample } from './tasks/sub';
import { example as missingExample } from './tasks/missing';
import { answerOf, showTask, type TaskHooks, type TaskResult } from './taskviews/panel';

/** How many other tasks come between an example with a mistake and its return (LEARN-11). */
export const GAP = 2;
/** How many clean solves since its last mistake take an example off the list (LEARN-11). */
export const CLEAN = 2;
/** How many times a task is drawn again when it is the one given just before (LEARN-13). */
const REDRAWS = 50;
/**
 * The types whose examples with mistakes are kept: addition, take away, the missing addend (the composition of a number),
 * the English word of "listen and touch" (a hard word comes back, as LEARN-11), and the note read with mistakes.
 */
const KEPT: readonly TaskType[] = ['add', 'sub', 'missing', 'en_tap', 'note'];

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
    case 'puzzle': return `puzzle:${s.body.cols}x${s.body.rows}:${s.body.picture}`;
    case 'en_tap': return `en_tap:${s.body.word}`;
    case 'en_count': return `en_count:${s.body.n}`;
    case 'note': return `note:${s.body.id}`;
    case 'sum3': return `sum3:${s.body.parts.join('+')}`;
    case 'gap': return `gap:${s.body.total}-?=${s.body.left}`;
    case 'chain': return `chain:${s.body.first}${s.body.addsFirst ? '+' : '-'}${s.body.second}${s.body.addsFirst ? '-' : '+'}${s.body.third}`;
    case 'exprs': return `exprs:${s.body.sides.map((x) => `${x.a}${x.sign}${x.b}`).join(',')}`;
    case 'story': return `story:${s.body.first}${s.body.addsFirst ? '+' : '-'}${s.body.second}${s.body.addsFirst ? '-' : '+'}${s.body.third}`;
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
  m = /^en_tap:([a-z_]+)$/.exec(h.k);
  if (m) { const w = m[1]; return isWord(w) && kindOf(w) ? enTapExample(level, w, rng) : null; }
  m = /^note:(note_\d+)$/.exec(h.k);
  if (m) { const id = m[1] as NoteId; return NOTE_IDS.includes(id) ? noteExample(level, id, rng) : null; }
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

/**
 * The step a place replays where the subjects alternate (layout §4): first the subject - of those the steps have, by
 * the rule of src/s2/subjects.ts `pickSubject` over the ring `save.recent` and the shares the parent set - then, of the
 * steps of that subject, the one whose skill has the lowest share of clean solves (`weakest`: one draw of `rng`, as a
 * replay always took). Steps of one subject: the weakest of them, as before.
 */
export function replayStep<S>(steps: readonly S[], of: { skill: (s: S) => SkillId; subject: (s: S) => Subject }, save: Save, rng: Rng): S {
  const subject = pickSubject(save.recent, targetShares(save), steps.map(of.subject));
  return weakest(steps.filter((s) => of.subject(s) === subject), of.skill, save, rng);
}

export interface Planner {
  /**
   * The next task of `type` on `level`: an example with a mistake that is due, or a new one unlike the one before.
   * `asked` - a task she asked for above her level (LEARN-28): a new one of that level, whatever example is due. The
   * due one keeps waiting for the next task of her own.
   */
  next(type: TaskType, level: number, rng: Rng, asked?: boolean): TaskSpec;
  /**
   * Notes how a task given by `next` ended: a mistake keeps its example, a clean solve counts towards taking it off.
   * A mistake in a task she asked for (`asked`) starts no keeping: the example would come back by itself, a level above
   * her own, and be counted as her usual task. An example kept already is noted as ever, on the level it was kept with.
   * A task solved - with mistakes or without, asked for or not - is noted in the ring of the last subjects
   * (`save.recent`); a task closed is not: it was not played.
   */
  done(spec: TaskSpec, res: TaskResult, asked?: boolean): void;
  /** `runTask` of the panel through the planner: the task is planned, shown, and its end noted. */
  runTask(type: TaskType, level: number, hooks: TaskHooks, rng: Rng, asked?: boolean): Promise<TaskResult>;
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

  function next(type: TaskType, level: number, rng: Rng, asked = false): TaskSpec {
    const n = save.hard.n++;
    let spec: TaskSpec | null = null;
    for (let h = asked ? undefined : due(type, n); h && !spec; h = due(type, n)) {
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

  function done(spec: TaskSpec, res: TaskResult, asked = false) {
    if (res.solved) noteSubject(save, SUBJECT_OF[spec.type]);     // the shares of the subjects count every task played
    // a word found in "listen and touch" lies in the book from now on, its button marked (part H); quiet: the cat praises
    // the answer at that moment, Isabella's "A new word!" would talk over it
    if (spec.type === 'en_tap' && res.solved) meetWord(save, spec.body.word, true);
    // the nuts of note №8 are read and added (layout §4.2): its answer is noted for adding as well, the parents see it
    // there; only reading moves its level (the caller records the task's skill, `read`)
    if (spec.type === 'note' && spec.body.also && res.solved) {
      const { ms } = answerOf(res);
      noteAnswer(save, spec.body.also, { type: 'note', ok: res.wrong === 0 && res.helped !== true, ms });
    }
    if (!KEPT.includes(spec.type)) return;
    const list = save.hard.list, k = sameness(spec), at = given.get(spec) ?? save.hard.n - 1;
    const h = list.find((x) => x.k === k);
    if (res.wrong > 0) {
      if (h) Object.assign(h, { l: asked ? h.l : spec.level, e: h.e + res.wrong, c: 0, at });
      else if (asked) return;
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
    async runTask(type, level, hooks, rng, asked = false) {
      const spec = next(type, level, rng, asked);
      const res = await showTask(spec, hooks);
      done(spec, res, asked);
      return res;
    },
  };
}
