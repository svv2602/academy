import { describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { LATE_SKILLS, LEVELS, SEASON2_SKILLS, SKILLS, START, WIDE, WIDE_MISSES, climbs, isOpen, isWide, levelFor, recordDare, recordTask, shownSkills, startLevel, statOf, withinLevels, type SkillId } from './skills';
import { SKILL } from './taskviews/panel';

/** Feeds a series of finished tasks (number of wrong answers in each, the step of the hint reached) through recordTask. */
function play(s: Save, skill: SkillId, ...wrongs: number[]) {
  for (const wrong of wrongs) recordTask(s, skill, wrong);
}

/** A fresh save with skill `skill` at `level` (the counters empty), still in its fast climb, as in a new game. */
function climbing(skill: SkillId, level: number) {
  const s = defaultSave();
  (s.skills[skill] ??= statOf(s, skill)).level = level;
  return s;
}

/** The same with the fast climb of the skill over: the rule of the card (LEARN-15) from the first task on. */
function at(skill: SkillId, level: number) {
  const s = climbing(skill, level);
  s.skills[skill].settled = true;
  return s;
}

describe('the skills of the ladder (LEARN-03, R38)', () => {
  it('are the eleven of docs/11-learning.md, "logic" split into four, attention and assembling a picture (from the second world), then the four of Season 2, in the order of the parents\' section', () => {
    expect(SKILLS).toEqual(['count', 'add', 'sub', 'compare', 'series', 'pattern', 'memory', 'classify', 'compose', 'attention', 'assemble',
      'en_words', 'en_phrases', 'en_read', 'read']);
    expect(SKILLS).not.toContain('logic');
    expect(SEASON2_SKILLS).toEqual(['en_words', 'en_phrases', 'en_read', 'read']);
  });

  it('each has levels 1 to 5, but the composition of a number: 3 to 5 (it has no levels 1 and 2)', () => {
    for (const k of SKILLS) expect(LEVELS[k], k).toEqual(k === 'compose' ? [3, 5] : [1, 5]);
    expect(Object.keys(LEVELS).sort()).toEqual([...SKILLS].sort());
  });

  it('a fresh save starts each skill at its start level; a late one is no field of it until its first task', () => {
    const s = defaultSave();
    expect(START).toEqual({ compose: 3, en_words: 2, en_phrases: 2, read: 3 });
    for (const k of SKILLS) expect(statOf(s, k).level, k).toBe(START[k] ?? LEVELS[k][0]);
    for (const k of SKILLS) expect(startLevel(k), k).toBe(START[k] ?? 1);
    expect(LATE_SKILLS).toEqual(['attention', 'assemble', 'en_read']);
    for (const k of LATE_SKILLS) { expect(s.skills[k], k).toBeUndefined(); expect(levelFor(s, k)).toBe(1); }
  });

  it('English words, English phrases and reading start above their lowest level and may still go down to 1 (PROPOSAL §3)', () => {
    for (const k of ['en_words', 'en_phrases', 'read'] as const) {
      const s = defaultSave();
      expect(LEVELS[k], k).toEqual([1, 5]);
      for (let i = 0; i < 10; i++) recordTask(s, k, 3);
      expect(s.skills[k].level, k).toBe(1);
      s.fixed[k] = 1;
      expect(levelFor(s, k), k).toBe(1);
    }
    // the composition of a number, by contrast, never goes below its 3
    const c = defaultSave();
    for (let i = 0; i < 10; i++) recordTask(c, 'compose', 3);
    expect(c.skills.compose.level).toBe(3);
  });

  it('an English word read is closed until English words reach level 3 (adaptive or fixed); the rest are always open', () => {
    const s = defaultSave();
    expect(isOpen(s, 'en_read')).toBe(false);
    s.skills.en_words.level = 3;
    expect(isOpen(s, 'en_read')).toBe(true);
    s.fixed.en_words = 2;
    expect(isOpen(s, 'en_read')).toBe(false);
    s.fixed.en_words = 4;
    expect(isOpen(s, 'en_read')).toBe(true);
    for (const k of SKILLS.filter((k) => k !== 'en_read')) expect(isOpen(defaultSave(), k), k).toBe(true);
  });

  it('attention is shown to the grown-ups only once a task of it is recorded; recording writes its counters', () => {
    const s = defaultSave();
    expect(shownSkills(s)).not.toContain('attention');
    expect(shownSkills(s)).toHaveLength(SKILLS.length - 2 - SEASON2_SKILLS.length);
    recordTask(s, 'attention', 0);
    expect(s.skills.attention).toEqual({ level: 2, streak: 0, tasks: 1, first: 1, errors: 0 });   // the fast climb: one clean solve, one level
    expect(shownSkills(s)).toEqual(SKILLS.filter((k) => k !== 'assemble' && !SEASON2_SKILLS.includes(k)));
  });

  it('a skill of Season 2 is shown to the grown-ups once a task of it is recorded (an English word read writes its counters then)', () => {
    const s = defaultSave();
    for (const k of SEASON2_SKILLS) expect(shownSkills(s)).not.toContain(k);
    recordTask(s, 'read', 0);
    recordTask(s, 'en_read', 0);
    expect(s.skills.read).toEqual({ level: 4, streak: 0, tasks: 1, first: 1, errors: 0 });
    expect(s.skills.en_read).toEqual({ level: 2, streak: 0, tasks: 1, first: 1, errors: 0 });
    expect(shownSkills(s).filter((k) => SEASON2_SKILLS.includes(k))).toEqual(['en_read', 'read']);
  });

  it('every kind of task trains the skill of its line of the ladder', () => {
    expect(SKILL).toEqual({
      count: 'count', add: 'add', sub: 'sub', compare: 'compare', order: 'series', pattern: 'pattern',
      pairs: 'memory', simon: 'memory', odd: 'classify', sort: 'classify', missing: 'compose', house: 'compose',
      neighbors: 'series', signs: 'compare', diff: 'attention', puzzle: 'assemble',
      // the tasks in breadth (LEARN-27): recorded to the skill that asked for them, these are their own
      sum3: 'add', gap: 'sub', chain: 'add', exprs: 'add', story: 'sub',
    });
    for (const k of Object.values(SKILL)) expect(SKILLS).toContain(k);
    // every skill is trained by some kind of task (the composition of a number: the missing addend and the house), but
    // the four of Season 2: their kinds come with the next parts of step 2 (D1, D2, E)
    expect(SKILLS.filter((k) => !Object.values(SKILL).includes(k))).toEqual(SEASON2_SKILLS);
  });
});

/**
 * The rule of LEARN-15 (R21), as a table: a series of tasks (wrong answers in each) played from every level of every
 * skill, and what it does to the level. The expected level is the start moved by `delta`, kept within the skill's levels.
 * The skill's fast climb is over (`at`): this is the rule every task follows after it; the climb has its own table below.
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

describe('recordTask: the level rule on five levels once the fast climb is over (LEARN-15, R21, R22)', () => {
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
    expect(s.skills.pattern.level).toBe(3);                    // a new game: the fast climb, a level for each clean solve
    expect(s.skills.classify).toMatchObject({ level: 1, tasks: 1 });
    for (const k of SKILLS.filter((k) => k !== 'pattern' && k !== 'classify')) expect(s.skills[k], k).toEqual(defaultSave().skills[k]);
  });
});

/**
 * The fast climb (LEARN-15, the amendment of 2026-11-27, decision Q17), as a table: a series of tasks played by a skill
 * still climbing, the move of the level each task makes (kept within the skill's levels step by step), and whether the
 * climb is over after the series.
 */
const CLIMB: readonly { wrongs: number[]; moves: number[]; settled: boolean; why: string }[] = [
  { wrongs: [0], moves: [1], settled: false, why: 'every clean solve steps the level up' },
  { wrongs: [0, 0], moves: [1, 1], settled: false, why: 'two clean solves: two steps up' },
  { wrongs: [0, 0, 0, 0], moves: [1, 1, 1, 1], settled: false, why: 'four clean solves: four steps up' },
  { wrongs: [1], moves: [0], settled: false, why: 'one wrong answer keeps the level and the climb' },
  { wrongs: [1, 1, 1], moves: [0, 0, 0], settled: false, why: 'tasks with one wrong answer never end the climb' },
  { wrongs: [0, 1, 0], moves: [1, 0, 1], settled: false, why: 'a slip between two clean solves costs nothing' },
  { wrongs: [1, 0], moves: [0, 1], settled: false, why: 'the clean solve after a slip is a step up at once' },
  { wrongs: [2], moves: [0], settled: true, why: 'two wrong answers end the climb; one such task keeps the level' },
  { wrongs: [2, 0], moves: [0, 0], settled: true, why: 'after the climb one clean solve keeps the level' },
  { wrongs: [2, 0, 0], moves: [0, 0, 1], settled: true, why: 'after the climb two clean solves in a row step it up' },
  { wrongs: [2, 2], moves: [0, -1], settled: true, why: 'the task that ends the climb counts towards the step down' },
  { wrongs: [3], moves: [-1], settled: true, why: 'the third step ends the climb and steps the level down' },
  { wrongs: [6], moves: [-1], settled: true, why: 'more wrong answers are the third step too' },
  { wrongs: [0, 2, 0], moves: [1, 0, 0], settled: true, why: 'a step up, the end of the climb, then one clean solve: one step in all' },
  { wrongs: [0, 3], moves: [1, -1], settled: true, why: 'a step up, then the third step takes it back' },
  { wrongs: [0, 0, 2, 0, 0], moves: [1, 1, 0, 0, 1], settled: true, why: 'two steps of the climb, then the rule of the card: one more for two clean solves' },
];

describe('recordTask: the fast climb (LEARN-15, the amendment of 2026-11-27, decision Q17)', () => {
  const rows = SKILLS.flatMap((skill) => {
    const [min, max] = LEVELS[skill];
    return Array.from({ length: max - min + 1 }, (_, i) => min + i)
      .flatMap((level) => CLIMB.map((c) => ({ skill, level, ...c, want: c.moves.reduce((l, move) => Math.min(max, Math.max(min, l + move)), level) })));
  });

  it.each(rows)('$skill climbing at level $level, tasks with $wrongs wrong answers: $why', ({ skill, level, wrongs, want, settled }) => {
    const s = climbing(skill, level);
    play(s, skill, ...wrongs);
    expect(s.skills[skill].level).toBe(want);
    expect(climbs(s.skills[skill])).toBe(!settled);
  });

  it('a new game climbs: four clean solves take a skill from level 1 to 5 (eight by the rule of the card)', () => {
    const s = defaultSave();
    play(s, 'add', 0, 0, 0, 0);
    expect(s.skills.add).toEqual({ level: 5, streak: 0, tasks: 4, first: 4, errors: 0 });
    const after = at('add', 1);
    play(after, 'add', 0, 0, 0, 0);
    expect(after.skills.add.level).toBe(3);
  });

  it('the end of the climb is written into the counters once, by the task with two wrong answers or more, and stays', () => {
    const s = defaultSave();
    play(s, 'sub', 0, 1, 0);
    expect(s.skills.sub).not.toHaveProperty('settled');
    play(s, 'sub', 2);
    expect(s.skills.sub).toEqual({ level: 3, streak: -1, tasks: 4, first: 2, errors: 3, settled: true });
    play(s, 'sub', 0, 0, 0, 0, 0, 0, 0, 0);
    expect(s.skills.sub).toMatchObject({ level: 5, settled: true });
  });

  it('only `true` ends it: a save without the field, or with a damaged one, climbs', () => {
    for (const damaged of [undefined, false, 0, 1, 'yes', null]) {
      const s = defaultSave();
      (s.skills.count as { settled?: unknown }).settled = damaged;
      expect(climbs(s.skills.count), String(damaged)).toBe(true);
      play(s, 'count', 0);
      expect(s.skills.count.level, String(damaged)).toBe(2);
    }
    expect(climbs({ ...defaultSave().skills.count, settled: true })).toBe(false);
    expect(climbs(statOf(defaultSave(), 'attention'))).toBe(true);          // a late skill, no field of the save yet
  });

  it('a clean solve with a helper is no step up and does not end the climb; with a helper and two wrong answers it ends', () => {
    const s = defaultSave();
    recordTask(s, 'add', 0, true);
    expect(s.skills.add).toEqual({ level: 1, streak: 0, tasks: 1, first: 0, errors: 0 });
    recordTask(s, 'add', 0);
    expect(s.skills.add.level).toBe(2);
    recordTask(s, 'add', 2, true);
    expect(s.skills.add).toMatchObject({ level: 2, settled: true });
  });

  it('each skill climbs and ends its climb on its own', () => {
    const s = defaultSave();
    play(s, 'add', 2);
    play(s, 'sub', 0);
    play(s, 'add', 0);
    expect([s.skills.add.level, climbs(s.skills.add)]).toEqual([1, false]);
    expect([s.skills.sub.level, climbs(s.skills.sub)]).toEqual([2, true]);
    for (const k of SKILLS.filter((k) => k !== 'add' && k !== 'sub')) expect(climbs(statOf(s, k)), k).toBe(true);
  });

  it('a skill that starts above its lowest level climbs from there: reading from 3, English words from 2, the composition of a number from 3', () => {
    const s = defaultSave();
    for (const k of ['read', 'en_words', 'compose'] as const) play(s, k, 0);
    expect([s.skills.read.level, s.skills.en_words.level, s.skills.compose.level]).toEqual([4, 3, 4]);
  });

  it('the level the parent fixed is the one given, whatever the climb does underneath', () => {
    const s = defaultSave();
    s.fixed.add = 2;
    play(s, 'add', 0, 0, 0);
    expect([levelFor(s, 'add'), s.skills.add.level]).toEqual([2, 4]);
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
    expect(levelFor(s, 'count')).toBe(3);                      // a new game: two clean solves of the fast climb
  });
});

describe('the run of clean solves of every skill (PLAY-08, R44)', () => {
  it('a fresh save has no run; the first task starts it', () => {
    const s = defaultSave();
    expect(s.clean).toBeUndefined();
    recordTask(s, 'add', 0);
    expect(s.clean).toEqual({ run: 1, best: 1 });
  });

  it('a clean solve of any skill adds one; a solve after a mistake ends the run, the best stays', () => {
    const s = defaultSave();
    play(s, 'add', 0, 0, 0);
    play(s, 'count', 0, 0);
    expect(s.clean).toEqual({ run: 5, best: 5 });
    play(s, 'sub', 2);
    expect(s.clean).toEqual({ run: 0, best: 5 });
    play(s, 'memory', 0, 1, 0, 0);
    expect(s.clean).toEqual({ run: 2, best: 5 });
  });

  it('is counted beside the skill counters, which it does not change', () => {
    const a = defaultSave(), b = defaultSave();
    play(a, 'add', 0, 1, 0, 3, 0, 0);
    play(b, 'add', 0, 1, 0, 3, 0, 0);
    expect(a.clean).toEqual({ run: 2, best: 2 });
    expect(a.skills.add).toEqual({ ...b.skills.add });
    expect(a.skills.add).toMatchObject({ tasks: 6, first: 4, errors: 4 });
  });
});

describe('recordTask: a task in breadth is counted and moves nothing (LEARN-27, decision Q18)', () => {
  /** Tasks in breadth of `type`, each with so many wrong answers, recorded to `skill`. */
  const wide = (s: Save, skill: SkillId, type: string, ...wrongs: number[]) => { for (const wrong of wrongs) recordTask(s, skill, wrong, false, { type }); };
  /** A save with `skill` at `level` and a run of `streak`; `settled`: its fast climb is over. */
  const from = (skill: SkillId, level: number, streak: number, settled = true) => {
    const s = settled ? at(skill, level) : climbing(skill, level);
    s.skills[skill].streak = streak;
    return s;
  };

  it('the kinds in breadth: three for addition, three for take away; a chain of two actions belongs to both', () => {
    expect(WIDE).toEqual({ add: ['sum3', 'chain', 'exprs'], sub: ['gap', 'chain', 'story'] });
    for (const [skill, kinds] of Object.entries(WIDE)) for (const kind of kinds) {
      // its own skill is the one that gives it, or - for the chain, which both give - addition
      expect(SKILL[kind], kind).toBe(kind === 'chain' ? 'add' : skill);
      expect(isWide(kind), kind).toBe(true);
    }
    for (const usual of ['add', 'sub', 'count', 'missing', 'signs', 'world', '', undefined]) expect(isWide(usual), String(usual)).toBe(false);
    expect(WIDE_MISSES).toBe(2);
  });

  interface Row { why: string; level: number; streak: number; settled?: boolean; wrongs: number[]; want: { level: number; streak: number; wideMiss?: number }; climbing?: boolean }
  const rows: Row[] = [
    { why: 'clean solves: the level and the run stay', level: 5, streak: 2, wrongs: [0, 0, 0], want: { level: 5, streak: 2 } },
    { why: 'one wrong answer does not end the run (a usual task would)', level: 5, streak: 3, wrongs: [1], want: { level: 5, streak: 3 } },
    { why: 'two wrong answers: the run stays, the task is remembered as one that went badly', level: 5, streak: 2, wrongs: [2], want: { level: 5, streak: 2, wideMiss: 1 } },
    { why: 'three wrong answers do not step the level down (a usual task would)', level: 5, streak: 2, wrongs: [3], want: { level: 5, streak: 2, wideMiss: 1 } },
    { why: 'two in a row with two wrong answers end the run: back to the usual tasks; the level stays', level: 5, streak: 4, wrongs: [2, 2], want: { level: 5, streak: 0 } },
    { why: 'two in a row with three and five wrong answers: the same, and still no step down', level: 5, streak: 2, wrongs: [3, 5], want: { level: 5, streak: 0 } },
    { why: 'a clean one between two that went badly starts the count again', level: 5, streak: 2, wrongs: [2, 0, 2], want: { level: 5, streak: 2, wideMiss: 1 } },
    { why: 'so does one with a single wrong answer', level: 5, streak: 2, wrongs: [3, 1, 2], want: { level: 5, streak: 2, wideMiss: 1 } },
    { why: 'after the run has ended the count starts again from none', level: 5, streak: 2, wrongs: [2, 2, 2], want: { level: 5, streak: 0, wideMiss: 1 } },
    { why: 'four that went badly: the run stays ended, the level stays', level: 5, streak: 2, wrongs: [2, 2, 2, 2], want: { level: 5, streak: 0 } },
    { why: 'below the top level a clean one is no step up, with the climb over', level: 3, streak: 1, wrongs: [0, 0, 0, 0], want: { level: 3, streak: 1 } },
    { why: 'nor in the fast climb, where every usual clean solve is a step up', level: 3, streak: 0, settled: false, wrongs: [0, 0, 0, 0], want: { level: 3, streak: 0 }, climbing: true },
    { why: 'two wrong answers do not end the fast climb (a usual task would)', level: 5, streak: 2, settled: false, wrongs: [2, 4], want: { level: 5, streak: 0 }, climbing: true },
    { why: 'a run towards a step down is not touched: neither ended nor moved on', level: 4, streak: -1, wrongs: [2, 2], want: { level: 4, streak: -1 } },
  ];
  it.each(rows)('level $level, run $streak, tasks in breadth with $wrongs wrong answers: $why', ({ level, streak, settled, wrongs, want, climbing: stillClimbs }) => {
    for (const [skill, type] of [['add', 'sum3'], ['sub', 'gap'], ['add', 'chain'], ['sub', 'chain'], ['add', 'exprs'], ['sub', 'story']] as const) {
      const s = from(skill, level, streak, settled !== false);
      wide(s, skill, type, ...wrongs);
      const k = s.skills[skill];
      expect({ level: k.level, streak: k.streak, wideMiss: k.wideMiss }, skill).toEqual({ wideMiss: undefined, ...want });
      expect(Object.hasOwn(k, 'wideMiss'), 'no count is kept when there is nothing to count').toBe(want.wideMiss !== undefined);
      expect(climbs(k), skill).toBe(stillClimbs === true);
      expect([k.tasks, k.errors, k.first], skill).toEqual([wrongs.length, wrongs.reduce((x, y) => x + y, 0), wrongs.filter((w) => w === 0).length]);
    }
  });

  it('the same tasks recorded as usual ones do move the level: the rule is chosen by the type of the task', () => {
    const usual = from('add', 5, 2), breadth = from('add', 5, 2);
    for (const wrong of [3, 3]) { recordTask(usual, 'add', wrong, false, { type: 'add' }); recordTask(breadth, 'add', wrong, false, { type: 'sum3' }); }
    expect(usual.skills.add.level).toBe(3);
    expect(breadth.skills.add.level).toBe(5);
    // a task with no type named (a task in the world) is a usual one
    const world = from('add', 5, 2);
    recordTask(world, 'add', 3);
    expect(world.skills.add.level).toBe(4);
  });

  it('the usual tasks between two tasks in breadth do not start the count again: "in a row" is of the tasks in breadth', () => {
    const s = from('add', 5, 2);
    wide(s, 'add', 'sum3', 2);
    play(s, 'add', 0);
    expect(s.skills.add).toMatchObject({ streak: 3, wideMiss: 1 });
    wide(s, 'add', 'sum3', 2);
    expect(s.skills.add).toMatchObject({ level: 5, streak: 0 });
    expect(s.skills.add.wideMiss).toBeUndefined();
  });

  it('solved with a helper and no mistake: no clean solve, the run of clean solves of the achievement ends; nothing else moves', () => {
    const s = from('sub', 5, 2);
    play(s, 'count', 0, 0, 0);
    expect(s.clean).toEqual({ run: 3, best: 3 });
    recordTask(s, 'sub', 0, true, { type: 'gap' });
    expect(s.skills.sub).toMatchObject({ level: 5, streak: 2, tasks: 1, first: 0, errors: 0 });
    expect(s.clean).toEqual({ run: 0, best: 3 });
  });

  it('the run of clean solves of the achievement counts a task in breadth as any other', () => {
    const s = from('add', 5, 2);
    wide(s, 'add', 'sum3', 0, 0);
    expect(s.clean).toEqual({ run: 2, best: 2 });
    wide(s, 'add', 'sum3', 1);
    expect(s.clean).toEqual({ run: 0, best: 2 });
  });

  it('its answer goes to the parents\' report under its own type', () => {
    const s = from('add', 5, 2);
    recordTask(s, 'add', 0, false, { type: 'sum3', ms: 4200 });
    recordTask(s, 'add', 2, false, { type: 'sum3' });
    expect(s.answers?.add.map((a) => [a.t, a.ok, a.ms])).toEqual([['sum3', 1, 4200], ['sum3', 0, undefined]]);
  });

  it.each([['x'], [-3], [0.5], [null], [Number.NaN]])('a damaged count (%j) starts from none: one task that went badly does not end the run', (bad) => {
    const s = from('add', 5, 2);
    (s.skills.add as { wideMiss?: unknown }).wideMiss = bad;
    wide(s, 'add', 'sum3', 2);
    expect(s.skills.add).toMatchObject({ level: 5, streak: 2, wideMiss: 1 });
  });

  it('each skill counts its own', () => {
    const s = from('add', 5, 2);
    (s.skills.sub ??= statOf(s, 'sub')).level = 5; s.skills.sub.streak = 2; s.skills.sub.settled = true;
    wide(s, 'add', 'sum3', 2);
    wide(s, 'sub', 'gap', 2);
    expect([s.skills.add.streak, s.skills.sub.streak]).toEqual([2, 2]);
    wide(s, 'sub', 'gap', 2);
    expect([s.skills.add.streak, s.skills.sub.streak]).toEqual([2, 0]);
    expect([s.skills.add.wideMiss, s.skills.sub.wideMiss]).toEqual([1, undefined]);
  });
});

describe('recordDare: a harder example taken by her own wish (LEARN-28, decision Q19)', () => {
  /** A save with `skill` at `level` and a run of `streak`; `settled`: its fast climb is over. */
  const from = (skill: SkillId, level: number, streak: number, settled = true) => {
    const s = settled ? at(skill, level) : climbing(skill, level);
    s.skills[skill].streak = streak;
    return s;
  };

  it('solved cleanly and by herself: her level is that level at once, the run starts anew', () => {
    const s = from('add', 3, 1);
    recordDare(s, 'add', 4, 0, false, { type: 'add', ms: 3000 });
    expect(s.skills.add).toMatchObject({ level: 4, streak: 0, tasks: 1, first: 1, errors: 0, settled: true });
    expect(s.answers?.add.map((a) => [a.t, a.ok, a.ms])).toEqual([['add', 1, 3000]]);
    expect(s.clean).toEqual({ run: 1, best: 1 });
  });

  it.each([[1, 'one wrong answer'], [2, 'two wrong answers'], [3, 'three'], [7, 'seven']])('%i wrong: %s - counted, and nothing moves: not the level, not the run, not the end of the climb', (wrong) => {
    for (const [streak, settled] of [[1, true], [0, true], [-1, true], [0, false]] as const) {
      const s = from('sub', 3, streak, settled);
      recordDare(s, 'sub', 4, wrong, false, { type: 'sub' });
      expect(s.skills.sub, `run ${streak}, climb over: ${settled}`).toMatchObject({ level: 3, streak, tasks: 1, first: 0, errors: wrong });
      expect(climbs(s.skills.sub), `run ${streak}, climb over: ${settled}`).toBe(!settled);
      expect(s.answers?.sub.map((a) => a.ok)).toEqual([0]);
    }
  });

  it('the same task recorded as a usual one would step the level down: asking for a harder example never does', () => {
    const usual = from('add', 3, 0), asked = from('add', 3, 0);
    recordTask(usual, 'add', 3, false, { type: 'add' });
    recordDare(asked, 'add', 4, 3, false, { type: 'add' });
    expect([usual.skills.add.level, asked.skills.add.level]).toEqual([2, 3]);
  });

  it('solved with a helper: no clean solve, no step up; the run of clean solves of the achievement ends', () => {
    const s = from('count', 2, 1);
    play(s, 'pattern', 0, 0);
    recordDare(s, 'count', 3, 0, true, { type: 'count' });
    expect(s.skills.count).toMatchObject({ level: 2, streak: 1, tasks: 1, first: 0, errors: 0 });
    expect(s.clean).toEqual({ run: 0, best: 2 });
  });

  it('never above the top of the skill, never a step down: a level asked past the top is the top, one not above her own changes nothing', () => {
    const top = from('add', 4, 1);
    recordDare(top, 'add', 9, 0);
    expect(top.skills.add).toMatchObject({ level: 5, streak: 0 });
    const same = from('add', 4, 1);
    recordDare(same, 'add', 4, 0);
    expect(same.skills.add).toMatchObject({ level: 4, streak: 1, tasks: 1, first: 1 });
    const lower = from('add', 4, 1);
    recordDare(lower, 'add', 2, 0);
    expect(lower.skills.add).toMatchObject({ level: 4, streak: 1 });
  });

  it('a late skill is written into the save by it, as by any task', () => {
    const s = defaultSave();
    expect(s.skills.attention).toBeUndefined();
    recordDare(s, 'attention', 2, 0);
    expect(s.skills.attention).toMatchObject({ level: 2, tasks: 1, first: 1 });
  });

  it('touches the skill named only', () => {
    const s = from('add', 3, 1), other = JSON.stringify(s.skills.sub);
    recordDare(s, 'add', 4, 0);
    expect(JSON.stringify(s.skills.sub)).toBe(other);
  });
});
