// @vitest-environment happy-dom
/**
 * The shows of the tasks in breadth (LEARN-27; sum3.ts, gap.ts): what stands on the panel, what the first rung of the
 * hint leaves hidden and what the second one solves together. The order after a mistake, the three rungs and the end
 * of a task are checked for every type by mistake.test.ts, play.test.ts and fly.test.ts.
 * happy-dom lays nothing out: the sizes are in the style sheet, the fit on a phone is checked by `npm run e2e`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/util';
import type { Spoken } from '../../core/audio';
import { example as sum3Example, type Three } from '../tasks/sum3';
import { example as gapExample } from '../tasks/gap';
import { showTask, type TaskHooks } from './panel';
import { fillOrder } from './sum3';
import { TEN } from './tenframe';

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const LONG = 60_000;              // longer than counting 20 things aloud

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; });

const stage = () => document.getElementById('taskStage')!;
const all = (parent: Element, selector: string) => [...parent.querySelectorAll<HTMLElement>(selector)];
const text = (e: Element) => e.textContent ?? '';
const tap = (e: HTMLElement) => { e.dispatchEvent(new PointerEvent('pointerdown')); };
const spoken = () => Promise.resolve() as Spoken;

/** Hooks that remember the lines of the hint and the numbers the cat said while counting. */
function listen() {
  const heard = { hints: [] as string[], numbers: [] as number[] };
  const hooks: TaskHooks = { prompt: () => {}, number: (n) => { heard.numbers.push(n); }, good: () => {}, wrong: spoken, hint: (key) => { heard.hints.push(key); return spoken(); } };
  return { hooks, heard };
}
/** A wrong answer and everything that follows it, to its end. */
async function miss(answer: number) {
  const wrong = all(document.body, '#taskOpts .opt').find((b) => Number(text(b)) !== answer)!;
  tap(wrong);
  await vi.advanceTimersByTimeAsync(LONG);
}
/** The numbers on the counted things of `parent`, in the order of the page. */
const badges = (parent: Element) => all(parent, '.it > i').map((b) => Number(text(b)));

describe('three addends on the panel', () => {
  const open = (parts: Three) => {
    const spec = sum3Example(5, parts, mulberry32(7)), { hooks, heard } = listen();
    void showTask(spec, hooks);
    return { spec, heard, groups: all(stage(), '.group') };
  };
  const things = (group: Element) => all(group, '.tf > .it').length;

  it('the row: three groups, each its number over as many things in one ten frame, "+" between them, "=" and "?"', () => {
    const { spec, groups } = open([7, 5, 3]);
    expect(stage().className).toBe('t-stage t-sum3');
    expect([...stage().children].map((e) => (e.classList.contains('group') ? 'group' : text(e)))).toEqual(['group', '+', 'group', '+', 'group', '=', '?']);
    expect(groups.map((g) => text(g.querySelector('.n')!))).toEqual(['7', '5', '3']);
    expect(groups.map(things)).toEqual([7, 5, 3]);
    for (const g of groups) {
      expect(all(g, '.tf')).toHaveLength(1);
      expect(g.querySelector('.tf')!.children).toHaveLength(TEN);
    }
    // the things are pictures: nothing on the stage takes a tap, the answers are the four numbers under it
    expect(all(stage(), 'button')).toEqual([]);
    expect(all(stage(), '.it').every((e) => text(e) === spec.body.thing)).toBe(true);
    expect(all(document.body, '#taskOpts .opt').map((b) => Number(text(b)))).toEqual(spec.body.options);
  });

  it.each([
    [[7, 5, 3], [0, 2, 1]],      // seven and three make ten: the larger first, then its pair, then the third
    [[3, 5, 7], [2, 0, 1]],
    [[4, 6, 9], [1, 0, 2]],
    [[5, 5, 4], [0, 1, 2]],      // equal numbers: the one that stands first
    [[5, 4, 5], [0, 2, 1]],
    [[6, 5, 3], [0, 1, 2]],      // no two make ten: the largest first, the other two as they stand
    [[3, 9, 6], [1, 0, 2]],
    [[4, 4, 9], [2, 0, 1]],
  ] as [Three, number[]][])('%j: the second rung goes through the groups in the order %j', (parts, order) => {
    expect(fillOrder(sum3Example(5, parts, mulberry32(1)))).toEqual(order);
  });

  it('with a pair of ten: the first mistake names the way and shows nothing; the second fills the frame of the larger of the two with the other and counts the third on', async () => {
    const { spec, heard, groups } = open([7, 5, 3]);
    await miss(spec.body.answer);
    expect(heard.hints).toEqual(['h1_sum3']);
    expect(heard.numbers).toEqual([]);
    expect(badges(stage())).toEqual([]);
    expect(groups.map(things)).toEqual([7, 5, 3]);

    await miss(spec.body.answer);
    expect(heard.hints).toEqual(['h1_sum3', 'h2_add_cross']);
    // the three of the third group moved into the frame of seven: 8, 9, 10 - the frame is full
    expect(groups.map(things)).toEqual([10, 5, 0]);
    expect(badges(groups[0])).toEqual([8, 9, 10]);
    // then the five are counted on where they stand
    expect(badges(groups[1])).toEqual([11, 12, 13, 14, 15]);
    expect(heard.numbers).toEqual([8, 9, 10, 11, 12, 13, 14, 15]);
    expect(heard.numbers.at(-1)).toBe(spec.body.answer);
    // a thing that moved left an empty cell behind: every frame keeps its ten cells, the numbers over them stay
    for (const g of groups) expect(g.querySelector('.tf')!.children).toHaveLength(TEN);
    expect(groups.map((g) => text(g.querySelector('.n')!))).toEqual(['7', '5', '3']);
    expect(all(document.body, '.pulse')).toEqual([]);

    await miss(spec.body.answer);
    expect(heard.hints).toEqual(['h1_sum3', 'h2_add_cross', 'h3_show']);
    expect(all(document.body, '.pulse').map((b) => Number(text(b)))).toEqual([spec.body.answer]);
  });

  it('without a pair of ten: the way is the one of adding across ten; the frame of the largest number is filled by the next ones, the rest is counted on', async () => {
    const { spec, heard, groups } = open([6, 5, 3]);
    await miss(spec.body.answer);
    expect(heard.hints).toEqual(['h1_add_cross']);
    expect(badges(stage())).toEqual([]);

    await miss(spec.body.answer);
    expect(heard.hints).toEqual(['h1_add_cross', 'h2_add_cross']);
    // four of the five fill the frame of six (7, 8, 9, 10); the fifth and the three are counted on where they stand
    expect(groups.map(things)).toEqual([10, 1, 3]);
    expect(badges(groups[0])).toEqual([7, 8, 9, 10]);
    expect(badges(groups[1])).toEqual([11]);
    expect(badges(groups[2])).toEqual([12, 13, 14]);
    expect(heard.numbers).toEqual([7, 8, 9, 10, 11, 12, 13, 14]);
  });

  it('the last number counted is the sum, whatever the three numbers', async () => {
    for (const parts of [[2, 9, 9], [9, 2, 8], [4, 4, 9], [8, 5, 2], [5, 5, 5], [9, 9, 2]] as Three[]) {
      document.body.innerHTML = MARKUP;
      const { spec, heard, groups } = open(parts);
      await miss(spec.body.answer); await miss(spec.body.answer);
      const [first] = fillOrder(spec);
      expect(heard.numbers, parts.join('+')).toEqual(Array.from({ length: spec.body.answer - parts[first] }, (_, i) => parts[first] + i + 1));
      expect(things(groups[first]), parts.join('+')).toBe(TEN);
      expect(groups.map(things).reduce((x, y) => x + y, 0)).toBe(spec.body.answer);
      vi.clearAllTimers();
    }
  });

  it('the style sheet: the things of a group are small cells sized to the screen, and their numbers are sized to the cell', async () => {
    const fsModule = 'node:fs';
    const { readFileSync } = await import(/* @vite-ignore */ fsModule) as { readFileSync(path: string, encoding: 'utf8'): string };
    const css = readFileSync(decodeURIComponent(import.meta.url.replace(/^file:\/\//, '').replace(/[^/]+$/, 'wide.css')), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).toMatch(/\.t-sum3 \.tf \{[^}]*--p: clamp\(26px, min\(4vw, 7\.4vh\), 40px\);[^}]*grid-template-columns: repeat\(5, var\(--p\)\);[^}]*grid-auto-rows: var\(--p\);/);
    expect(css).toMatch(/\.t-sum3 \.tf > \.it, \.t-sum3 \.tf > \.tf-e \{[^}]*width: var\(--p\); height: var\(--p\);/);
    expect(css).toMatch(/\.t-sum3 \.tf > \.it i \{[^}]*height: calc\(var\(--p\) \* \.62\);/);
    expect(css).toMatch(/\.t-gap \.things \{[^}]*flex: 0 0 100%;/);
  });
});

describe('the missing number of a take away on the panel', () => {
  const open = (total: number, left: number) => {
    const spec = gapExample(5, total, left, mulberry32(7)), { hooks, heard } = listen();
    void showTask(spec, hooks);
    return { spec, heard, things: all(stage(), '.things .it') };
  };

  it('the things in ten frames, the ones taken away greyed out at the end; under them the example in numbers with "?"', () => {
    const { spec, things } = open(13, 6);
    expect(stage().className).toBe('t-stage t-gap');
    expect([...stage().children].map((e) => (e.classList.contains('things') ? 'things' : text(e)))).toEqual(['things', '13', '−', '?', '=', '6']);
    expect(things).toHaveLength(13);
    expect(all(stage(), '.things .tf').map((f) => all(f, '.it').length)).toEqual([10, 3]);
    expect(things.map((e) => e.classList.contains('gone'))).toEqual([...Array.from({ length: 6 }, () => false), ...Array.from({ length: 7 }, () => true)]);
    expect(spec.body.answer).toBe(7);
    expect(all(document.body, '#taskOpts .opt').map((b) => Number(text(b)))).toEqual(spec.body.options);
  });

  it('the first mistake names the way and shows nothing; the second counts the things taken away, one by one; the third lights the answer', async () => {
    const { spec, heard, things } = open(13, 6);
    await miss(spec.body.answer);
    expect(heard.hints).toEqual(['h1_gap']);
    expect(heard.numbers).toEqual([]);
    expect(badges(stage())).toEqual([]);
    expect(all(stage(), '.hit')).toEqual([]);

    await miss(spec.body.answer);
    expect(heard.hints).toEqual(['h1_gap', 'h2_gap']);
    expect(heard.numbers).toEqual([1, 2, 3, 4, 5, 6, 7]);
    // only the things taken away are counted: the six that are left carry no number
    expect(things.map((e) => text(e.querySelector('i') ?? document.createElement('i')))).toEqual(['', '', '', '', '', '', '1', '2', '3', '4', '5', '6', '7']);
    expect(things.map((e) => e.classList.contains('hit'))).toEqual(things.map((e) => e.classList.contains('gone')));
    expect(all(document.body, '.pulse')).toEqual([]);
    expect(text(stage().querySelector('.sign.q')!)).toBe('?');

    await miss(spec.body.answer);
    expect(heard.hints).toEqual(['h1_gap', 'h2_gap', 'h3_show']);
    expect(all(document.body, '.pulse').map((b) => Number(text(b)))).toEqual([7]);
  });

  it('the count of the second rung ends on the answer, whatever the numbers', async () => {
    for (const [total, left] of [[11, 9], [20, 11], [14, 7], [12, 3], [18, 16]]) {
      document.body.innerHTML = MARKUP;
      const { spec, heard } = open(total, left);
      await miss(spec.body.answer); await miss(spec.body.answer);
      expect(heard.numbers, `${total} - ? = ${left}`).toEqual(Array.from({ length: total - left }, (_, i) => i + 1));
      expect(badges(stage()).at(-1)).toBe(spec.body.answer);
      vi.clearAllTimers();
    }
  });
});
