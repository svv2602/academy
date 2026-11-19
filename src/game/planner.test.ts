// @vitest-environment happy-dom
/**
 * The planner of the panel tasks (src/game/planner.ts):
 * - LEARN-11 (R17, R18): the examples with mistakes of addition, take away and the composition of a number are kept,
 *   come back no earlier than after two other tasks and until solved cleanly twice; the save stays under 20 KB after
 *   500 tasks;
 * - LEARN-13 (R19, R20): 1000 pairs of neighbouring tasks of every type and level, none the same task twice in a row;
 *   no 1 + 1 and no 1 - 1 from level 2;
 * - LEARN-16 (R23, R24): replaying a finished chain plays the step of the skill with the lowest share of clean solves;
 * - PLAY-15 (R27): the parents' section lists the five hardest examples, in numbers.
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../core/rng';
import { mulberry32, randInt } from '../core/util';
import { HARD_MAX, defaultSave, storeSave, worldState, type Save } from '../core/save';
import type { Spoken } from '../core/audio';
import { LEVELS, recordTask, type SkillId } from './skills';
import { CLEAN, GAP, createPlanner, exampleText, hardest, sameness, weakest } from './planner';
import { generate, type TaskSpec } from './tasks/index';
import type { TaskType } from './tasks/types';
import { SKILL, cheatTask, type TaskHooks } from './taskviews/panel';

const TYPES = Object.keys(SKILL) as TaskType[];
/** The levels a type is played on: those of its skill (the composition of a number: 3 to 5). */
const levelsOf = (type: TaskType) => { const [min, max] = LEVELS[SKILL[type]]; return Array.from({ length: max - min + 1 }, (_, i) => min + i); };
const clean = { solved: true, wrong: 0 };
const mistakes = (wrong: number) => ({ solved: true, wrong });
const closed = { solved: false, wrong: 0 };

function planner(seed = 1, save: Save = defaultSave()) {
  const p = createPlanner(save), rng = mulberry32(seed);
  /** The next task of `type`, ended as `res`; returns its key (sameness). */
  const play = (type: TaskType, res = clean, level = 2) => { const s = p.next(type, level, rng); p.done(s, res); return sameness(s); };
  return { p, save, rng, play };
}

describe('the same task (LEARN-13): the numbers or the things', () => {
  it('a task of numbers is its numbers, whatever things are drawn: the key of the example', () => {
    const rng = mulberry32(3);
    const { p } = planner();
    const s = p.next('add', 5, rng) as Extract<TaskSpec, { type: 'add' }>;
    expect(sameness(s)).toBe(`add:${s.body.a}+${s.body.b}`);
    expect(sameness({ ...s, body: { ...s.body, thing: s.body.thing === '🌸' ? '⭐' : '🌸', tilt: s.body.tilt.map(() => 0) } })).toBe(sameness(s));
  });

  it('the examples read in numbers: 8 + 5, 13 − 6, 3 + ? = 7', () => {
    expect(['add:8+5', 'sub:13-6', 'missing:3+?=7'].map(exampleText)).toEqual(['8 + 5', '13 − 6', '3 + ? = 7']);
  });
});

describe('examples with mistakes come back (LEARN-11, R17, R18)', () => {
  it.each([['add', 'add'], ['add', 'count'], ['sub', 'compare']] as const)('a mistake keeps the example; it comes back after exactly two other tasks (%s, %s)', (one, two) => {
    const { p, save, rng } = planner(7);
    const first = p.next('add', 2, rng), k = sameness(first);
    p.done(first, mistakes(2));
    expect(save.hard.list).toEqual([{ k, l: 2, e: 2, c: 0, at: 0 }]);
    const s1 = p.next(one, 2, rng);
    p.done(s1, clean);
    const s2 = p.next(two, 2, rng);
    p.done(s2, clean);
    expect([sameness(s1), sameness(s2)]).not.toContain(k);
    const back = p.next('add', 2, rng);
    expect(sameness(back)).toBe(k);
    expect(back.level).toBe(2);
  });

  it('a sequence of answers: wrong, then back twice clean - and it is off the list; a new mistake starts the count again', () => {
    const { save, play } = planner(11);
    const k = play('sub', mistakes(1));
    const seen: string[] = [];
    // given as task 0; back as 3 (clean, 1 of 2), as 6 (wrong again: the count starts again), 9 (clean), 12 (clean: off)
    const answers: Record<number, { solved: boolean; wrong: number }> = { 3: clean, 6: mistakes(3), 9: clean, 12: clean };
    for (let i = 1; i <= 16; i++) {
      const res = answers[i] ?? clean;
      seen.push(play('sub', res));
      const h = save.hard.list.find((x) => x.k === k);
      if (i === 3) expect(h).toMatchObject({ e: 1, c: 1, at: 3 });
      if (i === 6) expect(h).toMatchObject({ e: 4, c: 0, at: 6 });
      if (i === 9) expect(h).toMatchObject({ e: 4, c: 1, at: 9 });
      if (i === 12) expect(h).toBeUndefined();
    }
    expect(seen.map((s, i) => (s === k ? i + 1 : 0)).filter(Boolean).slice(0, 4)).toEqual([3, 6, 9, 12]);
    expect(save.hard.list.map((h) => h.k)).not.toContain(k);
  });

  it(`stays until solved cleanly ${CLEAN} times: closing a task without an answer does not count`, () => {
    const { save, play } = planner(5);
    const k = play('add', mistakes(1));
    play('count'); play('count');
    expect(play('add', closed)).toBe(k);
    expect(save.hard.list[0]).toMatchObject({ k, c: 0 });
    play('count'); play('count');
    expect(play('add', clean)).toBe(k);
    expect(save.hard.list[0]).toMatchObject({ k, c: 1 });
  });

  it('the composition of a number keeps the missing addend; the house of level 4 stays a house, the addend waits for its own type', () => {
    const { p, save, rng } = planner(9);
    const s = p.next('missing', 3, rng);
    expect(s.type).toBe('missing');
    p.done(s, mistakes(1));
    expect(save.hard.list.map((h) => h.k)).toEqual([sameness(s)]);
    p.done(p.next('count', 1, rng), clean); p.done(p.next('count', 1, rng), clean);
    const house = p.next('house', 4, rng);          // a compose step on level 4 plays the house (R34), never the kept addend
    expect(house.type).toBe('house');
    p.done(house, clean);
    const back = p.next('missing', 3, rng);         // the next missing addend is the example kept
    expect([back.type, sameness(back), back.level]).toEqual(['missing', sameness(s), 3]);
  });

  it('only addition, take away and the composition of a number are kept; the number house is not', () => {
    const { save, play } = planner(4);
    for (const type of TYPES) play(type, mistakes(2), levelsOf(type)[0]);
    expect(save.hard.list.map((h) => h.k.split(':')[0]).sort()).toEqual(['add', 'missing', 'sub']);
  });

  it('the example comes back with its question of the bank (R37): the same `ask` as the generator gives', () => {
    const { p, rng } = planner(21);
    const s = p.next('add', 5, rng);
    p.done(s, mistakes(1));
    p.done(p.next('sub', 5, rng), clean); p.done(p.next('sub', 5, rng), clean);
    const back = p.next('add', 5, rng);
    expect(sameness(back)).toBe(sameness(s));
    expect([back.prompt, back.ask, back.hint]).toEqual([s.prompt, s.ask, s.hint]);
    expect(back.ask).toBe(`q_add_${(s.body as { a: number }).a}_${(s.body as { b: number }).b}`);
  });

  it('a long random game: a kept example is never given again before two other tasks, and leaves only after two clean solves', () => {
    for (const seed of [1, 2, 3]) {
      const { p, save, rng } = planner(seed);
      const answers = mulberry32(seed + 100);
      const lastGiven = new Map<string, number>(), cleanSince = new Map<string, number>();
      for (let i = 0; i < 1500; i++) {
        const type = (['add', 'sub', 'missing', 'count', 'compare'] as const)[randInt(0, 4, answers)];
        const kept = new Set(save.hard.list.map((h) => h.k));
        const s = p.next(type, randInt(3, 5, answers), rng), k = sameness(s);
        if (kept.has(k)) expect(i - lastGiven.get(k)!, `seed ${seed}, task ${i}: ${k}`).toBeGreaterThan(GAP);
        lastGiven.set(k, i);
        const wrong = answers() < 0.3 ? randInt(1, 3, answers) : 0;
        p.done(s, { solved: true, wrong });
        cleanSince.set(k, wrong ? 0 : (cleanSince.get(k) ?? 0) + 1);
        const now = new Set(save.hard.list.map((h) => h.k));
        if (kept.has(k) && !now.has(k) && save.hard.list.length < HARD_MAX) expect(cleanSince.get(k), `${k} left early`).toBe(CLEAN);
        if (wrong && ['add', 'sub', 'missing'].includes(s.type)) expect(now.has(k)).toBe(true);
      }
    }
  });

  it(`keeps at most ${HARD_MAX} examples: the one with the fewest mistakes goes, never the one just noted`, () => {
    // A kept example that is due is always given first, so in a game the list grows slowly; the limit is checked by
    // noting the mistakes of many new examples, made by the generators themselves.
    const { p, save, rng } = planner(13);
    let lastKey = '';
    for (let i = 0; i < 300; i++) {
      const s = generate((['add', 'sub', 'missing'] as const)[i % 3], 5, rng);
      p.done(s, mistakes(i % 7 === 0 ? 3 : 1));
      lastKey = sameness(s);
      expect(save.hard.list.length).toBeLessThanOrEqual(HARD_MAX);
    }
    expect(save.hard.list.length).toBe(HARD_MAX);
    expect(save.hard.list.map((h) => h.k)).toContain(lastKey);
    expect(JSON.stringify(save.hard).length).toBeLessThan(2 * 1024);
  });

  it('over the limit, the example with the fewest mistakes goes, of two alike the older one', () => {
    const save = defaultSave();
    save.hard = { n: 50, list: Array.from({ length: HARD_MAX }, (_, i) => ({ k: `add:${(i % 9) + 1}+${Math.floor(i / 9) + 1}`, l: 3, e: i === 5 || i === 12 ? 1 : 2, c: 0, at: i })) };
    const { p, rng } = planner(1, save);
    p.done(generate('sub', 3, rng), mistakes(1));
    expect(save.hard.list.length).toBe(HARD_MAX);
    expect(save.hard.list.map((h) => h.at)).not.toContain(5);   // e 1, the older of the two
    expect(save.hard.list.map((h) => h.at)).toContain(12);
  });

  it.each([
    ['answers of a child (a third with mistakes)', 0.33],
    ['every answer wrong', 1],
  ])('the whole save is under 20 KB after 500 tasks: %s', (_, share) => {
    const save = defaultSave();
    save.played = true; save.name = 'Зоряна';
    Object.assign(worldState(save, 'fairy'), { quests: { q1: 3, q2: 3, q3: 3, q4: 3, q5: 3 }, starsTaken: [1, 2, 3, 4, 5], pos: [1, 5] });
    for (let d = 10; d < 17; d++) save.playMinutes[`2026-11-${d}`] = 25;
    const { p, rng } = planner(17, save), answers = mulberry32(99);
    for (let i = 0; i < 500; i++) {
      const type = TYPES[randInt(0, TYPES.length - 1, answers)], levels = levelsOf(type);
      const level = levels[randInt(0, levels.length - 1, answers)];
      const s = p.next(type, level, rng);
      const wrong = answers() < share ? randInt(1, 4, answers) : 0;
      p.done(s, { solved: true, wrong });
      recordTask(save, SKILL[s.type], wrong);
    }
    const stored = new Map<string, string>();
    vi.stubGlobal('localStorage', { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => { stored.set(k, v); }, removeItem: () => {} });
    storeSave(save);
    vi.unstubAllGlobals();
    const size = new TextEncoder().encode(stored.get('amw-save')!).length;
    expect(size).toBe(new TextEncoder().encode(JSON.stringify(save)).length);
    expect(size).toBeLessThanOrEqual(20 * 1024);
    expect(save.hard.n).toBe(500);
    expect(save.hard.list.length).toBeLessThanOrEqual(HARD_MAX);
  });

  it('a damaged example in the save is forgotten, the task is a new one', () => {
    const save = defaultSave();
    save.hard = { n: 10, list: [{ k: 'add:99+99', l: 2, e: 3, c: 0, at: 0 }, { k: 'sub:3-5', l: 2, e: 1, c: 0, at: 0 }] };
    const { p, rng } = planner(1, save);
    const s = p.next('add', 2, rng);
    expect(s.type).toBe('add');
    expect(save.hard.list.map((h) => h.k)).toEqual(['sub:3-5']);
    expect(p.next('sub', 2, rng).type).toBe('sub');
    expect(save.hard.list).toEqual([]);
  });
});

describe('no task twice in a row (LEARN-13, R19, R20)', () => {
  const PAIRS = 1000;
  const cases = TYPES.flatMap((type) => levelsOf(type).map((level) => [type, level] as const));

  it.each(cases)(`%s, level %i: ${PAIRS} pairs of neighbouring tasks, none the same`, (type, level) => {
    const { p, rng } = planner(level * 1000 + TYPES.indexOf(type));
    let prev = sameness(p.next(type, level, rng));
    for (let i = 0; i < PAIRS; i++) {
      const s = p.next(type, level, rng), k = sameness(s);
      expect(k, `pair ${i}`).not.toBe(prev);
      expect(s.type).toBe(type);
      p.done(s, clean);
      prev = k;
    }
  });

  it(`a game of mixed types with mistakes (the examples coming back among them): ${PAIRS} pairs, none the same`, () => {
    const { p, rng } = planner(31), answers = mulberry32(32);
    let prev = '';
    for (let i = 0; i <= PAIRS; i++) {
      const type = (['add', 'sub', 'missing', 'house', 'count'] as const)[randInt(0, 4, answers)];
      const s = p.next(type, randInt(1, 5, answers), rng), k = sameness(s);
      if (i > 0) expect(k, `pair ${i}`).not.toBe(prev);
      p.done(s, { solved: true, wrong: answers() < 0.4 ? 1 : 0 });
      prev = k;
    }
  });

  it.each([2, 3, 4, 5])('from level %i no addition or take away has a one in both numbers', (level) => {
    const { p, rng } = planner(level);
    for (let i = 0; i < PAIRS; i++) {
      const a = p.next('add', level, rng).body as { a: number; b: number };
      const s = p.next('sub', level, rng).body as { total: number; gone: number };
      expect(a.a === 1 && a.b === 1, `1 + 1 on level ${level}`).toBe(false);
      expect(s.total === 1 && s.gone === 1, `1 - 1 on level ${level}`).toBe(false);
    }
  });

  it('one seed gives one sequence of tasks (ARCH-08), with the same answers', () => {
    const run = () => {
      const p = createPlanner(defaultSave()), rng = createRng('42'), answers = mulberry32(5), out: TaskSpec[] = [];
      for (let i = 0; i < 300; i++) {
        const s = p.next(TYPES[i % TYPES.length], 3, rng);
        p.done(s, { solved: true, wrong: answers() < 0.3 ? 1 : 0 });
        out.push(s);
      }
      return out;
    };
    expect(run()).toEqual(run());
  });
});

describe('replaying a finished chain trains the weakest skill (LEARN-16, R23, R24)', () => {
  const stats = (by: Partial<Record<SkillId, [tasks: number, first: number]>>) => {
    const s = defaultSave();
    for (const [k, [tasks, first]] of Object.entries(by)) Object.assign(s.skills[k], { tasks, first });
    return s;
  };
  const skillOf = (step: string): SkillId => (step === 'compose' ? 'compose' : SKILL[step as TaskType]);
  const picks = (steps: string[], save: Save) => new Set(Array.from({ length: 200 }, (_, i) => weakest(steps, skillOf, save, mulberry32(i))));

  it('the step of the lowest share of clean solves, whatever the rng', () => {
    const save = stats({ count: [4, 4], add: [10, 9], sub: [10, 5], compare: [3, 2] });
    expect(picks(['count', 'add', 'sub', 'compare'], save)).toEqual(new Set(['sub']));
    expect(picks(['count', 'add', 'compare'], save)).toEqual(new Set(['compare']));   // 2/3 below 9/10
  });

  it('the share, not the number of mistakes: 1 of 4 clean is weaker than 6 of 20', () => {
    expect(picks(['add', 'sub'], stats({ add: [4, 1], sub: [20, 6] }))).toEqual(new Set(['add']));
  });

  it('two steps alike are both played, by the rng; a stronger one never', () => {
    expect(picks(['count', 'add', 'sub'], stats({ count: [8, 8], add: [6, 3], sub: [4, 2] }))).toEqual(new Set(['add', 'sub']));
  });

  it('a skill never played counts as weakest (the composition of a number by its skill step)', () => {
    expect(picks(['add', 'compose'], stats({ add: [5, 1] }))).toEqual(new Set(['compose']));
  });

  it('draws the rng once, as the random pick before it', () => {
    let draws = 0;
    const rng = () => { draws++; return 0.5; };
    weakest(['add', 'sub', 'count'], skillOf, stats({ add: [2, 1], sub: [2, 1], count: [2, 2] }), rng);
    expect(draws).toBe(1);
  });
});

describe('the conversations give their tasks through the planner', () => {
  const sources = import.meta.glob(['./dialogue.ts', './context.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;
  const dialogue = sources['./dialogue.ts'];

  it('both the step of a chain and the replay are planned; the replay picks the weakest step', () => {
    const planned = [...dialogue.matchAll(/plan\.runTask\(/g)];
    expect(planned.length).toBe(2);
    expect(dialogue).not.toMatch(/[^.]\brunTask\(/);                 // no task of the panel past the planner
    // one planner for the session (`g.plan`, src/game/context.ts): the conversations and the mysterious stars draw from it
    expect(dialogue).toMatch(/const \{ plan \} = g;/);
    expect(sources['./context.ts']).toMatch(/plan: createPlanner\(save\),/);
    expect(dialogue).toMatch(/weakest\(q\.steps\.filter\(isPanel\), skillOf, save, g\.rng\)/);
    expect(dialogue).not.toMatch(/pick\(q\.steps/);
  });
});

// ---------- the planner on the panel: a task with a mistake is noted when it ends ----------

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const hooks: TaskHooks = {
  prompt: () => {}, number: () => {}, good: () => {},
  wrong: () => Promise.resolve() as Spoken, hint: () => Promise.resolve() as Spoken,
};

describe('runTask through the planner', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; });

  /**
   * Plays the next add task through `p.runTask` with `wrongTaps` wrong answers first. Which answer is right is known
   * from a twin planner that was given the same tasks: one seed, one task.
   */
  async function solve(p: ReturnType<typeof createPlanner>, twin: ReturnType<typeof createPlanner>, seed: number, wrongTaps: number) {
    const spec = twin.next('add', 2, mulberry32(seed));
    const done = p.runTask('add', 2, hooks, mulberry32(seed));
    const right = String((spec.body as { answer: number }).answer);
    for (let i = 0; i < wrongTaps; i++) {
      const wrong = [...document.querySelectorAll<HTMLElement>('#taskOpts button')].find((b) => b.textContent !== right)!;
      wrong.dispatchEvent(new PointerEvent('pointerdown'));
      await vi.advanceTimersByTimeAsync(100);
    }
    expect(cheatTask()).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    const res = await done;
    twin.done(spec, res);
    return { res, spec };
  }

  it('a mistake on the panel keeps the example, a clean solve does not', async () => {
    const save = defaultSave(), p = createPlanner(save), twin = createPlanner(defaultSave());
    const first = await solve(p, twin, 8, 0);
    expect(first.res).toEqual({ solved: true, wrong: 0 });
    expect(save.hard.list).toEqual([]);
    const second = await solve(p, twin, 9, 1);
    expect(second.res).toEqual({ solved: true, wrong: 1 });
    expect(save.hard.list).toEqual([{ k: sameness(second.spec), l: 2, e: 1, c: 0, at: 1 }]);
    expect(save.hard.n).toBe(2);
  });
});

// ---------- the parents' section: the five hardest examples (PLAY-15, R27) ----------

const IDS = ['book', 'parents', 'btnBook', 'bookClose', 'btnParents', 'btnShop', 'colTitle', 'shards', 'colStats', 'gate', 'pBody', 'pTitle', 'gateQ', 'parentsClose'];
describe('the parents\' section shows the five hardest examples (PLAY-15)', () => {
  const g = globalThis as Record<string, unknown>;
  beforeAll(() => { g.__BUILD_DATE__ = '2026-11-17'; g.__BUILD_COMMIT__ = 'abc1234'; });

  async function open(save: Save) {
    document.body.innerHTML = IDS.map((id) => `<div id="${id}"></div>`).join('') + '<input id="gateA">';
    const { initBook } = await import('../ui/ui');
    initBook(save, { parts: () => [], stats: () => [] }, { change() {}, reset() {}, open() {}, shop() {} });
    document.getElementById('btnParents')!.click();
    const [, a, b] = /(\d+) × (\d+)/.exec(document.getElementById('gateQ')!.textContent!)!.map(Number);
    const gateA = document.getElementById('gateA') as HTMLInputElement;
    gateA.value = String(a * b); gateA.dispatchEvent(new Event('input'));
    return document.getElementById('pHard')!;
  }

  it('the most mistakes first, of two alike the one met last; written in numbers', async () => {
    const save = defaultSave();
    const ex = (k: string, e: number, at: number) => ({ k, l: 5, e, c: 0, at });
    save.hard = { n: 40, list: [ex('add:2+3', 1, 1), ex('sub:13-6', 4, 2), ex('add:8+5', 6, 3), ex('missing:3+?=7', 2, 4),
      ex('add:7+6', 2, 9), ex('sub:9-4', 1, 6), ex('missing:8+?=13', 3, 7)] };
    expect(hardest(save)).toEqual(['8 + 5', '13 − 6', '8 + ? = 13', '7 + 6', '3 + ? = 7']);
    const block = await open(save);
    expect(block.hidden).toBe(false);
    expect(block.textContent).toMatch(/^(Пʼять найважчих прикладів|Пять самых трудных примеров) · 8 \+ 5 · 13 − 6 · 8 \+ \? = 13 · 7 \+ 6 · 3 \+ \? = 7$/);
  });

  it('none yet: the line says so', async () => {
    const block = await open(defaultSave());
    expect(block.textContent).toMatch(/(немає прикладів|нет примеров)/);
  });

  it('a mistake in a game shows in the section', async () => {
    const { p, save, rng } = planner(3);
    const s = p.next('sub', 5, rng);
    p.done(s, mistakes(2));
    const body = s.body as { total: number; gone: number };
    expect((await open(save)).textContent).toContain(`${body.total} − ${body.gone}`);
  });
});
