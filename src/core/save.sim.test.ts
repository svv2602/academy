import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, levelFor, recordTask } from './save';
import type { SkillId } from './save';
import { mulberry32 } from './util';

/**
 * LEARN-17: what the level rule does to a child over a whole session, not over one step.
 * Five made-up children play 200 tasks each through the real recordTask and levelFor. The rule is never copied
 * here, so a change in save.ts changes the table and trips the corridors below.
 */

/** Chances of a clean solve, of one wrong answer and of two wrong answers; they add up to 1. */
type Odds = readonly [clean: number, oneWrong: number, twoWrong: number];
/** Odds at levels 1, 2 and 3. */
type Profile = readonly [Odds, Odds, Odds];
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
/** "Settled" is tasks 101…200: by then every skill has had 20 tasks, five times what the climb from 1 to 3 takes. */
const SETTLED_FROM = TASKS / 2;
/** Skills take turns, 40 tasks each. */
const ROUND: readonly SkillId[] = ['count', 'add', 'sub', 'compare', 'logic'];

const CONFIDENT: Profile = [[0.97, 0.03, 0.00], [0.93, 0.06, 0.01], [0.88, 0.10, 0.02]];
const AVERAGE: Profile = [[0.95, 0.04, 0.01], [0.85, 0.12, 0.03], [0.50, 0.35, 0.15]];
const WEAK: Profile = [[0.70, 0.20, 0.10], [0.40, 0.35, 0.25], [0.20, 0.40, 0.40]];
/** Four options picked blindly: 1/4 at once, 3/4 · 1/3 on the second try, two wrong answers otherwise. */
const GUESS: Profile = [[0.25, 0.25, 0.50], [0.25, 0.25, 0.50], [0.25, 0.25, 0.50]];

/** The odds were written down before the first run (LEARN-17 in docs/11-learning.md). Do not tune them to the table. */
const CHILDREN: readonly Child[] = [
  { id: 'confident', seed: 2026, base: CONFIDENT },                                       // even the top level is easy
  { id: 'average', seed: 2027, base: AVERAGE },                                           // sure at level 2, every other task at level 3
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
  const [clean, one, two] = (child.skills?.[skill] ?? child.base)[level - 1];
  const lost = clean * (child.fatigue ?? 0) * (i / (TASKS - 1));      // split evenly between one and two wrong answers
  return [clean - lost, one + lost / 2, two + lost / 2];
}

function simulate(child: Child, seed = child.seed): Stats {
  const rnd = mulberry32(seed);
  const save = defaultSave();
  const atLevel = [0, 0, 0], settledAtLevel = [0, 0, 0];
  const skill = Object.fromEntries(ROUND.map((id) => [id, { atLevel: [0, 0, 0], changes: 0 }])) as
    Record<SkillId, { atLevel: number[]; changes: number }>;
  let changes = 0, clean = 0, shaky = 0, shakyRun = 0;
  let settledChanges = 0, settledClean = 0, calm = 0, settledCalm = 0;
  for (let i = 0; i < TASKS; i++) {
    const id = ROUND[i % ROUND.length];
    const level = levelFor(save, id);
    const [pClean, pOne] = oddsAt(child, id, level, i);
    const roll = rnd();                                               // one number per task, nothing else is random
    const wrong = roll < pClean ? 0 : roll < pClean + pOne ? 1 : 2;
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
 * A seesaw, as defined before the measurement: in tasks 101…200 the level changes more often than once in five
 * tasks (five skills take turns, so that is more than one change per round; the rule allows at most two changes
 * in three tasks) and it never rests — the longest stretch without a change is shorter than 20 tasks.
 */
const SEESAW_CHANGES = 20, SEESAW_CALM = 20;
const seesaws = (s: Stats) => s.settledChanges > SEESAW_CHANGES && s.settledCalm < SEESAW_CALM;

type Range = readonly [min: number, max: number];
interface Limits { mainLevel: number; changes: Range; shakyRun: Range; clean: Range; settledChanges: Range }

/**
 * Measured on the present rule on 2026-11-14 (table in LEARN-17, docs/11-learning.md). The comment beside each
 * corridor lists the five measured values, for seeds seed + 100·j, j = 0…4; the first one is the seed fixed above.
 * A corridor is the lowest and the highest of the five, widened on both sides by half of their spread, rounded up
 * (at least 2 for level changes and percent, at least 1 for the shaky run). An exact number would break on any
 * honest edit of the run; a corridor wider than two spreads would let a different rule through.
 */
const LIMITS: Record<ChildId, Limits> = {
  confident: {
    mainLevel: 3,                 // 3 · 3 · 3 · 3 · 3
    changes: [13, 32],            // 27 · 20 · 18 · 21 · 19 — a single double mistake at level 3 costs a level, two clean solves return it
    shakyRun: [1, 4],             // 2 · 2 · 2 · 3 · 2
    clean: [81, 95.5],            // 85 · 87 · 90 · 86.5 · 91.5
    settledChanges: [2, 13],      // 10 · 5 · 6 · 5 · 9
  },
  average: {
    mainLevel: 3,                 // 3 · 3 · 3 · 3 · 2 (a 93/93 tie on the last seed) — not level 2, where the child is sure
    changes: [50, 78],            // 57 · 69 · 65 · 63 · 71 — a level change every three tasks
    shakyRun: [3, 7],             // 4 · 6 · 5 · 5 · 4
    clean: [58.5, 77],            // 69 · 70.5 · 72 · 65.5 · 63.5
    settledChanges: [23, 43],     // 33 · 35 · 36 · 28 · 38 — the whole corridor is above SEESAW_CHANGES
  },
  uneven: {
    mainLevel: 3,                 // 3 · 3 · 3 · 3 · 3
    changes: [45, 65],            // 52 · 50 · 51 · 60 · 52
    shakyRun: [0, 7],             // 3 · 4 · 3 · 2 · 5
    clean: [66.5, 74],            // 68.5 · 70 · 72 · 71.5 · 69.5
    settledChanges: [17, 33],     // 21 · 24 · 25 · 29 · 21
  },
  guessing: {
    mainLevel: 1,                 // 1 · 1 · 1 · 1 · 1
    changes: [0, 33],             // 7 · 18 · 24 · 15 · 19 — two lucky guesses in a row lift the level, a double mistake soon drops it
    shakyRun: [3, 27],            // 21 · 12 · 14 · 9 · 12
    clean: [13, 36],              // 19 · 24 · 24.5 · 30 · 29.5
    settledChanges: [0, 20],      // 3 · 6 · 14 · 11 · 9
  },
  tiring: {
    mainLevel: 2,                 // 2 · 2 · 2 · 2 · 2
    changes: [58, 86],            // 65 · 72 · 79 · 71 · 68
    shakyRun: [2, 10],            // 8 · 7 · 5 · 5 · 4
    clean: [53, 63.5],            // 56 · 60 · 60.5 · 58.5 · 57.5
    settledChanges: [24, 48],     // 30 · 37 · 42 · 32 · 36
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

  it.each(CHILDREN)('$id: the odds of every skill, level and task add up to 1 and none is negative', (child) => {
    for (const skill of ROUND) for (const level of [1, 2, 3]) for (const i of [0, TASKS - 1]) {
      const odds = oddsAt(child, skill, level, i);
      expect(odds[0] + odds[1] + odds[2]).toBeCloseTo(1, 10);
      expect(Math.min(...odds)).toBeGreaterThanOrEqual(0);
    }
  });
});

describe.each(CHILDREN)('level rule over 200 tasks: $id child', (child) => {
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

describe('level rule over 200 tasks: seesaw between levels', () => {
  it.each(['confident', 'guessing'] as const)('%s child does not seesaw', (id) => {
    const stats = run(id);
    expect(seesaws(stats), `${id}: ${stats.settledChanges} changes in tasks 101…200, longest calm stretch ${stats.settledCalm}`).toBe(false);
  });

  /**
   * FINDING for LEARN-15, not a wish: the measurement confirmed the hypothesis of LEARN-17. A child who is sure at
   * level 2 and solves every other task at level 3 is moved up and down without a rest (five seeds: 28…38 changes
   * in tasks 101…200, longest calm stretch 6…9 tasks), and so is the tiring one (30…42 changes, 6…8 tasks). The
   * uneven child meets the definition on all five seeds too, but only just on the fixed one (21 changes), so here
   * it is held by its corridor alone. The rule belongs to LEARN-15; when it changes there, this test must flip to
   * "does not seesaw". Until then it keeps the measured behaviour from changing unnoticed.
   */
  it.each(['average', 'tiring'] as const)('%s child seesaws under the present rule (finding for LEARN-15)', (id) => {
    const stats = run(id);
    expect(seesaws(stats), `${id}: ${stats.settledChanges} changes in tasks 101…200, longest calm stretch ${stats.settledCalm}`).toBe(true);
    within(stats.settledCalm, id === 'average' ? [4, 11] : [4, 10], `${id}: settledCalm`);     // 9 · 8 · 9 · 9 · 6 and 8 · 6 · 6 · 8 · 7
  });

  it('uneven child: the strong skill stays at the top while the weak one stays at the bottom', () => {
    const { count, sub } = run('uneven').bySkill;
    expect(count.mainLevel, 'uneven: main level of count').toBe(3);      // 3 on all five seeds
    expect(sub.mainLevel, 'uneven: main level of sub').toBe(1);          // 1 on all five seeds
    within(count.changes, [0, 8], 'uneven: level changes of count');     // 4 · 6 · 6 · 2 · 4
    within(sub.changes, [10, 17], 'uneven: level changes of sub');       // 12 · 13 · 14 · 15 · 14
  });
});

describe('level rule over 200 tasks: share of clean solves once the level has settled (decision Q12)', () => {
  /**
   * FINDING: Q12 asks for 70–85 % of clean solves at the settled level; the present rule gives the average child
   * 67 % on the fixed seed and 60…70 % over five seeds (67 · 70 · 68 · 66 · 60), because it keeps the child at
   * level 3 more than at level 2. The test holds the measured corridor, not the wished one.
   */
  it('average child: settles at level 3 with the measured share of clean solves, below the 70–85 % of Q12', () => {
    const stats = run('average');
    expect(stats.settledLevel, 'average: settled level').toBe(3);        // 3 on all five seeds
    within(stats.settledClean, [55, 75], 'average: settledClean');
  });

  it.todo('average child: 70–85 % of clean solves at the settled level — after the rule changes in LEARN-15');

  it('tiring child: solves less cleanly in the second half than over the whole session', () => {
    const stats = run('tiring');
    within(stats.settledClean, [48, 56], 'tiring: settledClean');        // 50 · 54 · 52 · 52 · 51
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
