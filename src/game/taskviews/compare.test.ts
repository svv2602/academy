// @vitest-environment happy-dom
/**
 * The panel show of "compare" without the voice (VOICE-09; moved from `src/game/tasks.test.ts`): the question is marked
 * from the start the same way whichever group is right; after a mistake the right group grows or shrinks.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/util';
import type { Key } from '../../ui/strings';
import type { Spoken } from '../../core/audio';
import { runTask, type TaskHooks } from './panel';

const spoken = () => Promise.resolve() as Spoken;
const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const realRandom = Math.random;

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); Math.random = realRandom; document.body.innerHTML = ''; });

const root = () => document.getElementById('task')!;
const stage = () => document.getElementById('taskStage')!;
const all = (parent: HTMLElement, selector: string) => [...parent.querySelectorAll<HTMLElement>(selector)];
const tap = (e: HTMLElement) => { e.dispatchEvent(new PointerEvent('pointerdown')); };

/** Hooks that only remember the questions the game asked the cat to say. */
function listen() {
  const heard = { prompts: [] as Key[] };
  const hooks: TaskHooks = {
    prompt: (key) => { heard.prompts.push(key); }, number: () => {}, good: () => {},
    wrong: () => spoken(), hint: () => spoken(),
  };
  return { hooks, heard };
}

describe('compare: shown without the voice', () => {
  /** The first mistake has run its course: the shake, "try again" and the hint, all heard to the end at once. */
  const afterMistake = () => vi.advanceTimersByTimeAsync(1000);

  /** A compare task of `level` from `seed`: its question, the group that answers it and the mark of the question. */
  function compareTask(level: number, seed: number) {
    Math.random = mulberry32(seed);
    document.body.innerHTML = MARKUP;
    const { hooks, heard } = listen();
    const done = runTask('compare', level, hooks);
    // A group of things is as big as its things; from level 4 a group is its number in digits.
    const groups = all(stage(), '.group.pickable'), sizes = groups.map((g) => (g.querySelector('.n') ? Number(g.querySelector('.n')!.textContent) : all(g, '.it').length));
    const more = heard.prompts[0] === 't_compare_more';
    const right = sizes.indexOf(more ? Math.max(...sizes) : Math.min(...sizes));
    return { done, heard, groups, right, more, marks: all(stage(), '.ask') };
  }

  it('compare: the question is marked from the start, and the mark is the same whichever group is right', () => {
    const looks = new Map<boolean, Set<string>>(), rights = new Map<boolean, Set<number>>();
    for (const level of [1, 2, 3]) for (let i = 0; i < 300; i++) {
      const { groups, right, more, marks } = compareTask(level, 32_000 + level * 1000 + i);
      if (level === 1) expect(more).toBe(true);                     // the first level always asks "more"
      expect(marks).toHaveLength(1);
      const [mark] = marks;
      // Between the two groups, never inside one, not a button: it only tells what is asked.
      expect([...stage().children].indexOf(mark)).toBe(1);
      expect(groups.some((g) => g.contains(mark)) || mark.matches('button')).toBe(false);
      expect(mark.classList.contains(more ? 'more' : 'less')).toBe(true);
      looks.set(more, (looks.get(more) ?? new Set()).add(mark.outerHTML));
      rights.set(more, (rights.get(more) ?? new Set()).add(right));
      expect(all(root(), '.grow, .shrink, .pulse, .group > em')).toEqual([]);
      vi.clearAllTimers();
    }
    for (const more of [true, false]) {
      expect(rights.get(more)).toEqual(new Set([0, 1]));             // both groups were right for this question ...
      expect(looks.get(more)!.size).toBe(1);                         // ... and the mark looked the same every time
    }
    expect([...looks.get(true)!][0]).not.toBe([...looks.get(false)!][0]);
  }, 20_000);   // 900 shows: about 2 s alone, past the default 5 s on a loaded machine (seen under parallel runs)

  it.each([1, 2, 3])('compare, level %i: the first mistake shows nothing, the second the numbers, the third makes the right group grow for "more" and shrink for "less"', async (level) => {
    const asked = new Set<boolean>();
    for (let i = 0; i < 20; i++) {
      const { done, groups, right, more } = compareTask(level, 33_000 + level * 100 + i);
      asked.add(more);
      tap(groups[1 - right]);
      await vi.advanceTimersByTimeAsync(899);
      expect(all(root(), '.grow, .shrink')).toEqual([]);
      await afterMistake();
      expect(all(root(), '.grow, .shrink, .pulse, .group > em')).toEqual([]);   // rung 1: the way is said, nothing shown
      tap(groups[1 - right]);
      await afterMistake();
      expect(all(root(), '.group > em')).toHaveLength(2);           // rung 2: the numbers over the groups ...
      expect(all(root(), '.grow, .shrink, .pulse')).toEqual([]);    // ... and the right group does nothing yet
      tap(groups[1 - right]);
      await afterMistake();
      expect(all(root(), more ? '.grow' : '.shrink')).toEqual([groups[right]]);
      expect(all(root(), more ? '.shrink' : '.grow')).toEqual([]);
      expect(all(root(), '.pulse')).toEqual([groups[right]]);
      expect(all(root(), '.group > em')).toHaveLength(2);           // what rung 2 showed stays
      tap(groups[right]);
      await vi.advanceTimersByTimeAsync(1100);
      expect(await done).toEqual({ solved: true, wrong: 3 });
      vi.clearAllTimers();
    }
    expect(asked).toEqual(new Set(level === 1 ? [true] : [true, false]));
  });

  it.each([1, 2, 3])('compare, level %i: the groups are things, never digits', (level) => {
    for (let i = 0; i < 30; i++) {
      const { groups } = compareTask(level, 34_000 + level * 100 + i);
      for (const g of groups) { expect(g.classList.contains('digits')).toBe(false); expect(g.querySelector('.n')).toBeNull(); expect(all(g, '.it').length).toBeGreaterThan(0); }
      vi.clearAllTimers();
    }
  });

  it.each([4, 5])('compare, level %i: two different numbers up to 20 in digits, without things, the mark between them', (level) => {
    const asked = new Set<boolean>();
    let big = 0;
    for (let i = 0; i < 200; i++) {
      const { groups, more, marks } = compareTask(level, 35_000 + level * 1000 + i);
      asked.add(more);
      expect(groups).toHaveLength(2);
      expect(all(stage(), '.it'), 'no things are drawn for numbers in digits').toEqual([]);
      const nums = groups.map((g) => {
        expect(g.classList.contains('digits')).toBe(true);
        expect(g.children).toHaveLength(1);
        expect(g.firstElementChild!.matches('b.n')).toBe(true);
        return g.querySelector('.n')!.textContent!;
      });
      expect(nums.every((t) => /^(?:[1-9]|1\d|20)$/.test(t)), nums.join(' ')).toBe(true);
      expect(nums[0]).not.toBe(nums[1]);
      if (nums.some((t) => t.length === 2)) big++;
      expect(marks).toHaveLength(1);
      expect([...stage().children].indexOf(marks[0])).toBe(1);
      expect(all(root(), '.grow, .shrink, .pulse, .dots, .group > em')).toEqual([]);
      vi.clearAllTimers();
    }
    expect(asked).toEqual(new Set([true, false]));
    expect(big).toBeGreaterThan(100);
  });

  it.each([4, 5])('compare, level %i: the second mistake shows each number as dots, the third makes the right number grow or shrink', async (level) => {
    for (let i = 0; i < 20; i++) {
      const { done, groups, right, more } = compareTask(level, 36_000 + level * 100 + i);
      const nums = groups.map((g) => Number(g.querySelector('.n')!.textContent));
      tap(groups[1 - right]);
      await vi.advanceTimersByTimeAsync(899);
      expect(all(root(), '.grow, .shrink, .dots')).toEqual([]);
      await afterMistake();
      expect(all(root(), '.grow, .shrink, .dots, .pulse')).toEqual([]);         // rung 1: said only
      tap(groups[1 - right]);
      await afterMistake();
      // "Count here and here": the dots of each group, as many as its number, under its digits; no badge over it.
      expect(groups.map((g) => g.querySelectorAll(':scope > .dots > span').length)).toEqual(nums);
      expect(groups.map((g) => g.lastElementChild!.matches('.dots'))).toEqual([true, true]);
      expect(all(root(), '.group > em')).toEqual([]);
      expect(all(root(), '.grow, .shrink, .pulse')).toEqual([]);
      tap(groups[1 - right]);                                        // a third mistake: the dots are not doubled
      await afterMistake();
      expect(groups.map((g) => g.querySelectorAll('.dots').length)).toEqual([1, 1]);
      expect(all(root(), more ? '.grow' : '.shrink')).toEqual([groups[right]]);
      expect(all(root(), more ? '.shrink' : '.grow')).toEqual([]);
      tap(groups[right]);
      await vi.advanceTimersByTimeAsync(1100);
      expect(await done).toEqual({ solved: true, wrong: 3 });
      vi.clearAllTimers();
    }
  });
});
