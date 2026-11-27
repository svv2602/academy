import { afterEach, describe, expect, it, vi } from 'vitest';
import { SEASON2_SKILLS, SKILLS, levelFor, recordTask } from '../game/skills';
import type { SkillId } from '../game/skills';
import { defaultSave } from './save';
import { mulberry32 } from './util';

/**
 * LEARN-17, repeated on five levels for LEARN-15 (R22) and measured again on 2026-11-27 with the fast climb (decision
 * Q17): what the level rule does to a child over a whole session, not over one step. Five made-up children play 200
 * tasks each through the real recordTask and levelFor. The rule is never copied here, so a change in
 * src/game/skills.ts changes the table and trips the corridors below.
 */

/**
 * Chances of a clean solve, of one, two and three wrong answers (the step of the hint reached, HINTS.md); they add
 * up to 1. Levels 1 to 3 keep the odds of 2026-11-14 (no third step then: the answer was shown after the second).
 */
type Odds = readonly [clean: number, oneWrong: number, twoWrong: number, threeWrong: number];
/** Odds at levels 1 to 5. */
type Profile = readonly [Odds, Odds, Odds, Odds, Odds];
const LEVEL_COUNT = 5;
type ChildId = 'confident' | 'average' | 'uneven' | 'guessing' | 'tiring';

interface Child {
  id: ChildId;
  /** One fixed seed per child: the run is the same on every machine. */
  seed: number;
  /** Odds for every skill that has no entry in `skills`. */
  base: Profile;
  skills?: Partial<Record<SkillId, Profile>>;
  /** Share of the clean chance lost by the last task; the loss grows evenly from the first task on. */
  fatigue?: number;
}

const TASKS = 200;
/** "Settled" is tasks 101…200: by then every skill has had 12 or 13 tasks, more than the way from 1 to 5 takes (4 in the fast climb, 8 after it). */
const SETTLED_FROM = TASKS / 2;
/**
 * The skills some kind of task trains take turns, 25 tasks each (the composition of a number has no task yet; attention,
 * "find the differences", is played from the second world on - the runs were measured on the first world's skills; the
 * skills of Season 2 have no task yet).
 */
const ROUND: readonly SkillId[] = SKILLS.filter((k) => k !== 'compose' && k !== 'attention' && k !== 'assemble' && !SEASON2_SKILLS.includes(k));

/**
 * Levels 4 and 5 (numbers to 20, two features at once) were written down on 2026-11-16 before the first run on five
 * levels, from the same idea as levels 1 to 3: each level harder than the one below, the third step rare for a child
 * who is sure. Do not tune them to the table.
 */
const CONFIDENT: Profile = [[0.97, 0.03, 0.00, 0], [0.93, 0.06, 0.01, 0], [0.88, 0.10, 0.02, 0], [0.85, 0.11, 0.03, 0.01], [0.80, 0.14, 0.04, 0.02]];
const AVERAGE: Profile = [[0.95, 0.04, 0.01, 0], [0.85, 0.12, 0.03, 0], [0.50, 0.35, 0.15, 0], [0.35, 0.35, 0.20, 0.10], [0.20, 0.35, 0.25, 0.20]];
const WEAK: Profile = [[0.70, 0.20, 0.10, 0], [0.40, 0.35, 0.25, 0], [0.20, 0.40, 0.40, 0], [0.10, 0.35, 0.35, 0.20], [0.05, 0.30, 0.35, 0.30]];
/**
 * Four options picked blindly, a wrong one never picked twice: 1/4 at once, 1/4 on the second try, on the third, and
 * the answer shown at the third step otherwise (on the ladder of three steps; before it, the second showed it).
 */
const GUESS: Profile = [[0.25, 0.25, 0.25, 0.25], [0.25, 0.25, 0.25, 0.25], [0.25, 0.25, 0.25, 0.25], [0.25, 0.25, 0.25, 0.25], [0.25, 0.25, 0.25, 0.25]];

/** The odds were written down before the first run (LEARN-17 in docs/11-learning.md). Do not tune them to the table. */
const CHILDREN: readonly Child[] = [
  { id: 'confident', seed: 2026, base: CONFIDENT },                                       // even the top level is easy
  { id: 'average', seed: 2027, base: AVERAGE },                                           // sure at level 2, every other task at level 3, then harder
  { id: 'uneven', seed: 2028, base: AVERAGE, skills: { count: CONFIDENT, sub: WEAK } },   // counting is easy, subtraction is hard
  { id: 'guessing', seed: 2029, base: GUESS },                                            // the level makes no difference
  { id: 'tiring', seed: 2030, base: AVERAGE, fatigue: 0.5 },                              // average at first, half as clean by the end
];

interface Stats {
  /** Level the most tasks were played at (the lower one on a tie). */
  mainLevel: number;
  /** Tasks after which the level of the played skill was different. */
  changes: number;
  /** Longest run of tasks with a wrong answer, in the order the child met them, across skills. */
  shakyRun: number;
  /** Share of clean solves, percent. */
  clean: number;
  /** Tasks played below the top level: the way up and every dip (what the fast climb shortens for a child who is sure). */
  belowTop: number;
  /** Level the most tasks 101…200 were played at. */
  settledLevel: number;
  /** Level changes within tasks 101…200. */
  settledChanges: number;
  /** Longest stretch of tasks 101…200 without a level change. */
  settledCalm: number;
  /** Share of clean solves over tasks 101…200, percent: what the child lives with once the rule has found a level. */
  settledClean: number;
  bySkill: Record<SkillId, { mainLevel: number; changes: number }>;
  /** What the save itself counted, to prove that every task went through recordTask. */
  recorded: { tasks: number; first: number };
}

const percent = (part: number, whole: number) => Math.round((part / whole) * 1000) / 10;
/** Level with the largest count; the first of equal counts wins. */
const busiest = (tasksAtLevel: number[]) => tasksAtLevel.indexOf(Math.max(...tasksAtLevel)) + 1;

function oddsAt(child: Child, skill: SkillId, level: number, i: number): Odds {
  const [clean, one, two, three] = (child.skills?.[skill] ?? child.base)[level - 1];
  const lost = clean * (child.fatigue ?? 0) * (i / (TASKS - 1));      // split evenly between one and two wrong answers
  return [clean - lost, one + lost / 2, two + lost / 2, three];
}

function simulate(child: Child, seed = child.seed): Stats {
  const rnd = mulberry32(seed);
  const save = defaultSave();
  const levels = () => Array<number>(LEVEL_COUNT).fill(0);
  const atLevel = levels(), settledAtLevel = levels();
  const skill = Object.fromEntries(ROUND.map((id) => [id, { atLevel: levels(), changes: 0 }])) as
    Record<SkillId, { atLevel: number[]; changes: number }>;
  let changes = 0, clean = 0, shaky = 0, shakyRun = 0;
  let settledChanges = 0, settledClean = 0, calm = 0, settledCalm = 0;
  for (let i = 0; i < TASKS; i++) {
    const id = ROUND[i % ROUND.length];
    const level = levelFor(save, id);
    const [pClean, pOne, pTwo] = oddsAt(child, id, level, i);
    const roll = rnd();                                               // one number per task, nothing else is random
    const wrong = roll < pClean ? 0 : roll < pClean + pOne ? 1 : roll < pClean + pOne + pTwo ? 2 : 3;
    recordTask(save, id, wrong);
    const changed = levelFor(save, id) !== level;

    atLevel[level - 1]++; skill[id].atLevel[level - 1]++;
    if (wrong === 0) { clean++; shaky = 0; } else { shaky++; shakyRun = Math.max(shakyRun, shaky); }
    if (changed) { changes++; skill[id].changes++; }
    if (i >= SETTLED_FROM) {
      settledAtLevel[level - 1]++;
      if (wrong === 0) settledClean++;
      if (changed) { settledChanges++; calm = 0; } else { calm++; settledCalm = Math.max(settledCalm, calm); }
    }
  }
  const stats = Object.values(save.skills);
  return {
    mainLevel: busiest(atLevel), changes, shakyRun, clean: percent(clean, TASKS), belowTop: TASKS - atLevel[LEVEL_COUNT - 1],
    settledLevel: busiest(settledAtLevel), settledChanges, settledCalm, settledClean: percent(settledClean, TASKS - SETTLED_FROM),
    bySkill: Object.fromEntries(ROUND.map((id) => [id, { mainLevel: busiest(skill[id].atLevel), changes: skill[id].changes }])) as Stats['bySkill'],
    recorded: { tasks: stats.reduce((sum, k) => sum + k.tasks, 0), first: stats.reduce((sum, k) => sum + k.first, 0) },
  };
}

/**
 * A seesaw, as defined before the first measurement (2026-11-14) and kept for the run on five levels: in tasks
 * 101…200 the level changes more often than once in five tasks and it never rests — the longest stretch without
 * a change is shorter than 20 tasks.
 */
const SEESAW_CHANGES = 20, SEESAW_CALM = 20;
const seesaws = (s: Stats) => s.settledChanges > SEESAW_CHANGES && s.settledCalm < SEESAW_CALM;

type Range = readonly [min: number, max: number];
interface Limits { mainLevel: number; changes: Range; shakyRun: Range; clean: Range; settledChanges: Range }

/**
 * Measured on 2026-11-27 on the rule of LEARN-15 with its fast climb (src/game/skills.ts) and five levels; eight skills
 * take turns. The comment beside each corridor lists the five measured values, for seeds seed + 100·j, j = 0…4; the
 * first one is the seed fixed above. A corridor is the lowest and the highest of the five, widened on both sides by half
 * of their spread, rounded up (at least 2 for level changes, tasks and percent, at least 1 for the shaky run), and never
 * below 0. An exact number would break on any honest edit of the run; a corridor wider than two spreads would let
 * a different rule through. The numbers of 2026-11-16, before the climb, are kept in docs/11-learning.md (LEARN-17).
 */
const LIMITS: Record<ChildId, Limits> = {
  confident: {
    mainLevel: 5,                 // 5 · 5 · 5 · 5 · 5 — the top level, where the child still solves four tasks in five
    changes: [30, 45],            // 41 · 40 · 34 · 37 · 40 — mostly the climb: eight skills from 1 to 5 are 32 changes
    shakyRun: [2, 5],             // 3 · 4 · 3 · 3 · 3
    clean: [75, 90.5],            // 79 · 80 · 83 · 79 · 86.5
    settledChanges: [0, 12],      // 7 · 4 · 0 · 3 · 8
  },
  average: {
    mainLevel: 4,                 // 4 · 4 · 4 · 3 · 3 — was 3 on all five before the climb: she gets to the hard levels sooner
    changes: [38, 74],            // 65 · 64 · 65 · 47 · 59
    shakyRun: [4, 12],            // 6 · 8 · 10 · 10 · 9
    clean: [34, 52.5],            // 45.5 · 44.5 · 47.5 · 39 · 43 — was 47.5…55 before the climb (finding, see Q12 below)
    settledChanges: [12, 28],     // 24 · 22 · 22 · 16 · 20 — was 28…38 on the rule of 2026-11-14
  },
  uneven: {
    mainLevel: 4,                 // 4 · 4 · 4 · 3 · 3
    changes: [54, 65],            // 60 · 62 · 61 · 57 · 58
    shakyRun: [2, 10],            // 5 · 7 · 8 · 4 · 7
    clean: [42.5, 58.5],          // 46.5 · 53 · 54.5 · 50.5 · 48 — was 54…60.5 before the climb
    settledChanges: [15, 26],     // 23 · 22 · 21 · 20 · 18
  },
  guessing: {
    mainLevel: 1,                 // 1 · 1 · 1 · 1 · 1
    changes: [0, 42],             // 10 · 31 · 16 · 24 · 31
    shakyRun: [3, 27],            // 21 · 12 · 14 · 9 · 12
    clean: [13, 36],              // 19 · 24 · 24.5 · 30 · 29.5
    settledChanges: [0, 20],      // 3 · 10 · 7 · 14 · 13
  },
  tiring: {
    mainLevel: 3,                 // 3 · 4 · 3 · 3 · 3
    changes: [48, 68],            // 53 · 58 · 63 · 59 · 59
    shakyRun: [4, 15],            // 12 · 9 · 11 · 11 · 7
    clean: [29, 44],              // 33 · 38.5 · 36 · 37 · 40 — was 41.5…46.5 before the climb
    settledChanges: [15, 30],     // 19 · 23 · 20 · 26 · 19
  },
};

const run = (id: ChildId) => simulate(CHILDREN.find((child) => child.id === id)!);
function within(value: number, [min, max]: Range, what: string) {
  expect(value, `${what} = ${value}, measured corridor ${min}…${max}`).toBeGreaterThanOrEqual(min);
  expect(value, `${what} = ${value}, measured corridor ${min}…${max}`).toBeLessThanOrEqual(max);
}

afterEach(() => { vi.restoreAllMocks(); });

describe('the made-up children', () => {
  it('are the five from LEARN-17, each with its own seed', () => {
    expect(CHILDREN.map((child) => child.id)).toEqual(['confident', 'average', 'uneven', 'guessing', 'tiring']);
    expect(new Set(CHILDREN.map((child) => child.seed)).size).toBe(CHILDREN.length);
  });

  it('play every skill some kind of task trains, on all five levels', () => {
    expect(ROUND).toEqual(['count', 'add', 'sub', 'compare', 'series', 'pattern', 'memory', 'classify']);
    const levels = new Set<number>();
    const save = defaultSave();
    for (const level of [1, 2, 3, 4, 5]) { save.fixed.count = level; levels.add(levelFor(save, 'count')); }
    expect([...levels]).toEqual([1, 2, 3, 4, 5]);
    expect(run('confident').mainLevel).toBe(5);       // the run itself gets to the top level
  });

  it.each(CHILDREN)('$id: the odds of every skill, level and task add up to 1 and none is negative', (child) => {
    for (const skill of ROUND) for (const level of [1, 2, 3, 4, 5]) for (const i of [0, TASKS - 1]) {
      const odds = oddsAt(child, skill, level, i);
      expect(odds[0] + odds[1] + odds[2] + odds[3]).toBeCloseTo(1, 10);
      expect(Math.min(...odds)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe.each(CHILDREN)('level rule over 200 tasks on five levels: $id child', (child) => {
  const stats = simulate(child);
  const limits = LIMITS[child.id];

  it('sends every task through recordTask', () => {
    expect(stats.recorded.tasks).toBe(TASKS);
    expect(percent(stats.recorded.first, TASKS)).toBe(stats.clean);
  });

  it(`spends most tasks at level ${limits.mainLevel}`, () => {
    expect(stats.mainLevel, `${child.id}: level with the most tasks`).toBe(limits.mainLevel);
  });

  it.each(['changes', 'shakyRun', 'clean', 'settledChanges'] as const)('%s stays within the measured corridor', (metric) => {
    within(stats[metric], limits[metric], `${child.id}: ${metric}`);
  });
});

describe('level rule over 200 tasks on five levels: seesaw between levels', () => {
  it.each(['confident', 'guessing'] as const)('%s child does not seesaw (on all five seeds)', (id) => {
    const stats = run(id);
    expect(seesaws(stats), `${id}: ${stats.settledChanges} changes in tasks 101…200, longest calm stretch ${stats.settledCalm}`).toBe(false);
  });

  /**
   * FINDING of 2026-11-16, not a wish, measured again on 2026-11-27 with the fast climb: the rule of LEARN-15 halves the
   * seesaw of the first rule, but does not end it, and the climb does not mend it. In tasks 101…200 the average child
   * changes level 16…24 times (28…38 on the rule of 2026-11-14) and meets the definition on three seeds of five, the
   * uneven one on three, the tiring one on two. The test holds the measured corridors of the calm stretch, so that the
   * behaviour does not change unnoticed.
   */
  it.each([['average', [8, 19]], ['uneven', [6, 18]], ['tiring', [4, 24]]] as const)('%s child: the longest calm stretch stays within the measured corridor (finding)', (id, corridor) => {
    within(run(id).settledCalm, corridor, `${id}: settledCalm`);   // 16 · 11 · 13 · 16 · 14; 9 · 10 · 15 · 13 · 15; 16 · 19 · 19 · 9 · 10
  });

  it('uneven child: the strong skill gets to the top while the weak one stays low', () => {
    const { count, sub } = run('uneven').bySkill;
    expect(count.mainLevel, 'uneven: main level of count').toBe(5);      // 5 on all five seeds
    expect(sub.mainLevel, 'uneven: main level of sub').toBe(2);          // 2 · 2 · 2 · 3 · 2
    within(count.changes, [2, 10], 'uneven: level changes of count');    // 8 · 4 · 4 · 5 · 6
    within(sub.changes, [1, 9], 'uneven: level changes of sub');         // 6 · 5 · 5 · 3 · 7
  });
});

describe('level rule over 200 tasks on five levels: what the fast climb changes (LEARN-15, the amendment of 2026-11-27)', () => {
  /**
   * The child who is sure plays about half as many tasks below the top level: 48 · 46 · 35 · 41 · 46 of 200, against
   * 95 · 87 · 76 · 83 · 80 by the rule of the card alone - the way up through eight skills takes 32 tasks, not 64.
   */
  it('confident child: the tasks below the top level stay within the measured corridor, half of what they were', () => {
    within(run('confident').belowTop, [28, 55], 'confident: belowTop');
  });
});

describe('level rule over 200 tasks on five levels: share of clean solves once the level has settled (decision Q12)', () => {
  /**
   * FINDING of 2026-11-16, measured again on 2026-11-27: Q12 asks for 70–85 % of clean solves at the settled level; the
   * rule of LEARN-15 gives the average child 41 % on the fixed seed and 35…41 % over five seeds (41 · 41 · 39 · 35 · 37):
   * a single wrong answer and a lone second step do not lower the level, so the child settles at level 4 (four seeds of
   * five) or 3, where she solves cleanly every third task. The fast climb does not change where she settles; it takes
   * her there sooner, so over the whole session she solves cleanly 39…47.5 % of the tasks, against 47.5…55 % before it.
   * The test holds the measured corridor.
   */
  it('average child: settles at level 4 with the measured share of clean solves, below the 70–85 % of Q12', () => {
    const stats = run('average');
    expect(stats.settledLevel, 'average: settled level').toBe(4);        // 4 · 4 · 4 · 4 · 3
    within(stats.settledClean, [32, 44], 'average: settledClean');
  });

  it.todo('average child: 70–85 % of clean solves at the settled level — the rule of LEARN-15 does not give it (finding above)');

  it('tiring child: solves less cleanly in the second half than over the whole session', () => {
    const stats = run('tiring');
    within(stats.settledClean, [18, 37], 'tiring: settledClean');        // 31 · 32 · 23 · 31 · 32
    expect(stats.settledClean).toBeLessThan(stats.clean);
  });
});

describe('the run itself', () => {
  it('gives the same table twice and never asks Math.random', () => {
    const random = vi.spyOn(Math, 'random');
    const table = () => CHILDREN.map((child) => simulate(child));
    expect(table()).toEqual(table());
    expect(random).not.toHaveBeenCalled();
  });

  it('depends on the seed', () => {
    const average = CHILDREN[1];
    expect(simulate(average, average.seed + 100)).not.toEqual(simulate(average));
  });
});
