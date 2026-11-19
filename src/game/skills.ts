/**
 * Skills and levels (ARCH-01, LEARN-03, LEARN-15, LEARN-17): what a task trains, the difficulty of the next one and the
 * adaptive rule. The counters live in the save (src/core/save.ts, `save.skills[<skill id>]`, the parent's fixed levels
 * in `save.fixed`); this file is the rule that reads and moves them. The child never sees a "level".
 */
import type { Save } from '../core/save';

/** The skills of the ladder (docs/11-learning.md); "logic" of version 3 saves is split into series, pattern, memory, classify. */
export type SkillId = 'count' | 'add' | 'sub' | 'compare' | 'series' | 'pattern' | 'memory' | 'classify' | 'compose';
/** Every skill, in the order the parents' section lists them. */
export const SKILLS: readonly SkillId[] = ['count', 'add', 'sub', 'compare', 'series', 'pattern', 'memory', 'classify', 'compose'];
/** The counters of one skill, as the save keeps them. */
export type SkillStat = Save['skills'][string];

/**
 * The levels each skill has on the ladder (R38): 1 to 5, but the composition of a number, which starts at level 3
 * (it has no levels 1 and 2). Every generator plays every level of its skill (docs/11-learning.md, the ladder).
 */
export const LEVELS: Readonly<Record<SkillId, readonly [min: number, max: number]>> = {
  count: [1, 5], add: [1, 5], sub: [1, 5], compare: [1, 5], series: [1, 5],
  pattern: [1, 5], memory: [1, 5], classify: [1, 5], compose: [3, 5],
};

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
  return withinLevels(skill, typeof fixed === 'number' && fixed > 0 ? fixed : s.skills[skill].level);
}

/**
 * Adaptive difficulty (LEARN-15). `wrong` is the number of wrong answers in the task, which is also the step of the hint
 * the child got to (HINTS.md): two clean solves in a row step the level up; a task that reached the third step, or two
 * tasks in a row that reached the second, step it down; a single wrong answer keeps the level (and ends both runs).
 * `streak` counts the clean solves in a row (above 0) or the tasks in a row that ended at the second step (below 0).
 */
export function recordTask(s: Save, skill: SkillId, wrong: number, helped = false) {
  const k = s.skills[skill];
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
