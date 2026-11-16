// @vitest-environment happy-dom
/**
 * ARCH-08 on the panel (moved from `src/game/tasks.test.ts`): the randomness of a task comes from its seed, the panel
 * code asks no `Math.random`, and every task the conversations open gets the game's rng.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import { mulberry32 } from '../../core/util';
import type { Key } from '../../ui/strings';
import type { Spoken } from '../../core/audio';
import type { TaskType } from '../tasks/types';
import { SKILL, runTask, type TaskHooks } from './panel';

const spoken = () => Promise.resolve() as Spoken;
const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const realRandom = Math.random;

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); Math.random = realRandom; document.body.innerHTML = ''; });

const stage = () => document.getElementById('taskStage')!;
const opts = () => document.getElementById('taskOpts')!;

/** Hooks that only remember the questions the game asked the cat to say. */
function listen() {
  const heard = { prompts: [] as Key[] };
  const hooks: TaskHooks = {
    prompt: (key) => { heard.prompts.push(key); }, number: () => {}, good: () => {},
    wrong: () => spoken(), hint: () => spoken(),
  };
  return { hooks, heard };
}

const TYPES = Object.keys(SKILL) as TaskType[];
const realTimeout = setTimeout;                   // taken before any test installs the fake clock, which would never fire it
const breathe = () => new Promise<void>((resolve) => { realTimeout(resolve, 0); });

// ---------- ARCH-08: the randomness of a task comes from its seed ----------

/** The code of the panel tasks (the panel, the flow, the ten shows), the shared conversation and the two world tasks. */
const TASK_SOURCES = import.meta.glob(['./*.ts', '!./*.test.ts', '../dialogue.ts', '../../worlds/fairy/{butterflies-task,star-search}.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>;

describe('createRng', () => {
  const draw = (rng: () => number, n = 200) => Array.from({ length: n }, () => rng());

  it('one seed gives one sequence, another seed another one', () => {
    const a = draw(createRng('7')), b = draw(createRng('7'));
    expect(a).toEqual(b);
    expect(draw(createRng('8'))).not.toEqual(a);
    expect(draw(createRng('07'))).not.toEqual(a);    // the seed is text: "07" is not "7"
  });

  it('a seed never asks Math.random', () => {
    const asked = vi.fn(realRandom);
    Math.random = asked;
    draw(createRng('Зоряна'));
    expect(asked).not.toHaveBeenCalled();
  });

  it.each([null, ''])('no seed (%j) is Math.random itself: numbers in [0, 1), not repeated', (seed) => {
    const rng = createRng(seed);
    expect(rng).toBe(Math.random);
    const xs = draw(rng, 1000);
    expect(xs.every((x) => x >= 0 && x < 1)).toBe(true);
    expect(new Set(xs).size).toBeGreaterThan(990);
  });

  it('a seeded sequence stays in [0, 1)', () => {
    for (const seed of ['1', '7', 'seed', 'Зоряна']) expect(draw(createRng(seed), 2000).every((x) => x >= 0 && x < 1)).toBe(true);
  });
});

describe('a seed makes the tasks repeat (ARCH-08)', () => {
  /** The task as built: what is asked, then every element of the stage and of the options in their order. */
  function build(type: TaskType, level: number, rng?: () => number) {
    document.body.innerHTML = MARKUP;
    const { hooks, heard } = listen();
    void runTask(type, level, hooks, rng);
    const shot = `${heard.prompts.join(' ')}\n${stage().outerHTML}\n${opts().innerHTML}`;
    vi.clearAllTimers();
    return shot;
  }
  /** Math.random that counts how often a task asks it. */
  function watchRandom() { const asked = vi.fn(realRandom); Math.random = asked; return asked; }

  describe.each(TYPES)('%s', (type) => {
    it.each([1, 2, 3])('level %i: one seed, one task; the seed alone decides it', async (level) => {
      const asked = watchRandom();
      for (const seed of ['7', '8', 'Зоряна']) expect(build(type, level, createRng(seed)), `seed ${seed}`).toBe(build(type, level, createRng(seed)));
      expect(asked, 'a seeded task asked Math.random').not.toHaveBeenCalled();
      await breathe();
    });

    it.each([1, 2, 3])('level %i: other seeds give other tasks', async (level) => {
      const shots = new Set(Array.from({ length: 12 }, (_, i) => build(type, level, createRng(String(i + 1)))));
      expect(shots.size).toBeGreaterThan(1);
      await breathe();
    });

    it.each([1, 2, 3])('level %i: without a seed it is Math.random, drawn the same way as before', async (level) => {
      // The same numbers through Math.random or through the parameter build the same task: the distribution is unchanged.
      for (const s of [1, 2, 3]) {
        Math.random = mulberry32(s);
        const unseeded = build(type, level);
        Math.random = realRandom;
        expect(build(type, level, mulberry32(s)), `stream ${s}`).toBe(unseeded);
      }
      await breathe();
    });
  });

  it('a game played twice with one seed is asked the same tasks in the same order', async () => {
    const play = (rng: () => number) => TYPES.flatMap((type) => [1, 2, 3].map((level) => build(type, level, rng)));
    const asked = watchRandom();
    expect(play(createRng('42'))).toEqual(play(createRng('42')));
    expect(asked).not.toHaveBeenCalled();
    await breathe();
  });

  it('the task code asks no Math.random: the panel and its shows, and the world tasks take the game\'s rng', () => {
    const panel = ['flow', 'panel', 'count', 'add', 'sub', 'compare', 'pattern', 'odd', 'pairs', 'order', 'sort', 'simon', 'tenframe', 'missing', 'house', 'shapes'].map((f) => `./${f}.ts`);
    const world = ['../dialogue.ts', ...['butterflies-task', 'star-search'].map((f) => `../../worlds/fairy/${f}.ts`)];
    expect(Object.keys(TASK_SOURCES).sort(), 'the glob did not reach the task files').toEqual([...panel, ...world].sort());
    for (const [path, text] of Object.entries(TASK_SOURCES)) expect(text, path).not.toMatch(/Math\.random/);
  });

  it('every task the conversations open gets the game\'s rng', () => {
    const dialogue = Object.entries(TASK_SOURCES).find(([path]) => path.endsWith('/dialogue.ts'))![1];
    // A call with arguments that may hold one level of brackets: runTask(type, levelFor(save, x), hooksFor(q.emoji), g.rng).
    const calls = [...dialogue.matchAll(/runTask\((?:[^()]|\([^()]*\))*\)/g)].map((m) => m[0]);
    expect(calls.length, 'no runTask call found in dialogue.ts').toBeGreaterThanOrEqual(2);
    for (const call of calls) expect(call).toMatch(/, g\.rng\)$/);
  });
});
