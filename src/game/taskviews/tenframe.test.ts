// @vitest-environment happy-dom
/**
 * Ten frames (LEARN-04): the shared helper, and the shows of add and sub that use it from level 4 - every ten is a
 * frame of two rows of five, the things keep their order, and the hint counts them aloud frame by frame.
 * happy-dom lays nothing out: the sizes are checked in the style sheet, the fit on a phone by `npm run e2e`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/util';
import type { Spoken } from '../../core/audio';
import { runTask, type TaskHooks } from './panel';
import { FRAMES_FROM, ROW, TEN, frameSizes, tenFrames } from './tenframe';
import { add } from '../tasks/add';
import { sub } from '../tasks/sub';

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const realTimeout = setTimeout;   // taken before the fake clock is installed, which would never fire it
const breathe = () => new Promise<void>((resolve) => { realTimeout(resolve, 0); });
const LONG = 60_000;              // longer than counting 20 things aloud

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; });

const stage = () => document.getElementById('taskStage')!;
const all = (parent: Element, selector: string) => [...parent.querySelectorAll<HTMLElement>(selector)];
const spoken = () => Promise.resolve() as Spoken;

/** Hooks that remember the numbers the cat said while counting. */
function listen() {
  const numbers: number[] = [];
  const hooks: TaskHooks = { prompt: () => {}, number: (n) => { numbers.push(n); }, good: () => {}, wrong: spoken, hint: spoken };
  return { hooks, numbers };
}
/** Each frame on the stage: ten cells, the things first, then the empty cells. */
function expectFrames(box: Element, sizes: number[]) {
  const frames = all(box, ':scope > .tf');
  expect(frames.map((f) => f.querySelectorAll(':scope > .it').length)).toEqual(sizes);
  for (const f of frames) {
    const cells = [...f.children];
    expect(cells.length).toBe(TEN);
    const things = cells.filter((x) => x.classList.contains('it')).length;
    expect(cells.map((x) => x.className), 'the things fill the frame from its first cell').toEqual([
      ...Array.from({ length: things }, () => expect.stringMatching(/\bit\b/)), ...Array.from({ length: TEN - things }, () => 'tf-e')]);
  }
}
describe('the ten frame helper', () => {
  it('ten cells a frame, two rows of five', () => { expect([TEN, ROW]).toEqual([10, 5]); });

  it.each([[0, [0]], [3, [3]], [10, [10]], [11, [10, 1]], [17, [10, 7]], [20, [10, 10]], [23, [10, 10, 3]]])('%i things: frames of %j', (n, sizes) => {
    expect(frameSizes(n)).toEqual(sizes);
  });

  it('moves the given elements into the frames in their order and keeps them (taps and badges stay with the show)', () => {
    const parent = document.createElement('div');
    const things = Array.from({ length: 13 }, (_, i) => { const b = document.createElement('button'); b.className = 'it'; b.textContent = String(i); parent.appendChild(b); return b; });
    const box = tenFrames(parent, things);
    expect(box.parentElement).toBe(parent);
    expect([...parent.children]).toEqual([box]);
    expect(box.className).toBe('tens');
    expectFrames(box, [10, 3]);
    expect(all(box, '.it')).toEqual(things);
    expect(tenFrames(document.createElement('div'), things.slice(0, 4), true).className).toBe('tens stack');
  });

  it('the style sheet draws a frame as five columns of 44 px cells, two rows: a cell is a whole button (44 x 44)', async () => {
    const fsModule = 'node:fs';
    const { readFileSync } = await import(/* @vite-ignore */ fsModule) as { readFileSync(path: string, encoding: 'utf8'): string };
    // a path, not a URL: here happy-dom's URL resolves a relative name against its own page (http://localhost:3000/)
    const css = readFileSync(decodeURIComponent(import.meta.url.replace(/^file:\/\//, '').replace(/[^/]+$/, 'hints.css')), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.tf \{[^}]*display: grid;[^}]*grid-template-columns: repeat\(5, 44px\);[^}]*grid-auto-rows: 44px;/);
    expect(css).toMatch(/\.tf > \.it, \.tf > \.tf-e \{[^}]*width: 44px; height: 44px;/);
    expect(css).toMatch(/\.tens\.stack \{[^}]*flex-direction: column;/);
  });
});

describe('add and sub show ten frames from level 4 (LEARN-04)', () => {
  const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

  it('frames start at level 4', () => { expect(FRAMES_FROM).toBe(4); });

  it.each([4, 5, 6])('add, level %i: each group is its own stack of frames, the things in order', async (level) => {
    for (const seed of SEEDS) {
      document.body.innerHTML = MARKUP;
      const { a, b } = add.generate(level, mulberry32(seed)).body;
      void runTask('add', level, listen().hooks, mulberry32(seed));
      const groups = all(stage(), ':scope > .group');
      expect(groups.length).toBe(2);
      groups.forEach((g, i) => {
        expect(g.classList.contains('framed')).toBe(true);
        const boxes = all(g, ':scope > .tens.stack');
        expect(boxes.length, 'one stack of frames per group, nothing else in it').toBe(1);
        expect(g.children.length).toBe(1);
        expectFrames(boxes[0], frameSizes(i === 0 ? a : b));
      });
      expect(all(stage(), '.it').length).toBe(a + b);
      vi.clearAllTimers();
    }
    await breathe();
  });

  it.each([4, 5, 6])('sub, level %i: the things stand in frames, the last ones gone', async (level) => {
    for (const seed of SEEDS) {
      document.body.innerHTML = MARKUP;
      const { total, gone } = sub.generate(level, mulberry32(seed)).body;
      void runTask('sub', level, listen().hooks, mulberry32(seed));
      const boxes = all(stage(), ':scope > .tens');
      expect(boxes.length).toBe(1);
      expect(stage().children.length, 'all the things are in the frames').toBe(1);
      expectFrames(boxes[0], frameSizes(total));
      const things = all(stage(), '.it');
      expect(things.map((x) => x.classList.contains('gone'))).toEqual(things.map((_, i) => i >= total - gone));
      vi.clearAllTimers();
    }
    await breathe();
  });

  it.each([['add', 1], ['add', 2], ['add', 3], ['sub', 1], ['sub', 2], ['sub', 3]] as const)('%s, level %i: no frames, the things as before', (type, level) => {
    for (const seed of SEEDS.slice(0, 10)) {
      document.body.innerHTML = MARKUP;
      void runTask(type, level, listen().hooks, mulberry32(seed));
      expect(all(stage(), '.tens, .tf, .framed')).toEqual([]);
      vi.clearAllTimers();
    }
  });

  it.each([['add', 4], ['add', 5], ['sub', 4], ['sub', 5]] as const)('%s, level %i: after a mistake the hint counts the things frame by frame, row by row', async (type, level) => {
    for (const seed of [3, 7, 11]) {
      document.body.innerHTML = MARKUP;
      const spec = type === 'add' ? add.generate(level, mulberry32(seed)) : sub.generate(level, mulberry32(seed));
      const left = spec.type === 'add' ? spec.body.a + spec.body.b : spec.body.total - spec.body.gone;
      const { hooks, numbers } = listen();
      void runTask(type, level, hooks, mulberry32(seed));
      const wrong = all(document.getElementById('taskOpts')!, '.opt').find((o) => Number(o.textContent) !== spec.body.answer)!;
      wrong.dispatchEvent(new PointerEvent('pointerdown'));
      await vi.advanceTimersByTimeAsync(LONG);
      const counted = Array.from({ length: left }, (_, i) => i + 1);
      expect(numbers, `${type} seed ${seed}`).toEqual(counted);
      // the badges read 1, 2, 3 ... in the order of the frames on screen
      const badges = all(stage(), '.tf > .it > i').map((i) => Number(i.textContent));
      expect(badges, `${type} seed ${seed}`).toEqual(counted);
      vi.clearAllTimers();
    }
    await breathe();
  });
});
