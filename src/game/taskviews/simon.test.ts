// @vitest-environment happy-dom
/**
 * The panel show of "simon" (moved from `src/game/tasks.test.ts`): a task closed during the show says nothing after it
 * and leaves the stage of the next task alone.
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

const stage = () => document.getElementById('taskStage')!;

/** Hooks that only remember the questions the game asked the cat to say, and the chimes. */
function listen() {
  const heard = { prompts: [] as Key[], good: 0 };
  const hooks: TaskHooks = {
    prompt: (key) => { heard.prompts.push(key); }, number: () => {}, good: () => { heard.good++; },
    wrong: () => spoken(), hint: () => spoken(),
  };
  return { hooks, heard };
}

describe('simon: a task closed during the show says nothing after it', () => {
  const SHOW_MS = 600 + 800 * 3;                                   // the opening show of a level 1 simon
  const LAST_FLASH = 600 + 800 * 2 + 100;                          // inside the last of its three flashes
  const repeats = (prompts: Key[]) => prompts.filter((k) => k === 't_simon_repeat').length;

  it('left open, the show ends with exactly one "repeat after me" (the test sees the call)', async () => {
    Math.random = mulberry32(51_100);
    const { hooks, heard } = listen();
    void runTask('simon', 1, hooks);
    await vi.advanceTimersByTimeAsync(SHOW_MS + 5000);
    expect(repeats(heard.prompts)).toBe(1);
    expect(stage().classList.contains('watch')).toBe(false);
  });

  it('closed during the last flash: no "repeat after me", and the next task\'s stage is left alone', async () => {
    Math.random = mulberry32(51_101);
    const { hooks, heard } = listen();
    const done = runTask('simon', 1, hooks);
    await vi.advanceTimersByTimeAsync(LAST_FLASH);
    expect(heard.good).toBe(3);                                    // the last flash is on
    document.getElementById('taskClose')!.click();
    expect(await done).toEqual({ solved: false, wrong: 0 });
    Math.random = mulberry32(51_102);
    const next = listen();
    void runTask('simon', 1, next.hooks);                          // a new show starts on the same stage
    await vi.advanceTimersByTimeAsync(SHOW_MS - LAST_FLASH);       // the old show would end here
    expect(repeats(heard.prompts)).toBe(0);
    expect(repeats(next.heard.prompts)).toBe(0);
    expect(stage().classList.contains('watch')).toBe(true);        // the new show is still on
    await vi.advanceTimersByTimeAsync(5000);
    expect(repeats(heard.prompts)).toBe(0);
  });

  it('closed at any moment of the show: the closed task never says "repeat after me"', async () => {
    for (let at = 0; at < SHOW_MS; at += 100) {
      Math.random = mulberry32(51_200 + at);
      const { hooks, heard } = listen();
      const done = runTask('simon', 1, hooks);
      await vi.advanceTimersByTimeAsync(at);
      document.getElementById('taskClose')!.click();
      await done;
      await vi.advanceTimersByTimeAsync(SHOW_MS + 1000);
      expect(repeats(heard.prompts), `closed at ${at} ms`).toBe(0);
    }
  });
});
