// @vitest-environment happy-dom
/**
 * The order after a mistake on the panel (moved from `src/game/tasks.test.ts`): "try again" to its end, then the whole
 * spoken hint, then the solution is shown; the child may answer at any moment, and nothing catches up after a close.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/util';
import type { Key } from '../../ui/strings';
import type { Spoken } from '../../core/audio';
import type { TaskType } from '../tasks/types';
import { SKILL, cheatTask, runTask, type TaskHooks } from './panel';

/** A test stands in for the voice: only here a plain promise may pose as a spoken line. */
const spoken = (end: Promise<void> = Promise.resolve()) => end as Spoken;

const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const realRandom = Math.random;

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); Math.random = realRandom; document.body.innerHTML = ''; });

const root = () => document.getElementById('task')!;
const stage = () => document.getElementById('taskStage')!;
const opts = () => document.getElementById('taskOpts')!;
const all = (parent: HTMLElement, selector: string) => [...parent.querySelectorAll<HTMLElement>(selector)];
const tap = (e: HTMLElement) => { e.dispatchEvent(new PointerEvent('pointerdown')); };
const text = (e: HTMLElement) => e.textContent ?? '';

/** Hooks that only count the "try again" the game asked the cat to say. */
function listen() {
  const heard = { wrong: 0 };
  const hooks: TaskHooks = {
    prompt: () => {}, number: () => {}, good: () => {},
    wrong: () => { heard.wrong++; return spoken(); }, hint: () => spoken(),
  };
  return { hooks, heard };
}

function must(ok: boolean, what: string): asserts ok { if (!ok) throw new Error(what); }
/** The ten types in the order the seeds of `open()` were picked for (the old order of the panel tests). */
const TYPES = Object.keys(SKILL) as TaskType[];

describe('after a mistake: "try again", then the whole hint, then the solution', () => {
  type Hinted = Exclude<TaskType, 'pairs'>;
  const HINT: Record<Hinted, Key> = {
    count: 'h_count', add: 'h_count', sub: 'h_left', compare: 'h_compare', pattern: 'h_pattern',
    odd: 'h_odd', order: 'h_order', sort: 'h_sort', simon: 'h_simon',
  };
  /** Everything a child can answer with. */
  const CHOICES: Record<Hinted, string> = {
    count: '#taskOpts .opt', add: '#taskOpts .opt', sub: '#taskOpts .opt', pattern: '#taskOpts .opt',
    compare: '#taskStage .group.pickable', odd: '#taskStage .it.big', order: '#taskStage .opt.num',
    sort: '#taskOpts .basket', simon: '#taskStage .pad',
  };
  const HINTED = Object.keys(HINT) as Hinted[];
  const COUNTING: Hinted[] = ['count', 'add', 'sub'];        // the solution is counted aloud
  const SHOW_MS = 600 + 800 * 3;                             // the opening show of a level 1 simon
  const LONG = 20_000;                                       // longer than any pause in the game

  /**
   * A cat whose lines end only when the test says so. Like the real voice (core/audio.ts), a new line cuts the
   * previous one off, and a line that is cut off settles at once: a settled promise is not "heard to the end".
   * `muted` is the voice that cannot be heard: every line ends the moment it starts.
   */
  function talk(muted = false) {
    const said: string[] = [];
    let end: (() => void) | null = null;
    const line = (what: string) => {
      end?.(); said.push(what);
      if (muted) return spoken();
      return spoken(new Promise<void>((resolve) => { end = () => { end = null; resolve(); }; }));
    };
    const hooks: TaskHooks = {
      prompt: (key) => { void line(key); },
      number: (n) => { void line(`#${n}`); },
      wrong: () => line('try'),
      hint: (key) => line(key),
      good: () => {},
    };
    return {
      hooks, said,
      talking: () => end !== null,
      /** The line that is playing reaches its end. */
      hearOut: async () => { must(end !== null, 'the cat is silent, there is no line to hear out'); end(); await vi.advanceTimersByTimeAsync(0); },
      tries: () => said.filter((x) => x === 'try').length,
      hints: () => said.filter((x) => x.startsWith('h_')),
      numbers: () => said.filter((x) => x.startsWith('#')).map((x) => Number(x.slice(1))),
    };
  }

  /** What a hint reveals: numbers on the things, numbers under the groups, the repeating unit, a pulsing answer, the replayed show. */
  const revealed = () => all(root(), '.it > i, .group > em, .pulse').length > 0
    || stage().classList.contains('units') || stage().classList.contains('watch');
  const pulsing = () => all(root(), '.pulse');
  /** The task as it stands, without the marks of a tap that fade by themselves. */
  const screen = () => (stage().outerHTML + opts().innerHTML).replace(/ (flash|no)(?=[ "])/g, '');

  /** Index of a choice the game rejects as the first move, found on throwaway copies of the same seeded task. */
  async function rejected(type: Hinted, seed: number) {
    for (let i = 0; ; i++) {
      Math.random = mulberry32(seed);
      document.body.innerHTML = MARKUP;
      const { hooks, heard } = listen();
      void runTask(type, 1, hooks);
      if (type === 'simon') await vi.advanceTimersByTimeAsync(SHOW_MS);
      const choice = all(root(), CHOICES[type])[i];
      must(!!choice, `${type}: every choice is accepted, there is nothing to get wrong`);
      tap(choice);
      vi.clearAllTimers();
      if (heard.wrong) return i;
    }
  }

  /** A level 1 task on screen, ready for an answer, with a wrong answer at hand. `fits` picks a task that suits the test. */
  async function open(type: Hinted, muted = false, fits = () => true) {
    let seed = 7000 + TYPES.indexOf(type) * 100;
    for (; ; seed++) {
      Math.random = mulberry32(seed);
      document.body.innerHTML = MARKUP;
      void runTask(type, 1, listen().hooks);
      const ok = fits();
      vi.clearAllTimers();
      if (ok) break;
    }
    const bad = await rejected(type, seed);
    Math.random = mulberry32(seed);
    document.body.innerHTML = MARKUP;
    const cat = talk(muted);
    const done = runTask(type, 1, cat.hooks);
    if (type === 'simon') await vi.advanceTimersByTimeAsync(SHOW_MS);
    expect(revealed()).toBe(false);
    const tapWrong = () => tap(all(root(), CHOICES[type])[bad]);
    /** A wrong answer, and a second later "try again" is still being said: the pause for the shake is over by then. */
    const miss = async () => { tapWrong(); await vi.advanceTimersByTimeAsync(1000); };
    const solve = async () => { must(cheatTask(), 'there is no task on screen'); await vi.advanceTimersByTimeAsync(0); };
    return { cat, done, tapWrong, miss, solve };
  }

  /** Things the count goes over, in order: all of them, or the ones that are left. */
  const counted = () => all(stage(), '.it:not(.gone)');
  /** The count runs to its end exactly once: 1..n aloud, one number on each thing. */
  async function expectOneCount(numbers: () => number[], from: number) {
    const n = counted().length;
    await vi.advanceTimersByTimeAsync(LONG);
    expect(numbers().slice(from)).toEqual(Array.from({ length: n }, (_, i) => i + 1));
    expect(counted().map((e) => all(e, 'i').map(text).join(','))).toEqual(Array.from({ length: n }, (_, i) => String(i + 1)));
  }

  describe.each(HINTED)('%s', (type) => {
    it('nothing starts before the previous line has ended', async () => {
      const { cat, miss } = await open(type);
      await miss();
      expect(cat.said.at(-1)).toBe('try');
      await vi.advanceTimersByTimeAsync(LONG);       // however long "try again" takes, the hint waits for its end
      expect(cat.hints()).toEqual([]);
      expect(revealed()).toBe(false);

      await cat.hearOut();
      expect(cat.said.at(-1)).toBe(HINT[type]);
      await vi.advanceTimersByTimeAsync(LONG);       // and the solution waits for the end of the hint
      expect(cat.hints()).toEqual([HINT[type]]);
      expect(cat.numbers()).toEqual([]);
      expect(revealed()).toBe(false);

      await cat.hearOut();
      expect(cat.hints()).toEqual([HINT[type]]);
      expect(pulsing()).toHaveLength(type === 'order' || type === 'sort' ? 1 : 0);   // elsewhere the answer is lit after the second mistake
      if (type !== 'odd') expect(revealed()).toBe(true);
      if (COUNTING.includes(type)) { expect(cat.numbers()).toEqual([1]); await expectOneCount(cat.numbers, 0); }
      expect(cat.tries()).toBe(1);
    });

    it('a muted voice keeps the order, and the shake is still seen before the hint', async () => {
      const { cat, tapWrong } = await open(type, true);
      const before = cat.said.length;
      tapWrong();
      await vi.advanceTimersByTimeAsync(899);
      expect(cat.said.slice(before)).toEqual(['try']);
      expect(revealed()).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(cat.said.slice(before, before + 2)).toEqual(['try', HINT[type]]);
      if (type !== 'odd') expect(revealed()).toBe(true);
      if (COUNTING.includes(type)) expect(cat.said.slice(before)).toEqual(['try', HINT[type], '#1']);
    });

    it.each([1, 2])('the right answer during the hint of mistake %i wins at once, and nothing is shown afterwards', async (mistakes) => {
      const { cat, done, miss, solve } = await open(type);
      for (let k = 1; k < mistakes; k++) { await miss(); await cat.hearOut(); await cat.hearOut(); await vi.advanceTimersByTimeAsync(LONG); }
      await miss();
      await cat.hearOut();
      expect(cat.said.at(-1)).toBe(HINT[type]);
      const hints = cat.hints().length, numbers = cat.numbers().length;
      await solve();                                 // the answer is not held back while the cat is talking
      expect(root().classList.contains('won')).toBe(true);
      const won = screen();
      if (cat.talking()) await cat.hearOut();
      await vi.advanceTimersByTimeAsync(1000);
      expect(screen()).toBe(won);
      await vi.advanceTimersByTimeAsync(LONG);
      expect(await done).toEqual({ solved: true, wrong: mistakes });
      expect(cat.hints()).toHaveLength(hints);
      if (COUNTING.includes(type)) expect(cat.numbers()).toHaveLength(numbers);
      expect(cat.tries()).toBe(mistakes);
    });

    it('the right answer during "try again" wins at once, and the hint is never said', async () => {
      const { cat, done, miss, solve } = await open(type);
      await miss();
      await solve();
      expect(root().classList.contains('won')).toBe(true);
      if (cat.talking()) await cat.hearOut();
      await vi.advanceTimersByTimeAsync(LONG);
      expect(await done).toEqual({ solved: true, wrong: 1 });
      expect(cat.hints()).toEqual([]);
      expect(revealed()).toBe(false);
    });

    it('closing the task during the hint: nothing catches up later', async () => {
      const { cat, done, miss } = await open(type);
      await miss();
      await cat.hearOut();
      expect(cat.said.at(-1)).toBe(HINT[type]);
      document.getElementById('taskClose')!.click();
      expect(await done).toEqual({ solved: false, wrong: 1 });
      const said = cat.said.length;
      await cat.hearOut();
      await vi.advanceTimersByTimeAsync(LONG);
      expect(cat.said).toHaveLength(said);
      expect(revealed()).toBe(false);
      expect(root().classList.contains('hidden')).toBe(true);
    });

    it('a second mistake during the hint: one hint at a time, then the right answer is lit', async () => {
      const { cat, miss } = await open(type);
      await miss();
      await cat.hearOut();
      expect(cat.hints()).toEqual([HINT[type]]);
      await miss();                                  // "try again" cuts the hint off: its promise settles at once
      expect(cat.said.at(-1)).toBe('try');
      await vi.advanceTimersByTimeAsync(LONG);
      expect(cat.said.at(-1)).toBe('try');           // the cut-off hint of the first mistake showed and said nothing
      expect(revealed()).toBe(false);

      await cat.hearOut();
      expect(cat.hints()).toEqual([HINT[type], HINT[type]]);
      await vi.advanceTimersByTimeAsync(LONG);
      expect(revealed()).toBe(false);
      expect(cat.numbers()).toEqual([]);

      await cat.hearOut();
      expect(revealed()).toBe(true);
      if (COUNTING.includes(type)) await expectOneCount(cat.numbers, 0);
      expect(cat.hints()).toHaveLength(2);
      expect(cat.tries()).toBe(2);
      if (type === 'simon') return;                  // its hint is the replay; the buttons are locked meanwhile
      const lit = pulsing();
      expect(lit).toHaveLength(1);
      expect(lit[0].matches(CHOICES[type])).toBe(true);
      tap(lit[0]);                                   // what pulses is what the game accepts
      await vi.advanceTimersByTimeAsync(0);
      expect(cat.tries()).toBe(2);
      if (type === 'order') expect(lit[0].classList.contains('yes')).toBe(true);
      else if (type === 'sort') expect(all(lit[0], '.gem.small')).toHaveLength(1);
      else expect(root().classList.contains('won')).toBe(true);
    });

    it('a second mistake during "try again": the first round is dropped, the hint is said once', async () => {
      const { cat, miss } = await open(type);
      await miss();
      await miss();                                  // the second "try again" cuts the first one off
      await vi.advanceTimersByTimeAsync(LONG);
      expect(cat.tries()).toBe(2);
      expect(cat.hints()).toEqual([]);
      await cat.hearOut();
      await vi.advanceTimersByTimeAsync(LONG);
      expect(cat.hints()).toEqual([HINT[type]]);
      expect(revealed()).toBe(false);
      await cat.hearOut();
      expect(revealed()).toBe(true);
      expect(pulsing()).toHaveLength(type === 'simon' ? 0 : 1);
      expect(cat.hints()).toEqual([HINT[type]]);
    });
  });

  it.each(COUNTING)('%s: a second mistake during the count stops it, and the new round counts once from one', async (type) => {
    const { cat, miss } = await open(type, false, () => counted().length >= 3);
    await miss();
    await cat.hearOut();
    await cat.hearOut();
    expect(cat.numbers()).toEqual([1]);
    await vi.advanceTimersByTimeAsync(750);
    expect(cat.numbers()).toEqual([1, 2]);
    await miss();
    await vi.advanceTimersByTimeAsync(LONG);
    expect(cat.said.at(-1)).toBe('try');             // the old count did not talk over "try again"
    await cat.hearOut();
    await cat.hearOut();
    await expectOneCount(cat.numbers, 2);
    expect(pulsing()).toHaveLength(1);
  });

  it('count: when the child counts by herself during the hint, the cat does not count over her', async () => {
    const { cat, done, miss, solve } = await open('count');
    await miss();
    await cat.hearOut();                                   // "try again" has ended, the hint is being said
    expect(cat.said.at(-1)).toBe('h_count');
    const things = [...all(root(), '#taskStage .it')];
    tap(things[0]); await vi.advanceTimersByTimeAsync(0);  // her own "one" cuts the hint off
    tap(things[1]); await vi.advanceTimersByTimeAsync(0);
    expect(cat.numbers()).toEqual([1, 2]);
    await vi.advanceTimersByTimeAsync(LONG);               // nothing starts over from one
    expect(cat.numbers()).toEqual([1, 2]);
    expect([...all(root(), '#taskStage .it > i')].map((b) => b.textContent)).toEqual(['1', '2']);
    await solve();
    await vi.advanceTimersByTimeAsync(LONG);
    expect(await done).toEqual({ solved: true, wrong: 1 });
  });

  it('count: after the next mistake the cat counts again, even though she counted by herself before', async () => {
    const { cat, miss } = await open('count');
    await miss();
    await cat.hearOut();
    tap([...all(root(), '#taskStage .it')][0]);            // her own count during the first hint
    await vi.advanceTimersByTimeAsync(LONG);
    expect(cat.numbers()).toEqual([1]);
    await miss();                                          // a second mistake: "try again" ...
    await cat.hearOut();                                   // ... then the hint ...
    await cat.hearOut();                                   // ... heard to the end: now the cat counts everything
    await vi.advanceTimersByTimeAsync(LONG);
    const things = all(root(), '#taskStage .it').length;
    expect(cat.numbers().slice(1)).toEqual(Array.from({ length: things }, (_, i) => i + 1));
  });

  it('simon: the replay locks the buttons, then the sequence can be repeated', async () => {
    const { cat, done, miss, solve } = await open('simon');
    await miss();
    await cat.hearOut();
    await cat.hearOut();
    expect(stage().classList.contains('watch')).toBe(true);
    all(root(), CHOICES.simon).forEach(tap);         // taps during the replay are ignored: no new mistake
    await vi.advanceTimersByTimeAsync(SHOW_MS);
    expect(cat.tries()).toBe(1);
    expect(stage().classList.contains('watch')).toBe(false);
    expect(cat.said.at(-1)).toBe('t_simon_repeat');
    await solve();
    await vi.advanceTimersByTimeAsync(1100);
    expect(await done).toEqual({ solved: true, wrong: 1 });
  });
});
