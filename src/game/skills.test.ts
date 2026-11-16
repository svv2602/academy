import { describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { LEVELS, SKILLS, levelFor, recordTask, withinLevels, type SkillId } from './skills';
import { SKILL } from './taskviews/panel';

/** Feeds a series of finished tasks (number of wrong answers in each, the step of the hint reached) through recordTask. */
function play(s: Save, skill: SkillId, ...wrongs: number[]) {
  for (const wrong of wrongs) recordTask(s, skill, wrong);
}

/** A fresh save with skill `skill` at `level` (the counters empty). */
function at(skill: SkillId, level: number) {
  const s = defaultSave();
  s.skills[skill].level = level;
  return s;
}

describe('the skills of the ladder (LEARN-03, R38)', () => {
  it('are the nine of docs/11-learning.md, "logic" split into four, in the order of the parents\' section', () => {
    expect(SKILLS).toEqual(['count', 'add', 'sub', 'compare', 'series', 'pattern', 'memory', 'classify', 'compose']);
    expect(SKILLS).not.toContain('logic');
  });

  it('each has levels 1 to 5, but the composition of a number: 3 to 5 (it has no levels 1 and 2)', () => {
    for (const k of SKILLS) expect(LEVELS[k], k).toEqual(k === 'compose' ? [3, 5] : [1, 5]);
    expect(Object.keys(LEVELS).sort()).toEqual([...SKILLS].sort());
  });

  it('a fresh save starts each skill at its first level', () => {
    const s = defaultSave();
    for (const k of SKILLS) expect(s.skills[k].level, k).toBe(LEVELS[k][0]);
  });

  it('every kind of task trains the skill of its line of the ladder', () => {
    expect(SKILL).toEqual({
      count: 'count', add: 'add', sub: 'sub', compare: 'compare', order: 'series', pattern: 'pattern',
      pairs: 'memory', simon: 'memory', odd: 'classify', sort: 'classify', missing: 'compose', house: 'compose',
    });
    for (const k of Object.values(SKILL)) expect(SKILLS).toContain(k);
    // every skill is trained by some kind of task (the composition of a number: the missing addend and the house)
    expect(SKILLS.filter((k) => !Object.values(SKILL).includes(k))).toEqual([]);
  });
});

/**
 * The rule of LEARN-15 (R21), as a table: a series of tasks (wrong answers in each) played from every level of every
 * skill, and what it does to the level. The expected level is the start moved by `delta`, kept within the skill's levels.
 */
const SCENARIOS: readonly { wrongs: number[]; delta: number; why: string }[] = [
  { wrongs: [0], delta: 0, why: 'one clean solve keeps the level' },
  { wrongs: [0, 0], delta: 1, why: 'two clean solves in a row step it up' },
  { wrongs: [0, 0, 0], delta: 1, why: 'the third clean solve starts a new run' },
  { wrongs: [0, 0, 0, 0], delta: 2, why: 'four clean solves: two steps up' },
  { wrongs: [1], delta: 0, why: 'one wrong answer keeps the level' },
  { wrongs: [1, 1, 1], delta: 0, why: 'tasks with one wrong answer never step it down' },
  { wrongs: [2], delta: 0, why: 'one task at the second step keeps the level' },
  { wrongs: [2, 2], delta: -1, why: 'two tasks in a row at the second step step it down' },
  { wrongs: [2, 2, 2, 2], delta: -2, why: 'four of them: two steps down' },
  { wrongs: [3], delta: -1, why: 'a task at the third step steps it down' },
  { wrongs: [6], delta: -1, why: 'more wrong answers are the third step too' },
  { wrongs: [3, 3], delta: -2, why: 'two tasks at the third step: two steps down' },
  { wrongs: [2, 3], delta: -1, why: 'the second step, then the third: one step down' },
  { wrongs: [0, 3], delta: -1, why: 'a clean solve does not shield the third step' },
  { wrongs: [2, 1, 2], delta: 0, why: 'second steps not in a row keep the level (one wrong answer between)' },
  { wrongs: [2, 0, 2], delta: 0, why: 'second steps not in a row keep the level (a clean solve between)' },
  { wrongs: [0, 1, 0], delta: 0, why: 'clean solves not in a row keep the level (one wrong answer between)' },
  { wrongs: [0, 2, 0], delta: 0, why: 'clean solves not in a row keep the level (a second step between)' },
  { wrongs: [1, 0, 0], delta: 1, why: 'two clean solves after a wrong answer step it up' },
  { wrongs: [2, 0, 0], delta: 1, why: 'two clean solves after a second step step it up' },
];

describe('recordTask: the level rule on five levels (LEARN-15, R21, R22)', () => {
  const rows = SKILLS.flatMap((skill) => {
    const [min, max] = LEVELS[skill];
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
      .flatMap((level) => SCENARIOS.map((c) => ({ skill, level, ...c, want: Math.min(max, Math.max(min, level + c.delta)) })));
  });

  it.each(rows)('$skill at level $level, tasks with $wrongs wrong answers: $why', ({ skill, level, wrongs, want }) => {
    const s = at(skill, level);
    play(s, skill, ...wrongs);
    expect(s.skills[skill].level).toBe(want);
  });

  it('the table reaches the top and the bottom of every skill: never above 5, never below its first level', () => {
    for (const k of SKILLS) {
      const [min, max] = LEVELS[k];
      const top = at(k, max); play(top, k, 0, 0, 0, 0, 0, 0);
      expect(top.skills[k].level, `${k} top`).toBe(max);
      const bottom = at(k, min); play(bottom, k, 3, 3, 2, 2, 2, 2);
      expect(bottom.skills[k].level, `${k} bottom`).toBe(min);
    }
    const s = defaultSave();
    play(s, 'add', ...Array(20).fill(0));
    expect(s.skills.add.level).toBe(5);
    play(s, 'compose', ...Array(20).fill(3));
    expect(s.skills.compose.level).toBe(3);
  });

  it('a level outside the skill\'s own (a damaged save) is brought back within them by the next task', () => {
    const s = defaultSave();
    s.skills.compose.level = 1; s.skills.count.level = 9;
    play(s, 'compose', 1); play(s, 'count', 1);
    expect([s.skills.compose.level, s.skills.count.level]).toEqual([3, 5]);
  });

  it('counts every task, first-try solves only when clean, and all wrong answers', () => {
    const s = defaultSave();
    play(s, 'memory', 0, 1, 2, 3, 0);
    expect(s.skills.memory).toMatchObject({ tasks: 5, first: 2, errors: 6 });
  });

  it('streak: clean solves in a row above 0, second steps in a row below 0, a single wrong answer ends both', () => {
    const s = at('series', 3);
    play(s, 'series', 0); expect(s.skills.series.streak).toBe(1);
    play(s, 'series', 1); expect(s.skills.series.streak).toBe(0);
    play(s, 'series', 2); expect(s.skills.series.streak).toBe(-1);
    play(s, 'series', 0); expect(s.skills.series.streak).toBe(1);
    play(s, 'series', 0); expect(s.skills.series).toMatchObject({ level: 4, streak: 0 });
    play(s, 'series', 2, 2); expect(s.skills.series).toMatchObject({ level: 3, streak: 0 });
  });

  it('tracks each skill on its own', () => {
    const s = defaultSave();
    play(s, 'pattern', 0, 0);
    play(s, 'classify', 3);
    expect(s.skills.pattern.level).toBe(2);
    expect(s.skills.classify).toMatchObject({ level: 1, tasks: 1 });
    for (const k of SKILLS.filter((k) => k !== 'pattern' && k !== 'classify')) expect(s.skills[k], k).toEqual(defaultSave().skills[k]);
  });
});

describe('levelFor: the level fixed by the parent for each skill (LEARN-15, R21, R38)', () => {
  it('uses the adaptive level when nothing is fixed (0)', () => {
    const s = defaultSave();
    s.skills.add.level = 4; s.skills.pattern.level = 2;
    expect([levelFor(s, 'add'), levelFor(s, 'pattern'), levelFor(s, 'compose')]).toEqual([4, 2, 3]);
  });

  it('a level fixed for one skill holds for that skill only', () => {
    const s = defaultSave();
    s.skills.add.level = 2;
    s.fixed.sub = 5;
    expect(levelFor(s, 'sub')).toBe(5);
    expect(levelFor(s, 'add')).toBe(2);
    s.fixed.add = 1;
    expect(levelFor(s, 'add')).toBe(1);
  });

  it('every level 1 to 5 can be fixed for every skill, each within its own (the composition of a number: 3 to 5)', () => {
    for (const k of SKILLS) for (const level of [1, 2, 3, 4, 5]) {
      const s = defaultSave();
      s.fixed[k] = level;
      expect(levelFor(s, k), `${k} fixed at ${level}`).toBe(withinLevels(k, level));
    }
    const s = defaultSave();
    s.fixed.compose = 1;
    expect(levelFor(s, 'compose')).toBe(3);
    s.fixed.compose = 4;
    expect(levelFor(s, 'compose')).toBe(4);
  });

  it('a fixed level does not stop the adaptive one from moving: back to "auto", the child is where she got to', () => {
    const s = defaultSave();
    s.fixed.count = 5;
    play(s, 'count', 0, 0);
    expect(levelFor(s, 'count')).toBe(5);
    s.fixed.count = 0;
    expect(levelFor(s, 'count')).toBe(2);
  });
});
