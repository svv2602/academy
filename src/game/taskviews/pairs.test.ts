// @vitest-environment happy-dom
/**
 * The panel show of "pairs" (moved from `src/game/tasks.test.ts`): extra openings make the result shaky, never "wrong";
 * the opening peek shows every face and takes no taps; closing during the peek leaves nothing behind.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave } from '../../core/save';
import { levelFor, recordTask } from '../skills';
import { mulberry32 } from '../../core/util';
import type { Key } from '../../ui/strings';
import type { Spoken } from '../../core/audio';
import { PAIRS_PEEK_MS } from '../tasks/pairs';
import { SKILL, cheatTask, runTask, type TaskHooks, type TaskResult } from './panel';

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

/** Hooks that only remember what the game asked the cat to say. */
function listen() {
  const heard = { prompts: [] as Key[], hints: [] as Key[], wrong: 0, good: 0 };
  const hooks: TaskHooks = {
    prompt: (key) => { heard.prompts.push(key); }, number: () => {},
    wrong: () => { heard.wrong++; return spoken(); },
    hint: (key) => { heard.hints.push(key); return spoken(); },
    good: () => { heard.good++; },
  };
  return { hooks, heard };
}

const PAIRS = [0, 3, 4, 6];

describe('pairs: extra openings make the result shaky, never "wrong"', () => {
  /** Opens `misses` non-matching pairs of cards, then finds every pair. Returns what the task reported. */
  async function playPairs(level: number, misses: number, hooks: TaskHooks, whileShown?: (cards: HTMLElement[]) => void): Promise<TaskResult> {
    const done = runTask('pairs', level, hooks);
    const cards = all(stage(), '.mcard');
    await vi.advanceTimersByTimeAsync(PAIRS_PEEK_MS[level]);   // the opening peek is over: the game starts
    for (let k = 0; k < misses; k++) {
      const first = cards[k % cards.length], second = cards.find((c) => text(c) !== text(first))!;
      tap(first); tap(second);
      expect(first.classList.contains('open') && second.classList.contains('open')).toBe(true);
      whileShown?.(cards);
      await vi.advanceTimersByTimeAsync(800);
      expect(all(stage(), '.mcard.open')).toHaveLength(0);
    }
    for (const face of new Set(cards.map(text))) cards.filter((c) => text(c) === face).forEach(tap);
    expect(all(stage(), '.mcard.done')).toHaveLength(cards.length);
    await vi.advanceTimersByTimeAsync(1100);
    return done;
  }
  beforeEach(() => { Math.random = mulberry32(2026); });

  it.each([
    [3, 6, 0, 0], [3, 6, 6, 0], [3, 6, 7, 1], [3, 6, 20, 1],
    [2, 4, 4, 0], [2, 4, 5, 1],
    [1, 3, 0, 0], [1, 3, 3, 0], [1, 3, 4, 1],
  ])('level %i (%i pairs), %i extra openings: wrong is %i', async (level, pairs, misses, wrong) => {
    const result = await playPairs(level, misses, listen().hooks);
    expect(all(stage(), '.mcard')).toHaveLength(pairs * 2);
    expect(result).toEqual({ solved: true, wrong });
  });

  it('a non-matching pair is not an error: no "try again", no hint, no shake', async () => {
    const { hooks, heard } = listen();
    const result = await playPairs(3, 20, hooks, () => {
      vi.advanceTimersByTime(799);                 // nothing happens while the two cards are shown
      expect(all(root(), '.no, .pulse')).toHaveLength(0);
    });
    await vi.advanceTimersByTimeAsync(5000);       // long enough for any delayed hint
    expect(result.wrong).toBe(1);
    expect(heard.wrong).toBe(0);
    expect(heard.hints).toEqual([]);
    expect(heard.prompts).toEqual(['t_pairs']);
    expect(all(root(), '.no, .pulse')).toHaveLength(0);
  });

  it('taps that open nothing are not counted', async () => {
    // Level 1 allows three extra openings. Tapping an open card or a locked board must not use them up.
    const result = await playPairs(1, 3, listen().hooks, (cards) => {
      const open = all(stage(), '.mcard.open');
      open.forEach(tap);
      cards.filter((c) => !open.includes(c)).forEach(tap);
      expect(all(stage(), '.mcard.open')).toHaveLength(2);
    });
    expect(result).toEqual({ solved: true, wrong: 0 });
  });

  /** The same calls main.ts makes around a panel task, on a real save. */
  async function playAndRecord(save: ReturnType<typeof defaultSave>, misses: number) {
    const skill = SKILL.pairs;
    const result = await playPairs(levelFor(save, skill), misses, listen().hooks);
    recordTask(save, skill, result.wrong);
    document.body.innerHTML = MARKUP;
  }

  it('6 pairs with 20 extra openings, twice in a row: the level does not go up', async () => {
    const save = defaultSave();
    save.fixed.memory = 3;                         // the parent fixed the hardest games: six pairs at skill level 1
    await playAndRecord(save, 20);
    expect(save.skills.memory.level).toBe(1);
    await playAndRecord(save, 20);
    expect(save.skills.memory).toMatchObject({ level: 1, tasks: 2, first: 0 });
  });

  it('6 pairs with no extra openings, twice in a row: the level goes up', async () => {
    const save = defaultSave();
    save.fixed.memory = 3;
    save.skills.memory.settled = true;             // the fast climb is over: two clean solves in a row for a level (LEARN-15)
    await playAndRecord(save, 0);
    await playAndRecord(save, 0);
    expect(save.skills.memory).toMatchObject({ level: 2, tasks: 2, first: 2 });
  });

  it('6 pairs with no extra openings in a new game: the level goes up each time (the fast climb)', async () => {
    const save = defaultSave();
    save.fixed.memory = 3;
    await playAndRecord(save, 0);
    await playAndRecord(save, 0);
    expect(save.skills.memory).toMatchObject({ level: 3, tasks: 2, first: 2 });
  });

  it('adaptive difficulty: brute-forced pairs never count as a clean solve', async () => {
    const save = defaultSave();                    // level 1: three pairs
    await playAndRecord(save, 0);
    expect(save.skills.memory.level).toBe(2);      // a new game: the fast climb, a clean solve is a level
    await playAndRecord(save, 20);                 // not a clean solve: no level for it
    expect(save.skills.memory).toMatchObject({ level: 2, tasks: 2, first: 1 });
    await playAndRecord(save, 3);                  // within the allowance: clean
    expect(save.skills.memory).toMatchObject({ level: 3, tasks: 3, first: 2 });
  });

  it('adaptive difficulty after the fast climb: brute-forced pairs break the run of two instead of completing it', async () => {
    const save = defaultSave();                    // level 1: three pairs
    save.skills.memory.settled = true;
    await playAndRecord(save, 0);
    await playAndRecord(save, 20);
    expect(save.skills.memory.level).toBe(1);
    await playAndRecord(save, 3);
    await playAndRecord(save, 3);
    expect(save.skills.memory.level).toBe(2);
  });
});

// What a child sees without the voice and without reading (VOICE-09): the opening peek of "pairs".
describe('pairs: shown without the voice', () => {
  it('pairs: the peek is longest on the first level and shortest on the third', () => {
    expect(PAIRS_PEEK_MS[1]).toBeGreaterThan(PAIRS_PEEK_MS[2]);
    expect(PAIRS_PEEK_MS[2]).toBeGreaterThan(PAIRS_PEEK_MS[3]);
    expect(PAIRS_PEEK_MS[3]).toBeGreaterThanOrEqual(1500);         // long enough to see the faces at all
  });

  it.each([1, 2, 3])('pairs, level %i: every face is shown at the start, taps meanwhile do nothing, then the game is as before', async (level) => {
    Math.random = mulberry32(34_000 + level);
    const { hooks, heard } = listen();
    const done = runTask('pairs', level, hooks);
    const cards = all(stage(), '.mcard'), peek = PAIRS_PEEK_MS[level];
    expect(stage().classList.contains('peek')).toBe(true);
    for (let k = 0; k < 3; k++) cards.forEach(tap);                // a pair among them, a miss among them: none counts
    await vi.advanceTimersByTimeAsync(peek - 1);
    expect(stage().classList.contains('peek')).toBe(true);
    expect(all(stage(), '.mcard.open, .mcard.done')).toEqual([]);
    expect(heard.good).toBe(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(stage().classList.contains('peek')).toBe(false);        // face down now
    expect(all(stage(), '.mcard.open')).toEqual([]);
    // As before: a miss opens two cards for a moment, a pair stays open.
    const first = cards[0], other = cards.find((c) => text(c) !== text(first))!;
    tap(first); tap(other);
    expect(all(stage(), '.mcard.open')).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(800);
    expect(all(stage(), '.mcard.open')).toEqual([]);
    for (const face of new Set(cards.map(text))) cards.filter((c) => text(c) === face).forEach(tap);
    await vi.advanceTimersByTimeAsync(1100);
    expect(await done).toEqual({ solved: true, wrong: 0 });
    expect(heard.good).toBe(PAIRS[level] + 1);
  });

  it('pairs: the test hook solves the task during the peek as well', async () => {
    Math.random = mulberry32(34_100);
    const done = runTask('pairs', 3, listen().hooks);
    await vi.advanceTimersByTimeAsync(PAIRS_PEEK_MS[3] / 2);
    expect(cheatTask()).toBe(true);
    expect(all(stage(), '.mcard.done')).toHaveLength(PAIRS[3] * 2);
    await vi.advanceTimersByTimeAsync(PAIRS_PEEK_MS[3]);
    expect(await done).toEqual({ solved: true, wrong: 0 });
    expect(all(stage(), '.mcard.open.done')).toHaveLength(PAIRS[3] * 2);   // the end of the peek turns no found card down
  });

  it('pairs: closing the task during the peek leaves nothing to catch up', async () => {
    Math.random = mulberry32(34_200);
    const done = runTask('pairs', 1, listen().hooks);
    document.getElementById('taskClose')!.click();
    expect(await done).toEqual({ solved: false, wrong: 0 });
    await vi.advanceTimersByTimeAsync(1000);                         // the old peek would end in the middle of the new one
    Math.random = mulberry32(34_201);
    void runTask('pairs', 1, listen().hooks);                       // the next pairs task has a peek of its own
    await vi.advanceTimersByTimeAsync(PAIRS_PEEK_MS[1] - 1);
    expect(stage().classList.contains('peek')).toBe(true);          // the old timer did not end it early
  });
});
