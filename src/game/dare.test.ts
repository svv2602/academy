// @vitest-environment node
/**
 * «А складніше зможеш?» (LEARN-28): when a harder example may be offered - after a clean solve by herself, when the
 * solve was no step up (so never in the fast climb), below the top level, with no level fixed by the parent.
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { LEVELS, SKILLS, recordTask, statOf, type SkillId } from './skills';
import { dareLevel, mayDare, type Solved } from './dare';

/** A save with `skill` at `level` and a run of `streak`, its fast climb over (or not: `settled` false). */
function from(skill: SkillId, level: number, streak = 0, settled = true): Save {
  const s = defaultSave();
  Object.assign((s.skills[skill] ??= statOf(s, skill)), { level, streak });
  if (settled) s.skills[skill].settled = true;
  return s;
}
const CLEAN: Solved = { solved: true, wrong: 0 };
/** A task of `skill` given on her level and solved as `res`, recorded; then: may a harder one be offered? */
function after(s: Save, res: Solved = CLEAN, skill: SkillId = 'add') {
  const given = statOf(s, skill).level;
  if (res.solved) recordTask(s, skill, res.wrong, res.helped === true, { type: 'add' });
  return mayDare(s, skill, given, res);
}

describe('mayDare: a harder example may be offered', () => {
  it('after a task solved cleanly and by herself, the fast climb over, below the top level: yes', () => {
    expect(after(from('add', 3))).toBe(true);
    for (const level of [1, 2, 3, 4]) expect(after(from('add', level)), `level ${level}`).toBe(true);
  });

  it('the harder example is of the next level', () => {
    expect([1, 2, 3, 4].map(dareLevel)).toEqual([2, 3, 4, 5]);
  });

  it('not after a mistake, a helper, or a task closed', () => {
    expect(after(from('add', 3), { solved: true, wrong: 1 })).toBe(false);
    expect(after(from('add', 3), { solved: true, wrong: 3 })).toBe(false);
    expect(after(from('add', 3), { solved: true, wrong: 0, helped: true })).toBe(false);
    expect(after(from('add', 3), { solved: false, wrong: 0 })).toBe(false);
  });

  it('not in the fast climb: there every clean solve is a step up by itself', () => {
    const s = from('add', 3, 0, false);
    expect(after(s)).toBe(false);
    expect(s.skills.add.level).toBe(4);
    // on every level of the climb, whatever the run, up to the top - where it is not asked either
    for (const level of [1, 2, 3, 4, 5]) for (const streak of [0, 1]) expect(after(from('add', level, streak, false)), `level ${level}, run ${streak}`).toBe(false);
    // the climb over, the level it got to: the next clean solve is offered a harder one
    s.skills.add.settled = true;
    expect(after(s)).toBe(true);
  });

  it('not when this very solve was a step up: the second clean one in a row', () => {
    const s = from('add', 3, 1);
    expect(after(s)).toBe(false);
    expect(s.skills.add).toMatchObject({ level: 4, streak: 0 });
    // and the one after it, the first clean solve on the new level, is offered again
    expect(after(s)).toBe(true);
  });

  it('not on the top level: there the tasks in breadth are what is harder', () => {
    for (const streak of [0, 1, 5]) expect(after(from('add', 5, streak)), `run ${streak}`).toBe(false);
    // the top of each skill is its own
    for (const skill of SKILLS) expect(after(from(skill, LEVELS[skill][1]), CLEAN, skill), skill).toBe(false);
  });

  it('not while the parent fixed the level of the skill - whatever level; a level fixed for another skill does not matter', () => {
    for (const fixed of [1, 3, 5]) {
      const s = from('add', 3);
      s.fixed.add = fixed;
      expect(mayDare(s, 'add', fixed, CLEAN), `fixed ${fixed}`).toBe(false);
      expect(after(s), `fixed ${fixed}`).toBe(false);
    }
    const other = from('add', 3);
    other.fixed.sub = 2;
    expect(after(other)).toBe(true);
  });

  it('every skill below its top: the composition of a number from its third level, the skills of Season 2 too', () => {
    for (const skill of SKILLS) {
      const [min, max] = LEVELS[skill];
      for (let level = min; level < max; level++) expect(after(from(skill, level), CLEAN, skill), `${skill} ${level}`).toBe(true);
    }
  });

  it('a task given on another level than hers (a damaged save, a level just moved): no offer', () => {
    const s = from('add', 3);
    expect(mayDare(s, 'add', 2, CLEAN)).toBe(false);
    expect(mayDare(s, 'add', 4, CLEAN)).toBe(false);
    expect(mayDare(s, 'add', 3, CLEAN)).toBe(true);
  });

  it('asks nothing of the save but to read it', () => {
    const s = from('add', 3), before = JSON.stringify(s);
    mayDare(s, 'add', 3, CLEAN);
    expect(JSON.stringify(s)).toBe(before);
  });
});
