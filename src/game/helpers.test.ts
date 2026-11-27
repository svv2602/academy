// @vitest-environment happy-dom
/**
 * The helpers of a task (decision of 2026-11-19, src/game/helpers.ts): the stock and the count of the week, the level
 * that does not grow for a task solved with one, and their buttons on the panel - the owl's first rung at once and the
 * abacus's ten frames, only where they give something.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Spoken } from '../core/audio';
import { defaultSave, type Save } from '../core/save';
import type { SpokenKey } from '../ui/strings';
import { helpsOfWeek, takeHelper, taskHelpers } from './helpers';
import { buy, stock } from './shop';
import { recordTask } from './skills';
import { generate, type TaskSpec } from './tasks/index';
import { createRng } from '../core/rng';
import { abacusHelps, showTask, type TaskHooks } from './taskviews/panel';

const DAY = 24 * 3600 * 1000;
const NOW = new Date(2026, 10, 19, 12).getTime();
let s: Save;
beforeEach(() => { s = defaultSave(); });

describe('the stock and the count of the week', () => {
  it('bought in the shop: owl 15, abacus 20, one more in the stock each time', () => {
    s.stars = 35;
    expect([buy(s, 'owl'), buy(s, 'abacus'), s.stars, stock(s, 'owl'), stock(s, 'abacus')]).toEqual([true, true, 0, 1, 1]);
  });

  it('taken: one less in the stock, one more on today; none left - nothing changes', () => {
    s.supplies = { owl: 2 };
    expect(takeHelper(s, 'owl', NOW)).toBe(true);
    expect(takeHelper(s, 'owl', NOW)).toBe(true);
    expect(takeHelper(s, 'owl', NOW)).toBe(false);
    expect(takeHelper(s, 'abacus', NOW)).toBe(false);
    expect([stock(s, 'owl'), s.helps]).toEqual([0, { '2026-11-19': { owl: 2 } }]);
  });

  it('the week: the last seven days with today; older days are dropped when one is taken', () => {
    s.helps = { '2026-11-12': { owl: 5 }, '2026-11-13': { owl: 1, abacus: 2 }, '2026-11-19': { abacus: 1 }, '2026-11-25': { owl: 9 } };
    expect(helpsOfWeek(s, NOW)).toEqual({ owl: 1, abacus: 3 });
    s.supplies = { owl: 1 };
    takeHelper(s, 'owl', NOW + DAY);
    expect(Object.keys(s.helps!).sort()).toEqual(['2026-11-19', '2026-11-20']);
    expect(helpsOfWeek(s, NOW + DAY)).toEqual({ owl: 1, abacus: 1 });
  });

  it('the hooks of a game store the save after each one taken', () => {
    s.supplies = { abacus: 1 };
    const persist = vi.fn();
    const h = taskHelpers(s, persist);
    expect([h.has('abacus'), h.has('owl')]).toEqual([true, false]);
    expect(h.use('abacus')).toBe(true);
    expect(h.use('abacus')).toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);
  });
});

describe('a task solved with a helper raises no level and is no clean solve (recordTask, helped)', () => {
  it('two clean solves raise the level; with a helper the run starts again, no error, no first-try solve', () => {
    const k = s.skills.add, level = k.level;
    k.settled = true;                              // the fast climb of the skill is over: the rule of the card (LEARN-15)
    recordTask(s, 'add', 0);
    recordTask(s, 'add', 0, true);
    expect([k.level, k.streak, k.errors, k.first, k.tasks, s.clean?.run]).toEqual([level, 0, 0, 1, 2, 0]);
    recordTask(s, 'add', 0);
    recordTask(s, 'add', 0);
    expect(k.level).toBe(level + 1);
  });

  it('in the fast climb a clean solve raises the level at once; one with a helper does not, and the climb goes on', () => {
    const k = s.skills.add, level = k.level;
    recordTask(s, 'add', 0);
    expect(k.level).toBe(level + 1);
    recordTask(s, 'add', 0, true);
    expect([k.level, k.streak, k.errors, k.first, k.tasks, s.clean?.run]).toEqual([level + 1, 0, 0, 1, 2, 0]);
    expect(k).not.toHaveProperty('settled');
    recordTask(s, 'add', 0);
    expect(k.level).toBe(level + 2);
  });

  it('with a helper and mistakes the rule is the usual one: three mistakes step the level down', () => {
    s.skills.add.level = 3;
    recordTask(s, 'add', 3, true);
    expect([s.skills.add.level, s.skills.add.errors]).toEqual([2, 3]);
  });
});

// ---------- the buttons on the panel ----------
const MARKUP = '<div id="task" class="hidden"><div class="t-card"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div></div>';
const realTimeout = setTimeout;
const breathe = () => new Promise<void>((resolve) => { realTimeout(resolve, 0); });
const $ = (sel: string) => document.querySelector<HTMLElement>(sel);
const tap = (e: HTMLElement) => { e.dispatchEvent(new PointerEvent('pointerdown')); };

function hooksWith(stockOf: Record<string, number>) {
  const heard = { hints: [] as SpokenKey[], used: [] as string[] };
  const hooks: TaskHooks = {
    prompt: () => {}, number: () => {}, good: () => {},
    wrong: () => Promise.resolve() as Spoken, hint: (k) => { heard.hints.push(k); return Promise.resolve() as Spoken; },
    helpers: { has: (id) => (stockOf[id] ?? 0) > 0, use: (id) => { if (!((stockOf[id] ?? 0) > 0)) return false; stockOf[id]--; heard.used.push(id); return true; } },
  };
  return { hooks, heard };
}
const spec = (type: 'count' | 'add' | 'sub' | 'compare' | 'missing' | 'signs' | 'pattern', level: number) => generate(type, level, createRng('helpers')) as TaskSpec;

describe('the helper buttons of the panel', () => {
  beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; });

  it('none without a stock; the abacus only where the things are not in ten frames yet', () => {
    void showTask(spec('add', 2), hooksWith({}).hooks);
    expect($('.t-helps')).toBeNull();
    for (const [t, l, helps] of [['count', 2, true], ['add', 3, true], ['add', 4, false], ['sub', 5, false], ['compare', 2, false], ['pattern', 2, false], ['signs', 3, true]] as const) {
      expect(abacusHelps(spec(t, l)), `${t} ${l}`).toBe(helps);
      document.body.innerHTML = MARKUP;
      void showTask(spec(t, l), hooksWith({ abacus: 1 }).hooks);
      expect(!!$('#taskAbacus'), `${t} ${l}`).toBe(helps);
    }
  });

  it('the owl: the first rung at once, spent once; the first mistake then goes on with the second rung', async () => {
    const { hooks, heard } = hooksWith({ owl: 2 });
    const done = showTask(spec('add', 2), hooks);
    tap($('#taskOwl')!);
    await breathe();
    expect(heard.used).toEqual(['owl']);
    expect(heard.hints).toEqual(['h1_add']);
    expect($('#taskOwl')).toBeNull();
    expect($('#taskStage')!.querySelector('.pulse')).toBeNull();     // the way, not the answer
    const wrongOpt = [...document.querySelectorAll<HTMLElement>('.opt')].find((o) => o.textContent !== String((spec('add', 2).body as { a: number; b: number }).a + (spec('add', 2).body as { a: number; b: number }).b))!;
    tap(wrongOpt);
    await vi.advanceTimersByTimeAsync(1000); await breathe();
    expect(heard.hints.length).toBe(2);
    expect(heard.hints[1]).not.toBe('h1_add');
    expect($('#taskStage')!.dataset.shown).toBe('2');
    tap([...document.querySelectorAll<HTMLElement>('.opt')].find((o) => o !== wrongOpt && !o.classList.contains('no') && o.textContent === String((spec('add', 2).body as { a: number; b: number }).a + (spec('add', 2).body as { a: number; b: number }).b))!);
    await vi.advanceTimersByTimeAsync(1200);
    expect(await done).toEqual({ solved: true, wrong: 1, helped: true });
  });

  it('a mistake before the owl takes its button away: the hint is on its way already', async () => {
    const { hooks, heard } = hooksWith({ owl: 1 });
    void showTask(spec('count', 2), hooks);
    const n = (spec('count', 2).body as { n: number }).n;
    tap([...document.querySelectorAll<HTMLElement>('.opt')].find((o) => o.textContent !== String(n))!);
    expect($('#taskOwl')).toBeNull();
    expect(heard.used).toEqual([]);
  });

  it('the abacus: the task drawn again with its things in ten frames, spent once; solved without it - not helped', async () => {
    const { hooks, heard } = hooksWith({ abacus: 1 });
    const done = showTask(spec('count', 2), hooks);
    expect($('#taskStage')!.querySelector('.tens')).toBeNull();
    tap($('#taskAbacus')!);
    expect(heard.used).toEqual(['abacus']);
    expect($('#taskStage')!.querySelector('.tens .tf')).not.toBeNull();
    expect($('#taskAbacus')).toBeNull();
    const n = (spec('count', 2).body as { n: number }).n;
    tap([...document.querySelectorAll<HTMLElement>('.opt')].find((o) => o.textContent === String(n))!);
    await vi.advanceTimersByTimeAsync(1200);
    expect(await done).toEqual({ solved: true, wrong: 0, helped: true });
    document.body.innerHTML = MARKUP;
    const plain = showTask(spec('count', 2), hooksWith({ abacus: 1 }).hooks);
    tap([...document.querySelectorAll<HTMLElement>('.opt')].find((o) => o.textContent === String(n))!);
    await vi.advanceTimersByTimeAsync(1200);
    expect(await plain).toEqual({ solved: true, wrong: 0 });   // not helped: the result as it always was
  });
});

describe('the wiring: every task a character gives records whether a helper was taken (src/game/dialogue.ts)', () => {
  const DIALOGUE = (import.meta.glob('./dialogue.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['./dialogue.ts'];
  it('each recordTask of a solved task passes `res.helped`', () => {
    // the fifth argument - the type and time of the answer for the parents' report (src/game/answers.ts)
    const calls = DIALOGUE.match(/recordTask\(save, skill, res\.wrong, [^,]+,/g) ?? [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
    for (const c of calls) expect(c).toBe('recordTask(save, skill, res.wrong, res.helped === true,');
    expect(DIALOGUE.match(/recordTask\(/g)).toHaveLength(calls.length);
  });
});
