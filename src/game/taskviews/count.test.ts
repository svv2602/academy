// @vitest-environment happy-dom
/**
 * The show of "count" at levels 4-5 (LEARN-05): 11-20 things in ten frames (LEARN-04 helper), four answer numbers up to
 * 20, a tap on a thing names its number, the hint counts frame by frame. Levels 1-3 keep the things without frames.
 * happy-dom lays nothing out: the 44 x 44 cells are pinned in `tenframe.test.ts`, the fit on a phone by `npm run e2e`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/util';
import type { Spoken } from '../../core/audio';
import { runTask, type TaskHooks } from './panel';
import { TEN, frameSizes } from './tenframe';
import { count } from '../tasks/count';

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const realTimeout = setTimeout;   // taken before the fake clock is installed, which would never fire it
const breathe = () => new Promise<void>((resolve) => { realTimeout(resolve, 0); });
const LONG = 60_000;              // longer than counting 20 things aloud
const SEEDS = Array.from({ length: 30 }, (_, i) => i + 1);

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; });

const stage = () => document.getElementById('taskStage')!;
const opts = () => document.getElementById('taskOpts')!;
const all = (parent: Element, selector: string) => [...parent.querySelectorAll<HTMLElement>(selector)];
const spoken = () => Promise.resolve() as Spoken;
const down = (e: Element) => e.dispatchEvent(new PointerEvent('pointerdown'));

/** Hooks that remember the numbers the cat said while counting. */
function listen() {
  const numbers: number[] = [];
  const hooks: TaskHooks = { prompt: () => {}, number: (n) => { numbers.push(n); }, good: () => {}, wrong: spoken, hint: spoken };
  return { hooks, numbers };
}
/** Opens the count of `level` with `seed` and returns its description and what the cat counted. */
function open(level: number, seed: number) {
  document.body.innerHTML = MARKUP;
  const spec = count.generate(level, mulberry32(seed)), heard = listen();
  void runTask('count', level, heard.hooks, mulberry32(seed));
  return { spec, numbers: heard.numbers };
}

describe('count to 20 in ten frames (LEARN-05)', () => {
  it.each([4, 5, 6])('level %i: all the things stand in ten frames in a row, two rows of five each, the empty cells last', async (level) => {
    for (const seed of SEEDS) {
      const { spec: { body: { n } } } = open(level, seed);
      const boxes = all(stage(), ':scope > .tens');
      expect(boxes.length, `seed ${seed}`).toBe(1);
      expect(boxes[0].className, 'the frames stand side by side, not stacked').toBe('tens');
      expect(stage().children.length, 'nothing outside the frames').toBe(1);
      const frames = all(boxes[0], ':scope > .tf');
      expect(frames.map((f) => f.querySelectorAll(':scope > .it').length)).toEqual(frameSizes(n));
      expect(frames.length).toBe(2);
      for (const f of frames) {
        expect(f.children.length).toBe(TEN);
        const things = f.querySelectorAll(':scope > .it').length;
        expect([...f.children].map((x) => (x.classList.contains('it') ? 'it' : x.className))).toEqual([
          ...Array.from({ length: things }, () => 'it'), ...Array.from({ length: TEN - things }, () => 'tf-e')]);
      }
      expect(all(stage(), '.it').length).toBe(n);
      vi.clearAllTimers();
    }
    await breathe();
  });

  it.each([4, 5])('level %i: four answer numbers up to 20, one of them right', (level) => {
    for (const seed of SEEDS) {
      const { spec } = open(level, seed);
      const values = all(opts(), '.opt').map((b) => Number(b.textContent));
      expect(values).toEqual(spec.body.options);
      expect(values.length).toBe(4);
      expect(values.every((v) => v >= 0 && v <= 20)).toBe(true);
      expect(values.filter((v) => v === spec.body.n)).toEqual([spec.body.n]);
      vi.clearAllTimers();
    }
  });

  it.each([4, 5])('level %i: tapping the things one by one names 1, 2 ... up to the last, past ten (tap_11 ... tap_20)', async (level) => {
    for (const seed of [2, 5, 9]) {
      const { spec: { body: { n } }, numbers } = open(level, seed);
      // in the order of the frames on screen: the first frame row by row, then the second
      for (const b of all(stage(), '.tf > .it')) down(b);
      down(all(stage(), '.tf > .it')[0]);          // a thing already counted is not counted again
      const counted = Array.from({ length: n }, (_, i) => i + 1);
      expect(numbers).toEqual(counted);
      expect(numbers.some((x) => x > 10)).toBe(true);
      expect(all(stage(), '.tf > .it > i').map((i) => Number(i.textContent))).toEqual(counted);
      vi.clearAllTimers();
    }
    await breathe();
  });

  it.each([4, 5])('level %i: the first mistake counts nothing; the second counts on from the full frame: 10, 11, 12 ...', async (level) => {
    for (const seed of [3, 7]) {
      const { spec, numbers } = open(level, seed);
      const wrong = all(opts(), '.opt').find((o) => Number(o.textContent) !== spec.body.answer)!;
      down(wrong);
      await vi.advanceTimersByTimeAsync(LONG);
      expect(numbers, `seed ${seed}`).toEqual([]);
      expect(all(stage(), '.it > i, .it.hit, .pulse')).toEqual([]);
      down(wrong);
      await vi.advanceTimersByTimeAsync(LONG);
      const counted = Array.from({ length: spec.body.n - 9 }, (_, i) => i + 10);
      expect(numbers, `seed ${seed}`).toEqual(counted);
      expect(all(stage(), '.tf > .it > i').map((i) => Number(i.textContent))).toEqual(counted);
      expect(all(stage(), '.tf:first-child > .it.hit')).toHaveLength(10);   // the whole first frame is the ten
      expect(all(document.body, '.pulse')).toEqual([]);
      vi.clearAllTimers();
      await breathe();
    }
  });

  it.each([4, 5])('level %i: the right number solves the task', async (level) => {
    const { spec } = open(level, 4);
    document.body.innerHTML = MARKUP;
    const done = runTask('count', level, listen().hooks, mulberry32(4));
    down(all(opts(), '.opt').find((o) => Number(o.textContent) === spec.body.answer)!);
    await vi.advanceTimersByTimeAsync(LONG);
    expect(await done).toEqual({ solved: true, wrong: 0 });
  });

  it.each([1, 2, 3])('level %i: no frames, the things and the numbers 1..10 as before', (level) => {
    for (const seed of SEEDS.slice(0, 10)) {
      const { spec: { body: { n } } } = open(level, seed);
      expect(all(stage(), '.tens, .tf, .tf-e')).toEqual([]);
      expect(all(stage(), ':scope > .it').length).toBe(n);
      expect(all(opts(), '.opt').map((b) => Number(b.textContent))).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
      vi.clearAllTimers();
    }
  });
});
