/**
 * Skills and levels (ARCH-01, LEARN-03, LEARN-15, LEARN-17): what a task trains, the difficulty of the next one and the
 * adaptive rule. The counters live in the save (src/core/save.ts, `save.skills[<skill id>]`, the parent's fixed levels
 * in `save.fixed`); this file is the rule that reads and moves them. The child never sees a "level".
 */
import type { Save } from '../core/save';
import { noteAnswer } from './answers';

/**
 * The skills of the ladder (docs/11-learning.md); "logic" of version 3 saves is split into series, pattern, memory,
 * classify. Season 2 (save version 5, PROPOSAL §3): English words by ear, English phrases and commands, an English word
 * read, reading in Ukrainian.
 */
export type SkillId = 'count' | 'add' | 'sub' | 'compare' | 'series' | 'pattern' | 'memory' | 'classify' | 'compose' | 'attention' | 'assemble'
  | 'en_words' | 'en_phrases' | 'en_read' | 'read';
/** Every skill, in the order the parents' section lists them. */
export const SKILLS: readonly SkillId[] = ['count', 'add', 'sub', 'compare', 'series', 'pattern', 'memory', 'classify', 'compose', 'attention', 'assemble',
  'en_words', 'en_phrases', 'en_read', 'read'];
/**
 * The skills that are no field of a fresh save, until their first task is recorded: attention ("find the differences",
 * LEARN-18) and assembling a picture (the puzzle, LEARN-19) are played from the second world on; an English word read
 * opens only at level 3 of English words (`isOpen`).
 */
export const LATE_SKILLS: readonly SkillId[] = ['attention', 'assemble', 'en_read'];
/** The skills of Season 2: none of them has a task yet in step 2's first wave (the parents' rows come with part P). */
export const SEASON2_SKILLS: readonly SkillId[] = ['en_words', 'en_phrases', 'en_read', 'read'];
/**
 * The skills to show for this save: every one, but a late one or one of Season 2 with no task played yet - a row of
 * zeroes for a child who has not played it says nothing.
 */
export const shownSkills = (s: Save): SkillId[] => SKILLS.filter((k) => !(LATE_SKILLS.includes(k) || SEASON2_SKILLS.includes(k)) || (s.skills[k]?.tasks ?? 0) > 0);
/** The counters of one skill, as the save keeps them. */
export type SkillStat = Save['skills'][string];

/**
 * The levels each skill has on the ladder (R38): 1 to 5, but the composition of a number, which starts at level 3
 * (it has no levels 1 and 2). Every generator plays every level of its skill (docs/11-learning.md, the ladder).
 */
export const LEVELS: Readonly<Record<SkillId, readonly [min: number, max: number]>> = {
  count: [1, 5], add: [1, 5], sub: [1, 5], compare: [1, 5], series: [1, 5],
  pattern: [1, 5], memory: [1, 5], classify: [1, 5], compose: [3, 5], attention: [1, 5], assemble: [1, 5],
  en_words: [1, 5], en_phrases: [1, 5], en_read: [1, 5], read: [1, 5],
};

/**
 * The level a skill starts at, when it is not its lowest (PROPOSAL §3): she already learns English, so words and phrases
 * start at 2, and reading at 3; unlike the composition of a number (whose lowest is 3) each may go down to 1.
 */
export const START: Readonly<Partial<Record<SkillId, number>>> = { compose: 3, en_words: 2, en_phrases: 2, read: 3 };
/** The level skill `k` starts at. */
export const startLevel = (k: SkillId) => START[k] ?? LEVELS[k][0];

/** Whether the tasks of a skill may be given: an English word read opens at level 3 of English words; the rest always. */
export const isOpen = (s: Save, k: SkillId) => k !== 'en_read' || levelFor(s, 'en_words') >= 3;

/**
 * The counters of a skill as the save has them, or fresh ones at its start level: a late skill (LATE_SKILLS) is no
 * field of a save until its first task is recorded (`recordTask` writes it) - an optional key, no new version.
 */
export function statOf(s: Save, skill: SkillId): SkillStat {
  return s.skills[skill] ?? { level: startLevel(skill), streak: 0, tasks: 0, first: 0, errors: 0 };
}

/** A level brought within the skill's own levels. */
export function withinLevels(skill: SkillId, level: number) {
  const [min, max] = LEVELS[skill];
  return Math.min(max, Math.max(min, level));
}

/**
 * Difficulty for the next task of a skill: the level the parent fixed for this skill (brought within its levels: a
 * "1" fixed for every skill is a 3 for the composition of a number), or the adaptive level when none is fixed (0).
 */
export function levelFor(s: Save, skill: SkillId) {
  const fixed = s.fixed[skill];
  return withinLevels(skill, typeof fixed === 'number' && fixed > 0 ? fixed : statOf(s, skill).level);
}

/**
 * Adaptive difficulty (LEARN-15). `wrong` is the number of wrong answers in the task, which is also the step of the hint
 * the child got to (HINTS.md): two clean solves in a row step the level up; a task that reached the third step, or two
 * tasks in a row that reached the second, step it down; a single wrong answer keeps the level (and ends both runs).
 * `streak` counts the clean solves in a row (above 0) or the tasks in a row that ended at the second step (below 0).
 */
export function recordTask(s: Save, skill: SkillId, wrong: number, helped = false, note?: { type?: string; ms?: number }) {
  // its answer for the parents' report (src/game/answers.ts): right when at the first try with no helper, as `first`;
  // `note` - the type of its task and its time (TaskResult of the panel; a task in the world names its step)
  if (note?.type) noteAnswer(s, skill, { type: note.type, ok: wrong === 0 && !helped, ms: note.ms });
  const k = (s.skills[skill] ??= statOf(s, skill));
  const [min, max] = LEVELS[skill];
  k.tasks++; k.errors += wrong;
  // Solved with a helper (the owl, the abacus, src/game/helpers.ts) and no mistake: no error, but no clean solve either -
  // the run of clean solves and the run towards the next level start again, the level stays.
  if (helped && wrong === 0) { countClean(s, 1); k.streak = 0; k.level = withinLevels(skill, k.level); return; }
  countClean(s, wrong);
  if (wrong === 0) {
    k.first++; k.streak = Math.max(1, k.streak + 1);
    if (k.streak >= 2 && k.level < max) { k.level++; k.streak = 0; }
  } else if (wrong === 1) {
    k.streak = 0;
  } else {
    k.streak = wrong >= 3 ? -2 : Math.min(-1, k.streak - 1);
    if (k.streak <= -2 && k.level > min) { k.level--; k.streak = 0; }
  }
  // A level outside the skill's own (a damaged save) is brought back within them.
  k.level = withinLevels(skill, k.level);
}

/**
 * The run of clean solves of every skill (PLAY-08, the achievement `clean_ten`): a task solved at the first try adds
 * one, a task solved after a mistake ends the current run; the best run never goes down. A task closed by the child is
 * not recorded at all (src/game/dialogue.ts calls recordTask for solved ones only), so it leaves the run as it is (R44).
 */
export function countClean(s: Pick<Save, 'clean'>, wrong: number) {
  const c = (s.clean ??= { run: 0, best: 0 });
  c.run = wrong === 0 ? c.run + 1 : 0;
  c.best = Math.max(c.best, c.run);
}
