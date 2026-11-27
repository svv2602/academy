// @vitest-environment happy-dom
/**
 * The steps «things → picture → numbers» (src/game/tasks/cpa.ts, the customer's word of 2026-11-27): the step of each
 * world, one lower for a weak skill, the lever of the walkthrough; and the show of "sub" at each step - the picture
 * never gives the answer away before it is given, the hints show the things at every step.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/util';
import type { Spoken } from '../../core/audio';
import { CPA, CPA_LOW } from '../../core/tuning';
import { addStrings } from '../../ui/strings';
import { strings } from '../tasks/strings-cpa';
import { cpaFor, cpaHold, cpaOf, setCpaWorld, worldCpa } from '../tasks/cpa';
import { runTask, type TaskHooks } from './panel';
import { sub } from '../tasks/sub';

addStrings(strings, false);
const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const realTimeout = setTimeout;
const breathe = () => new Promise<void>((resolve) => { realTimeout(resolve, 0); });
const stage = () => document.getElementById('taskStage')!;
const opts = () => document.getElementById('taskOpts')!;
const all = (sel: string) => [...stage().querySelectorAll<HTMLElement>(sel)];
const down = (e: Element) => e.dispatchEvent(new PointerEvent('pointerdown'));
const hooks: TaskHooks = { prompt: () => {}, number: () => {}, good: () => {}, wrong: () => Promise.resolve() as Spoken, hint: () => Promise.resolve() as Spoken };

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; cpaHold.step = null; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; cpaHold.step = null; });

describe('the step of a task', () => {
  it('the world\'s: the fairies 1, the forest and the sea 2, the Sweet Land and the sky 3', () => {
    expect(CPA).toEqual({ fairy: 1, forest: 2, sea: 2, sweet: 3, sky: 3 });
    for (const [w, s] of Object.entries(CPA)) expect(cpaFor(w, CPA_LOW + 1)).toBe(s);
  });
  it('one lower while the skill is at CPA_LOW or under, never below 1', () => {
    expect(CPA_LOW).toBe(2);
    expect(cpaFor('sky', 2)).toBe(2);
    expect(cpaFor('sky', 3)).toBe(3);
    expect(cpaFor('forest', 1)).toBe(1);
    expect(cpaFor('fairy', 1)).toBe(1);
  });
  it('the hub: the highest step of the worlds she has been in', () => {
    expect(worldCpa('hub', [])).toBe(1);
    expect(worldCpa('hub', ['fairy', 'forest'])).toBe(2);
    expect(worldCpa('hub', ['fairy', 'hub', 'sweet', 'sea'])).toBe(3);
  });
  it('read from the world played; the walkthrough\'s lever over it', () => {
    const back = setCpaWorld(() => 'sea', () => []);
    expect(cpaOf(4)).toBe(2);
    cpaHold.step = 3;
    expect(cpaOf(4)).toBe(3);
    back();
    cpaHold.step = null;
    expect(cpaOf(4)).toBe(1);
  });
});

/** Opens "sub" of `level` with `seed` at the step `step`. */
function open(step: 1 | 2 | 3, level = 2, seed = 3) {
  cpaHold.step = step;
  const spec = sub.generate(level, mulberry32(seed));
  void runTask('sub', level, hooks, mulberry32(seed));
  const right = [...opts().querySelectorAll<HTMLElement>('.opt')].find((b) => b.textContent === String(spec.body.answer))!;
  const wrong = [...opts().querySelectorAll<HTMLElement>('.opt')].find((b) => b !== right)!;
  return { spec, right, wrong };
}

describe('"sub" by the step', () => {
  it('1: the things, the ones taken away greyed out (as always)', () => {
    const { spec } = open(1);
    expect(all('.it')).toHaveLength(spec.body.total);
    expect(all('.it.gone')).toHaveLength(spec.body.gone);
    expect(stage().dataset.cpa).toBeUndefined();
  });

  it('2: every thing coloured, "− k" by the basket; the k go into it only after the answer', async () => {
    const { spec, right } = open(2);
    expect(all('.it')).toHaveLength(spec.body.total);
    expect(all('.it.gone')).toHaveLength(0);
    expect(all('.it.taken')).toHaveLength(0);
    expect(stage().querySelector('.cpa-basket:not(.closed) .cpa-k')!.textContent).toBe(`− ${spec.body.gone}`);
    down(right);
    expect(all('.it.taken')).toHaveLength(spec.body.gone);
  });

  it('3: "Було N, k забрали" by a closed basket, no thing seen until the answer', () => {
    const { spec, right } = open(3);
    expect(stage().querySelector('.cpa-line')!.textContent).toBe(`Було ${spec.body.total}, ${spec.body.gone} забрали`);
    expect(stage().querySelector('.cpa-basket.closed')).not.toBeNull();
    expect(stage().querySelector('.cpa-things')!.classList.contains('hid')).toBe(true);
    down(right);
    expect(stage().querySelector('.cpa-things')!.classList.contains('hid')).toBe(false);
    expect(all('.it.taken')).toHaveLength(spec.body.gone);
  });

  it('a mistake opens nothing; the counting rung of the hint shows the picture of the first step at 2 and 3', async () => {
    for (const step of [2, 3] as const) {
      document.body.innerHTML = MARKUP;
      const { spec, wrong } = open(step);
      down(wrong);
      // the first rung of the hint is its words alone (LEARN-10): still nothing given away
      for (let i = 0; i < 10; i++) { await vi.advanceTimersByTimeAsync(500); await breathe(); }
      expect(all('.it.gone')).toHaveLength(0);
      if (step === 3) expect(stage().querySelector('.cpa-things')!.classList.contains('hid')).toBe(true);
      down(wrong);   // the second rung counts the things left
      for (let i = 0; i < 20 && all('.it.gone').length === 0; i++) { await vi.advanceTimersByTimeAsync(500); await breathe(); }
      expect(all('.it.gone'), `step ${step}`).toHaveLength(spec.body.gone);
      expect(stage().querySelector('.cpa-things')!.classList.contains('hid')).toBe(false);
    }
  });
});

/** Opens `type` of `level` with `seed` at `step`; the right and a wrong answer button (none for compare). */
async function openType(type: 'add' | 'count' | 'compare' | 'neighbors' | 'missing', step: 1 | 2 | 3, level = 2, seed = 5) {
  document.body.innerHTML = MARKUP;
  cpaHold.step = step;
  const { generate } = await import('../tasks');
  const spec = generate(type, level, mulberry32(seed));
  void runTask(type, level, hooks, mulberry32(seed));
  const answer = (spec.body as { answer?: number }).answer;
  const right = [...opts().querySelectorAll<HTMLElement>('.opt')].find((b) => b.textContent === String(answer));
  return { spec, right };
}
const shownItems = () => all('.it').filter((e) => !e.closest('.cpa-asnum, .hid'));

describe('the other number tasks by the step', () => {
  it('"add": 1 - two groups of things; 2 - the first group its number; 3 - both numbers; the answer opens the things', async () => {
    const one = await openType('add', 1);
    expect(all('.cpa-asnum')).toHaveLength(0);
    expect(shownItems()).toHaveLength(all('.it').length);
    const two = await openType('add', 2);
    const a = (two.spec.body as { a: number }).a;
    expect(all('.cpa-asnum').map((g) => g.dataset.n)).toEqual([String(a)]);
    expect(shownItems()).toHaveLength(all('.it').length - a);
    const three = await openType('add', 3);
    expect(all('.cpa-asnum')).toHaveLength(2);
    expect(shownItems()).toHaveLength(0);
    down(three.right!);
    expect(all('.cpa-asnum')).toHaveLength(0);
    void one;
  });

  it('"count": 2 - scattered; 3 - shown for a moment, then hidden; «Ще раз» shows them again; the answer opens them', async () => {
    await openType('count', 2);
    expect(stage().classList.contains('cpa-scatter')).toBe(true);
    const three = await openType('count', 3);
    const box = () => stage().querySelector('.cpa-things')!;
    expect(box().classList.contains('hid')).toBe(false);
    await vi.advanceTimersByTimeAsync(2100);
    expect(box().classList.contains('hid')).toBe(true);
    down(stage().querySelector('.cpa-again')!);
    expect(box().classList.contains('hid')).toBe(false);
    await vi.advanceTimersByTimeAsync(2100);
    expect(box().classList.contains('hid')).toBe(true);
    down(three.right!);
    await vi.advanceTimersByTimeAsync(2100);
    expect(box().classList.contains('hid')).toBe(false);
  });

  it('"count" 3: once the hint has opened the things they stay, «Ще раз» does not hide them while the cat counts', async () => {
    const { right } = await openType('count', 3);
    const box = () => stage().querySelector('.cpa-things')!;
    const wrong = [...opts().querySelectorAll<HTMLElement>('.opt')].find((b) => b !== right)!;
    down(wrong); for (let i = 0; i < 10; i++) { await vi.advanceTimersByTimeAsync(500); await breathe(); }
    down(wrong); for (let i = 0; i < 10 && box().classList.contains('hid'); i++) { await vi.advanceTimersByTimeAsync(500); await breathe(); }
    expect(box().classList.contains('hid')).toBe(false);
    down(stage().querySelector('.cpa-again')!);
    await vi.advanceTimersByTimeAsync(2100);
    expect(box().classList.contains('hid')).toBe(false);
  });

  it('"compare": 2 - the bigger number in small things, the smaller in big ones; 3 - the numbers', async () => {
    const two = await openType('compare', 2);
    const sizes = (two.spec.body as { groups: [number, number] }).groups;
    if (sizes[0] !== sizes[1]) {
      const big = sizes[0] > sizes[1] ? 0 : 1;
      const groups = all('.group');
      expect(groups[big].classList.contains('cpa-small')).toBe(true);
      expect(groups[1 - big].classList.contains('cpa-big')).toBe(true);
    }
    await openType('compare', 3);
    expect(all('.group.digits')).toHaveLength(2);
    expect(all('.it')).toHaveLength(0);
  });

  it('"neighbors": 2 - the track without its other numbers; 3 - the number and "?" alone; the hint shows the track', async () => {
    await openType('neighbors', 2, 4);
    expect(all('.cell.cpa-off')).toHaveLength(3);
    await openType('neighbors', 3, 4);
    expect(all('.cell').filter((x) => !x.classList.contains('hidden'))).toHaveLength(2);
  });

  it('"missing": 2 and 3 - the known addend as its number', async () => {
    const two = await openType('missing', 2, 3);
    expect(all('.cpa-asnum').map((g) => g.dataset.n)).toEqual([String((two.spec.body as { a: number }).a)]);
    await openType('missing', 1, 3);
    expect(all('.cpa-asnum')).toHaveLength(0);
  });

  it('the panel kept from task to task: a task at step 1 after one at step 3 carries no mark of step 3', async () => {
    await openType('add', 3);
    expect(stage().dataset.cpa).toBe('3');
    for (const type of ['sub', 'add', 'count', 'compare', 'neighbors', 'missing'] as const) {
      await openType(type === 'sub' ? 'add' : type, 3);
      cpaHold.step = 1;
      void runTask(type, type === 'neighbors' ? 4 : 2, hooks, mulberry32(3));
      expect(stage().dataset.cpa, type).toBeUndefined();
    }
  });

  it('no step limits the time of an answer or counts a mistake: an hour open at every step (LEARN-14)', async () => {
    for (const type of ['sub', 'add', 'count', 'compare', 'neighbors', 'missing'] as const) {
      for (const step of [1, 2, 3] as const) {
        document.body.innerHTML = MARKUP;
        cpaHold.step = step;
        let done = false;
        void runTask(type, type === 'neighbors' ? 4 : 3, hooks, mulberry32(7)).then(() => { done = true; });
        await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
        expect(done, `${type} ${step}`).toBe(false);
        expect(opts().querySelectorAll('.opt.no').length + stage().querySelectorAll('.no').length, `${type} ${step}`).toBe(0);
      }
    }
  });
});
