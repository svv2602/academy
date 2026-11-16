// @vitest-environment happy-dom
/**
 * The panel show of "odd" without the voice (VOICE-09; moved from `src/game/tasks.test.ts`): after the first mistake the
 * alike things share one frame, the odd one has none; the second mistake lights the answer.
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
const text = (e: HTMLElement) => e.textContent ?? '';

/** Hooks that only remember the hints the game asked the cat to say. */
function listen() {
  const heard = { hints: [] as Key[] };
  const hooks: TaskHooks = {
    prompt: () => {}, number: () => {}, good: () => {},
    wrong: () => spoken(), hint: (key) => { heard.hints.push(key); return spoken(); },
  };
  return { hooks, heard };
}

// The test's own idea of what belongs together: an odd-one-out must come from another group.
const GROUPS = ['🍎🍐🍊🍋🍓🍇', '🐱🐶🐰🦊🐻🐼', '🌸🌼🌷🌻🌹💐', '🚗🚌🚲🚀⛵🚂', '🍰🍭🍩🍪🍫🧁'];
const groupOf = (s: string) => GROUPS.findIndex((g) => g.includes(s));

describe('odd: shown without the voice', () => {
  /** The first mistake has run its course: the shake, "try again" and the hint, all heard to the end at once. */
  const afterMistake = () => vi.advanceTimersByTimeAsync(1000);

  it.each([1, 2, 3])('odd, level %i: the first mistake frames nothing, the second frames the alike things together, the third lights the odd one', async (level) => {
    for (let i = 0; i < 20; i++) {
      Math.random = mulberry32(31_000 + level * 100 + i);
      document.body.innerHTML = MARKUP;
      const { hooks, heard } = listen();
      const done = runTask('odd', level, hooks);
      const things = all(stage(), '.it.big'), sizes = new Map<number, number>();
      for (const t of things) sizes.set(groupOf(text(t)), (sizes.get(groupOf(text(t))) ?? 0) + 1);
      const odd = things.find((t) => sizes.get(groupOf(text(t))) === 1)!, alike = things.filter((t) => t !== odd);
      const framed = () => things.filter((t) => t.classList.contains('alike'));
      expect(framed()).toEqual([]);                                  // nothing is given away before a mistake
      tap(alike[0]);
      await vi.advanceTimersByTimeAsync(899);
      expect(framed()).toEqual([]);                                  // the shake and the lines come first
      await afterMistake();
      expect(heard.hints).toEqual(['h_odd']);                        // rung 1: the way, said only
      expect(framed()).toEqual([]);
      expect(all(root(), '.pulse')).toEqual([]);
      tap(alike[1]);
      await afterMistake();
      expect(heard.hints).toEqual(['h_odd', 'h2_odd']);
      expect(framed()).toEqual(alike);                               // one frame for all the alike ones ...
      expect(odd.classList.contains('alike')).toBe(false);           // ... and none for the odd one
      expect(all(root(), '.pulse')).toEqual([]);
      tap(alike[2]);                                                 // the third mistake lights the answer
      await afterMistake();
      expect(heard.hints).toEqual(['h_odd', 'h2_odd', 'h3_show']);
      expect(all(root(), '.pulse')).toEqual([odd]);
      expect(framed()).toEqual(alike);
      tap(odd);
      await vi.advanceTimersByTimeAsync(1100);
      expect(await done).toEqual({ solved: true, wrong: 3 });
      vi.clearAllTimers();
    }
  });
});
