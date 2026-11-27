// @vitest-environment happy-dom
/**
 * The shows of the tasks in breadth (LEARN-27; sum3.ts, gap.ts, chain.ts, exprs.ts, story.ts): what stands on the panel, what the first rung of the
 * hint leaves hidden and what the second one solves together. The order after a mistake, the three rungs and the end
 * of a task are checked for every type by mistake.test.ts, play.test.ts and fly.test.ts.
 * happy-dom lays nothing out: the sizes are in the style sheet, the fit on a phone is checked by `npm run e2e`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/util';
import type { Spoken } from '../../core/audio';
import { example as sum3Example, type Three } from '../tasks/sum3';
import { example as gapExample } from '../tasks/gap';
import { example as chainExample, type Chain } from '../tasks/chain';
import { example as exprsExample, type Side } from '../tasks/exprs';
import { example as storyExample } from '../tasks/story';
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
async function miss(answer: number | string) {
  const wrong = all(document.body, '#taskOpts .opt').find((b) => text(b) !== String(answer))!;
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
    // the pictures of a story are drawn with the same small frames
    expect(css).toMatch(/\.t-sum3 \.tf, \.t-story \.tf \{[^}]*--p: clamp\(26px, min\(4vw, 7\.4vh\), 40px\);[^}]*grid-template-columns: repeat\(5, var\(--p\)\);[^}]*grid-auto-rows: var\(--p\);/);
    expect(css).toMatch(/\.t-sum3 \.tf > \.it, \.t-sum3 \.tf > \.tf-e, \.t-story \.tf > \.it, \.t-story \.tf > \.tf-e \{[^}]*width: var\(--p\); height: var\(--p\);/);
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

describe('a chain of two actions on the panel', () => {
  const open = (addsFirst: boolean, numbers: Chain) => {
    const spec = chainExample(5, addsFirst, numbers, mulberry32(7)), { hooks, heard } = listen();
    void showTask(spec, hooks);
    return { spec, heard, things: () => all(stage(), '.things .it') };
  };
  const row = () => all(stage(), '.sign').map(text);
  const shownNumber = () => all(stage(), '.group > em').map(text);

  it('adding first: the things are the first number and, marked, the ones added; under them the example with "?"', () => {
    const { spec, things } = open(true, [8, 5, 6]);
    expect(stage().className).toBe('t-stage t-chain');
    expect(row()).toEqual(['8', '+', '5', '−', '6', '=', '?']);
    expect(things()).toHaveLength(13);
    expect(things().map((e) => e.classList.contains('more'))).toEqual([...Array.from({ length: 8 }, () => false), ...Array.from({ length: 5 }, () => true)]);
    expect(all(stage(), '.it.gone')).toEqual([]);
    expect(all(stage(), '.things .tf').map((f) => all(f, '.it').length)).toEqual([10, 3]);
    // nothing of the second action is shown, and no number is over the things
    expect(shownNumber()).toEqual([]);
    expect(spec.body.answer).toBe(7);
  });

  it('taking away first: the things are the first number, the ones taken away greyed out at the end', () => {
    const { things } = open(false, [15, 7, 4]);
    expect(row()).toEqual(['15', '−', '7', '+', '4', '=', '?']);
    expect(things()).toHaveLength(15);
    expect(things().map((e) => e.classList.contains('gone'))).toEqual([...Array.from({ length: 8 }, () => false), ...Array.from({ length: 7 }, () => true)]);
    expect(all(stage(), '.it.more')).toEqual([]);
  });

  it('adding first, the hint: the way said, nothing shown; then the number after the first action, and the last things leave one by one as it goes down to the answer; then the answer lit', async () => {
    const { spec, heard, things } = open(true, [8, 5, 6]);
    await miss(spec.body.answer);
    expect(heard.hints).toEqual(['h1_chain']);
    expect([heard.numbers, shownNumber(), all(stage(), '.away, .done')]).toEqual([[], [], []]);

    await miss(spec.body.answer);
    expect(heard.hints).toEqual(['h1_chain', 'h2_chain']);
    expect(heard.numbers).toEqual([13, 12, 11, 10, 9, 8, 7]);
    expect(shownNumber()).toEqual(['7']);
    // the six that left are the last six, the seven left stand
    expect(things().map((e) => e.classList.contains('away'))).toEqual([...Array.from({ length: 7 }, () => false), ...Array.from({ length: 6 }, () => true)]);
    // the first action of the example is marked as done, the second and the "?" are not
    expect(all(stage(), '.sign').map((e) => e.classList.contains('done'))).toEqual([true, true, true, false, false, false, false]);
    expect(all(document.body, '.pulse')).toEqual([]);
    expect(row().at(-1)).toBe('?');

    await miss(spec.body.answer);
    expect(heard.hints).toEqual(['h1_chain', 'h2_chain', 'h3_show']);
    expect(all(document.body, '.pulse').map((b) => Number(text(b)))).toEqual([7]);
  });

  it('taking away first, the hint: the number after the first action, then new things come one by one as it goes up to the answer', async () => {
    const { spec, heard, things } = open(false, [15, 7, 4]);
    await miss(spec.body.answer); await miss(spec.body.answer);
    expect(heard.numbers).toEqual([8, 9, 10, 11, 12]);
    expect(shownNumber()).toEqual(['12']);
    // the four that came took the cells of four that had left: 8 left, 4 new ones, 3 still greyed out
    expect(things()).toHaveLength(15);
    expect(things().filter((e) => e.classList.contains('more'))).toHaveLength(4);
    expect(things().filter((e) => e.classList.contains('gone'))).toHaveLength(3);
    expect(things().filter((e) => !e.classList.contains('gone'))).toHaveLength(spec.body.answer);
    expect(all(stage(), '.things .tf')).toHaveLength(2);
  });

  it('taking away first with more coming than left: the new things fill the cells left, then the empty ones, then a new frame', async () => {
    const { spec, heard } = open(false, [9, 2, 8]);
    expect(all(stage(), '.things .tf')).toHaveLength(1);
    await miss(spec.body.answer); await miss(spec.body.answer);
    expect(heard.numbers).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15]);
    const frames = all(stage(), '.things .tf');
    expect(frames.map((f) => f.children.length)).toEqual([TEN, TEN]);
    expect(frames.map((f) => all(f, '.it:not(.gone)').length)).toEqual([10, 5]);
    expect(all(stage(), '.it.gone')).toEqual([]);
  });

  it('the count of the second rung ends on the answer, whatever the chain', async () => {
    for (const [addsFirst, numbers] of [[true, [5, 2, 6]], [true, [15, 5, 9]], [true, [11, 9, 2]], [false, [15, 9, 8]], [false, [5, 4, 9]], [false, [12, 2, 9]]] as [boolean, Chain][]) {
      document.body.innerHTML = MARKUP;
      const { spec, heard } = open(addsFirst, numbers);
      await miss(spec.body.answer); await miss(spec.body.answer);
      expect(heard.numbers[0], numbers.join()).toBe(spec.body.mid);
      expect(heard.numbers.at(-1), numbers.join()).toBe(spec.body.answer);
      expect(heard.numbers, numbers.join()).toHaveLength(numbers[2] + 1);
      expect(shownNumber(), numbers.join()).toEqual([String(spec.body.answer)]);
      expect(all(stage(), '.things .it:not(.gone):not(.away)'), numbers.join()).toHaveLength(spec.body.answer);
      vi.clearAllTimers();
    }
  });
});

describe('comparing two examples on the panel', () => {
  const SUM: Side = { a: 8, sign: '+', b: 5, value: 13 }, DIFF: Side = { a: 20, sign: '−', b: 9, value: 11 }, ALONE: Side = { a: 13, sign: '', b: 0, value: 13 };
  const open = (sides: readonly [Side, Side]) => {
    const spec = exprsExample(5, sides, mulberry32(7)), { hooks, heard } = listen();
    void showTask(spec, hooks);
    return { spec, heard, sides: all(stage(), '.side') };
  };

  it('example, the empty place of the sign, example - drawn as the signs - and the three sign buttons; no value on screen', () => {
    const { sides } = open([SUM, DIFF]);
    expect(stage().className).toBe('t-stage t-exprs t-signs');
    expect([...stage().children].map(text)).toEqual(['8 + 5', '?', '20 − 9']);
    expect(sides).toHaveLength(2);
    expect(all(document.body, '#taskOpts .opt').map(text)).toEqual(['>', '<', '=']);
    expect(all(stage(), '.val, .tens')).toEqual([]);
  });

  it('a number alone stands as it is', () => {
    open([ALONE, SUM]);
    expect([...stage().children].map(text)).toEqual(['13', '?', '8 + 5']);
  });

  it('the hint: the way said, nothing shown; then what each example comes to, as a number and as things matched in pairs; then the sign lit', async () => {
    const { spec, heard, sides } = open([SUM, DIFF]);
    expect(spec.body.answer).toBe('>');
    await miss('>');
    expect(heard.hints).toEqual(['h1_exprs']);
    expect(all(stage(), '.val, .tens')).toEqual([]);

    await miss('>');
    expect(heard.hints).toEqual(['h1_exprs', 'h2_exprs']);
    expect(sides.map((x) => text(x.querySelector('.val')!))).toEqual(['13', '11']);
    expect(sides.map((x) => all(x, '.tf > .pt').length)).toEqual([13, 11]);
    // eleven pairs; the two of thirteen left over glow
    expect(sides.map((x) => all(x, '.pt.pair').length)).toEqual([11, 11]);
    expect(sides.map((x) => all(x, '.pt.extra').length)).toEqual([2, 0]);
    expect(all(document.body, '.pulse')).toEqual([]);
    expect(text(stage().querySelector('.slot')!)).toBe('?');

    await miss('>');
    expect(heard.hints).toEqual(['h1_exprs', 'h2_exprs', 'h3_show']);
    expect(all(document.body, '.pulse').map(text)).toEqual(['>']);
  });

  it('equal values: every thing has its pair, none glows', async () => {
    const { sides } = open([SUM, ALONE]);
    await miss('='); await miss('=');
    expect(sides.map((x) => text(x.querySelector('.val')!))).toEqual(['13', '13']);
    expect(sides.map((x) => all(x, '.pt.pair').length)).toEqual([13, 13]);
    expect(all(stage(), '.pt.extra')).toEqual([]);
  });
});

describe('a story in pictures on the panel', () => {
  const open = (addsFirst: boolean, numbers: Chain) => {
    const spec = storyExample(5, addsFirst, numbers, mulberry32(7)), { hooks, heard } = listen();
    void showTask(spec, hooks);
    return { spec, heard, scenes: all(stage(), '.scene') };
  };
  const shownNumber = () => all(stage(), '.group > em').map(text);

  it('some came, then some went away: three pictures with an arrow between them, the ones that went greyed out; nothing written', () => {
    const { spec, scenes } = open(true, [7, 6, 4]);
    expect(stage().className).toBe('t-stage t-story');
    expect([...stage().children].map((e) => (e.classList.contains('scene') ? e.className : text(e)))).toEqual(['scene was', '→', 'scene came', '→', 'scene went']);
    expect(scenes.map((x) => all(x, '.it').length)).toEqual([7, 6, 4]);
    expect(scenes.map((x) => all(x, '.it.gone').length)).toEqual([0, 0, 4]);
    expect(all(stage(), '.sign, .example, button')).toEqual([]);
    expect(text(stage())).not.toMatch(/\d/);
    expect(spec.body.answer).toBe(9);
  });

  it('some went away, then some came: the second picture is the greyed one', () => {
    const { scenes } = open(false, [15, 7, 4]);
    expect(scenes.map((x) => x.className)).toEqual(['scene was', 'scene went', 'scene came']);
    expect(scenes.map((x) => all(x, '.it').length)).toEqual([15, 7, 4]);
    expect(scenes.map((x) => all(x, '.it.gone').length)).toEqual([0, 7, 0]);
    // fifteen things: two small frames, one under the other
    expect(all(scenes[0], '.tf').map((f) => all(f, '.it').length)).toEqual([10, 5]);
  });

  it('the hint: the way said, nothing shown; then the story written as an example, the number after the first action, and the things of the third picture one by one as it goes on to the answer; then the answer lit', async () => {
    const { spec, heard, scenes } = open(true, [7, 6, 4]);
    await miss(spec.body.answer);
    expect(heard.hints).toEqual(['h1_chain']);
    expect([heard.numbers, shownNumber(), all(stage(), '.example, .hit, .done')]).toEqual([[], [], []]);

    await miss(spec.body.answer);
    expect(heard.hints).toEqual(['h1_chain', 'h2_chain']);
    expect(all(stage(), '.example .sign').map(text)).toEqual(['7', '+', '6', '−', '4']);
    expect(heard.numbers).toEqual([13, 12, 11, 10, 9]);
    expect(shownNumber()).toEqual(['9']);
    expect(scenes.map((x) => x.classList.contains('done'))).toEqual([true, true, false]);
    expect(all(scenes[2], '.it.hit')).toHaveLength(4);
    expect(all(document.body, '.pulse')).toEqual([]);
    // the example stands on a row of its own, after the pictures
    expect([...stage().children].slice(-2).map((e) => e.className)).toEqual(['brk', 'group example']);

    await miss(spec.body.answer);
    expect(heard.hints).toEqual(['h1_chain', 'h2_chain', 'h3_show']);
    expect(all(document.body, '.pulse').map((b) => Number(text(b)))).toEqual([9]);
    expect(all(stage(), '.example')).toHaveLength(1);
  });

  it('some went away first: the example reads "−" then "+", and the number goes up with the ones that came', async () => {
    const { spec, heard } = open(false, [15, 7, 4]);
    await miss(spec.body.answer); await miss(spec.body.answer);
    expect(all(stage(), '.example .sign').map(text)).toEqual(['15', '−', '7', '+', '4']);
    expect(heard.numbers).toEqual([8, 9, 10, 11, 12]);
    expect(shownNumber()).toEqual(['12']);
  });
});
