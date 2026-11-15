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
    const groups = all(stage(), '.group.pickable'), sizes = groups.map((g) => all(g, '.it').length);
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
  });

  it.each([1, 2, 3])('compare, level %i: after the first mistake the right group grows for "more" and shrinks for "less"', async (level) => {
    const asked = new Set<boolean>();
    for (let i = 0; i < 20; i++) {
      const { done, groups, right, more } = compareTask(level, 33_000 + level * 100 + i);
      asked.add(more);
      tap(groups[1 - right]);
      await vi.advanceTimersByTimeAsync(899);
      expect(all(root(), '.grow, .shrink')).toEqual([]);
      await afterMistake();
      expect(all(root(), '.group > em')).toHaveLength(2);           // together with the numbers over the groups
      expect(all(root(), more ? '.grow' : '.shrink')).toEqual([groups[right]]);
      expect(all(root(), more ? '.shrink' : '.grow')).toEqual([]);
      tap(groups[right]);
      await vi.advanceTimersByTimeAsync(1100);
      expect(await done).toEqual({ solved: true, wrong: 1 });
      vi.clearAllTimers();
    }
    expect(asked).toEqual(new Set(level === 1 ? [true] : [true, false]));
  });
});
