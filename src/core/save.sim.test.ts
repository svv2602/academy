import { afterEach, describe, expect, it, vi } from 'vitest';
import { SKILLS, levelFor, recordTask } from '../game/skills';
import type { SkillId } from '../game/skills';
import { defaultSave } from './save';
import { mulberry32 } from './util';

/**
 * LEARN-17, repeated on five levels for LEARN-15 (R22): what the level rule does to a child over a whole session, not
 * over one step. Five made-up children play 200 tasks each through the real recordTask and levelFor. The rule is never
 * copied here, so a change in src/game/skills.ts changes the table and trips the corridors below.
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
/** "Settled" is tasks 101…200: by then every skill has had 12 or 13 tasks, more than the climb from 1 to 5 takes (8). */
const SETTLED_FROM = TASKS / 2;
/**
 * The skills some kind of task trains take turns, 25 tasks each (the composition of a number has no task yet; attention,
 * "find the differences", is played from the second world on - the runs were measured on the first world's skills).
 */
const ROUND: readonly SkillId[] = SKILLS.filter((k) => k !== 'compose' && k !== 'attention' && k !== 'assemble');

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
    mainLevel: busiest(atLevel), changes, shakyRun, clean: percent(clean, TASKS),
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
 * Measured on 2026-11-16 on the rule of LEARN-15 (src/game/skills.ts) and five levels; eight skills take turns.
 * The comment beside each corridor lists the five measured values, for seeds seed + 100·j, j = 0…4; the first one
 * is the seed fixed above. A corridor is the lowest and the highest of the five, widened on both sides by half of
 * their spread, rounded up (at least 2 for level changes and percent, at least 1 for the shaky run), and never
 * below 0. An exact number would break on any honest edit of the run; a corridor wider than two spreads would let
 * a different rule through.
 */
const LIMITS: Record<ChildId, Limits> = {
  confident: {
    mainLevel: 5,                 // 5 · 5 · 5 · 5 · 5 — the top level, where the child still solves four tasks in five
    changes: [28, 44],            // 39 · 38 · 32 · 37 · 40 — mostly the climb: eight skills from 1 to 5 are 32 changes
    shakyRun: [1, 5],             // 3 · 4 · 3 · 3 · 2
    clean: [76.5, 92.5],          // 81 · 80.5 · 84.5 · 81 · 88.5
    settledChanges: [0, 14],      // 9 · 4 · 0 · 4 · 8
  },
  average: {
    mainLevel: 3,                 // 3 · 3 · 3 · 3 · 3
    changes: [35, 62],            // 53 · 48 · 55 · 42 · 45
    shakyRun: [4, 11],            // 6 · 8 · 8 · 7 · 9
    clean: [43.5, 59],            // 54 · 53 · 55 · 47.5 · 48
    settledChanges: [11, 31],     // 26 · 20 · 23 · 16 · 19 — was 28…38 on the rule of 2026-11-14
  },
  uneven: {
    mainLevel: 3,                 // 3 · 4 · 4 · 3 · 3
    changes: [40, 60],            // 52 · 52 · 55 · 45 · 47
    shakyRun: [2, 10],            // 5 · 7 · 8 · 4 · 7
    clean: [50, 64.5],            // 54 · 56.5 · 60.5 · 56.5 · 55
    settledChanges: [15, 27],     // 24 · 21 · 21 · 22 · 18
  },
  guessing: {
    mainLevel: 1,                 // 1 · 1 · 1 · 1 · 1
    changes: [0, 35],             // 6 · 25 · 14 · 20 · 23
    shakyRun: [3, 27],            // 21 · 12 · 14 · 9 · 12
    clean: [13, 36],              // 19 · 24 · 24.5 · 30 · 29.5
    settledChanges: [0, 20],      // 3 · 9 · 7 · 14 · 13
  },
  tiring: {
    mainLevel: 3,                 // 3 · 3 · 3 · 3 · 3
    changes: [34, 62],            // 41 · 43 · 55 · 54 · 41
    shakyRun: [4, 15],            // 12 · 8 · 10 · 11 · 7
    clean: [38.5, 49.5],          // 41.5 · 46.5 · 44 · 45 · 46
    settledChanges: [15, 30],     // 19 · 22 · 21 · 26 · 19
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
   * FINDING of 2026-11-16, not a wish: the rule of LEARN-15 halves the seesaw, but does not end it. In tasks 101…200
   * the average child changes level 16…26 times (28…38 on the old rule) and meets the definition on two seeds of five
   * (all five on the old rule), the tiring one on three of five, the uneven one on four of five. The test holds the
   * measured corridors of the calm stretch, so that the behaviour does not change unnoticed.
   */
  it.each([['average', [11, 18]], ['uneven', [7, 18]], ['tiring', [4, 24]]] as const)('%s child: the longest calm stretch stays within the measured corridor (finding)', (id, corridor) => {
    within(run(id).settledCalm, corridor, `${id}: settledCalm`);   // 16 · 14 · 13 · 16 · 14; 13 · 10 · 15 · 12 · 15; 16 · 19 · 19 · 9 · 10
  });

  it('uneven child: the strong skill gets to the top while the weak one stays low', () => {
    const { count, sub } = run('uneven').bySkill;
    expect(count.mainLevel, 'uneven: main level of count').toBe(5);      // 5 on all five seeds
    expect(sub.mainLevel, 'uneven: main level of sub').toBe(1);          // 1 · 2 · 2 · 3 · 2
    within(count.changes, [2, 10], 'uneven: level changes of count');    // 8 · 4 · 4 · 5 · 6
    within(sub.changes, [2, 9], 'uneven: level changes of sub');         // 4 · 5 · 5 · 3 · 7
  });
});

describe('level rule over 200 tasks on five levels: share of clean solves once the level has settled (decision Q12)', () => {
  /**
   * FINDING of 2026-11-16: Q12 asks for 70–85 % of clean solves at the settled level; the rule of LEARN-15 gives the
   * average child 46 % on the fixed seed and 36…46 % over five seeds (46 · 41 · 41 · 36 · 37), lower than the old rule
   * (60…70 %): a single wrong answer and a lone second step no longer lower the level, so the child settles at level
   * 4 (three seeds of five) or 3, where she solves cleanly every third task. The test holds the measured corridor.
   */
  it('average child: settles at level 4 with the measured share of clean solves, below the 70–85 % of Q12', () => {
    const stats = run('average');
    expect(stats.settledLevel, 'average: settled level').toBe(4);        // 4 · 4 · 4 · 3 · 3
    within(stats.settledClean, [31, 51], 'average: settledClean');
  });

  it.todo('average child: 70–85 % of clean solves at the settled level — the rule of LEARN-15 does not give it (finding above)');

  it('tiring child: solves less cleanly in the second half than over the whole session', () => {
    const stats = run('tiring');
    within(stats.settledClean, [19, 38], 'tiring: settledClean');        // 33 · 33 · 24 · 32 · 32
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
