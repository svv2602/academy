/**
 * Skills and levels (ARCH-01, LEARN-17): what a task trains, the difficulty of the next one and the adaptive rule.
 * The counters live in the save (src/core/save.ts, `save.skills[<skill id>]`); this file is the rule that reads and
 * moves them. The child never sees a "level".
 */
import type { Save } from '../core/save';

export type SkillId = 'count' | 'add' | 'sub' | 'compare' | 'logic';
/** Every skill, in the order the parents' section lists them. */
export const SKILLS: readonly SkillId[] = ['count', 'add', 'sub', 'compare', 'logic'];
/** The counters of one skill, as the save keeps them. */
export type SkillStat = Save['skills'][string];

/** Difficulty for the next task of a skill: fixed by the parent, or the adaptive level. */
export function levelFor(s: Save, skill: SkillId) { return s.difficulty || s.skills[skill].level; }

/**
 * Adaptive difficulty: two clean solves in a row step the level up; a task that needed two or more
 * corrections (or two shaky ones in a row) steps it down. The child never sees a "level".
 */
export function recordTask(s: Save, skill: SkillId, wrong: number) {
  const k = s.skills[skill];
  k.tasks++; k.errors += wrong;
  if (wrong === 0) {
    k.first++; k.streak = Math.max(1, k.streak + 1);
    if (k.streak >= 2 && k.level < 3) { k.level++; k.streak = 0; }
  } else {
    k.streak = Math.min(-1, k.streak - 1);
    if ((wrong >= 2 || k.streak <= -2) && k.level > 1) { k.level--; k.streak = 0; }
  }
}
