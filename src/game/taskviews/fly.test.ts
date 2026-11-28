// @vitest-environment happy-dom
/**
 * The answer flies into its "?" (./fly.ts): the right one lands and stays, the row waves; a wrong one flies back and the
 * "?" stays empty; nothing flying is a button or outlives the panel; the task ends no more than EXTRA_MAX_MS later.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createRng } from '../../core/rng';
import type { Spoken } from '../../core/audio';
import { generate } from '../tasks/index';
import type { TaskType } from '../tasks/types';
import { cheatTask, showTask, type TaskHooks } from './panel';
import { EXTRA_MAX_MS, FLY_MS, WOBBLE_MS, WON_MAX_MS, WON_MS } from './fly';

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; });

const stage = () => document.getElementById('taskStage')!;
const opts = () => [...document.querySelectorAll<HTMLElement>('#taskOpts .opt')];
const flying = () => [...document.querySelectorAll<HTMLElement>('.fly')];
const tap = (e: HTMLElement) => { e.dispatchEvent(new PointerEvent('pointerdown')); };
const hooks: TaskHooks = {
  prompt() {}, number() {}, good() {},
  wrong: () => Promise.resolve() as Spoken, hint: () => Promise.resolve() as Spoken,
};

/** Where each show keeps its "?" (the place the answer lands in). */
const SLOT: Partial<Record<TaskType, string>> = {
  pattern: '.it.q', missing: '.gap .q', neighbors: '.cell.empty', add: '.sign.q', house: '.win.empty', signs: '.slot',
  sum3: '.sign.q', gap: '.sign.q', chain: '.sign.q', exprs: '.slot',
};
const TYPES = Object.keys(SLOT) as TaskType[];

describe.each(TYPES)('%s: the answer flies into its "?"', (type) => {
  const open = (seed: string) => {
    const spec = generate(type, type === 'missing' ? 3 : 2, createRng(seed));
    const done = showTask(spec, hooks);
    const slot = stage().querySelector<HTMLElement>(SLOT[type]!)!;
    const right = opts().find((b) => String(b.textContent) === String((spec.body as { answer: unknown }).answer))!;
    const wrong = opts().find((b) => b !== right)!;
    return { spec, done, slot, right, wrong };
  };

  it('the right answer: a copy of its face (not a button) flies, lands in the "?" and stays there; the task ends in time', async () => {
    const { done, slot, right } = open(`fly-${type}`);
    expect(slot.textContent).toBe('?');
    tap(right);
    expect(flying()).toHaveLength(1);
    expect(flying()[0].tagName).toBe('SPAN');
    expect(flying()[0].getAttribute('aria-hidden')).toBe('true');
    expect(slot.textContent).toBe('?');                       // not before it lands
    await vi.advanceTimersByTimeAsync(FLY_MS);
    expect(flying()).toEqual([]);
    expect(slot.textContent).toBe(right.textContent);
    expect(slot.classList.contains('got')).toBe(true);
    let ended = false;
    void done.then(() => { ended = true; });
    await vi.advanceTimersByTimeAsync(WON_MS - FLY_MS - 1);
    expect(ended).toBe(false);                                 // never sooner than before
    await vi.advanceTimersByTimeAsync(WON_MAX_MS - WON_MS + 1);
    expect(ended).toBe(true);
    expect(await done).toEqual({ solved: true, wrong: 0 });
  });

  it('a wrong answer flies to the "?", wobbles, flies back: the "?" stays empty, one mistake as before', async () => {
    const { done, slot, wrong } = open(`miss-${type}`);
    tap(wrong);
    expect(flying()).toHaveLength(1);
    expect(wrong.classList.contains('no')).toBe(true);
    await vi.advanceTimersByTimeAsync(FLY_MS + WOBBLE_MS);
    expect(slot.textContent).toBe('?');
    await vi.advanceTimersByTimeAsync(FLY_MS);
    expect(flying()).toEqual([]);
    expect(slot.textContent).toBe('?');
    expect(slot.classList.contains('got')).toBe(false);
    cheatTask();
    await vi.advanceTimersByTimeAsync(WON_MAX_MS);
    expect(await done).toEqual({ solved: true, wrong: 1 });
  });

  it('closed while an answer is flying: nothing flying is left over the game', async () => {
    const { done, wrong } = open(`close-${type}`);
    tap(wrong);
    expect(flying()).toHaveLength(1);
    document.getElementById('taskClose')!.click();
    expect(flying()).toEqual([]);
    expect(await done).toEqual({ solved: false, wrong: 1 });
  });
});

describe('the end of a task after the right answer', () => {
  it('is never more than half a second later than before', () => {
    expect(EXTRA_MAX_MS).toBeLessThanOrEqual(500);
    expect(WON_MAX_MS - WON_MS).toBe(EXTRA_MAX_MS);
  });

  it('a show without a "?" (counting) ends as before, 1.1 s after the right answer', async () => {
    const done = showTask(generate('count', 1, createRng('count-end')), hooks);
    cheatTask();
    expect(flying()).toEqual([]);
    let ended = false;
    void done.then(() => { ended = true; });
    await vi.advanceTimersByTimeAsync(WON_MS - 1);
    expect(ended).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(ended).toBe(true);
  });

  it('"missing" after its second rung: the dots took the place of "?", the answer does not fly and the task still ends', async () => {
    const spec = generate('missing', 3, createRng('missing-rung2'));
    const done = showTask(spec, hooks);
    const right = opts().find((b) => String(b.textContent) === String(spec.body.answer))!;
    const wrongs = opts().filter((b) => b !== right);
    tap(wrongs[0]); await vi.advanceTimersByTimeAsync(2000);
    tap(wrongs[1]); await vi.advanceTimersByTimeAsync(2000);
    expect(stage().querySelector('.gap .q')).toBeNull();
    tap(right);
    expect(flying()).toEqual([]);
    await vi.advanceTimersByTimeAsync(WON_MAX_MS);
    expect((await done).solved).toBe(true);
  });
});
