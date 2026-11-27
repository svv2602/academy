// @vitest-environment happy-dom
/**
 * The order after a mistake on the panel (moved from `src/game/tasks.test.ts`): "try again" to its end, then the whole
 * spoken line of the rung, then what the rung shows; the child may answer at any moment, and nothing catches up after a close.
 * The rungs (LEARN-10, R16): the first mistake says the way and nothing on screen is numbered or lit as the answer,
 * the second solves it together on screen without lighting the answer, the third lights the answer.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mulberry32 } from '../../core/util';
import type { Key } from '../../ui/strings';
import type { Spoken } from '../../core/audio';
import type { TaskType } from '../tasks/types';
import { SKILL, cheatTask, runTask, type TaskHooks } from './panel';
import { FLY_MS } from './fly';

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

describe('after a mistake: "try again", then the whole line of its rung, then what the rung shows', () => {
  // a miss in "find the differences" and in the puzzle is no mistake: their hints come with time (taskviews/diff.ts, puzzle.ts)
  // "listen and touch" has rungs of no line yet (R25): ./en_tap.test.ts checks its course
  type Hinted = Exclude<TaskType, 'pairs' | 'diff' | 'puzzle' | 'en_tap'>;
  /** The line of rung 1 (the way, said only) of each type on level 1, as HINTS.md has it. */
  const HINT: Record<Hinted, Key> = {
    count: 'h1_count', add: 'h1_add', sub: 'h1_sub', compare: 'h_compare', pattern: 'h_pattern',
    odd: 'h_odd', order: 'h_order', sort: 'h_sort', simon: 'h1_simon', missing: 'h1_missing', house: 'h1_house',
    neighbors: 'h1_neighbors', signs: 'h1_signs', en_count: 'h1_count',
  };
  /** The line of rung 2 (solved together on screen). Rung 3 is the same line for every type. */
  const HINT2: Record<Hinted, Key> = {
    count: 'h_count', add: 'h_count', sub: 'h_left', compare: 'h2_compare', pattern: 'h2_pattern',
    odd: 'h2_odd', order: 'h2_order', sort: 'h2_sort', simon: 'h_simon', missing: 'h2_missing', house: 'h2_house',
    neighbors: 'h2_neighbors', signs: 'h2_signs', en_count: 'h_count',
  };
  const H3: Key = 'h3_show';
  /** The line said after mistake `k`. */
  const lineOf = (type: Hinted, k: number) => (k === 1 ? HINT[type] : k === 2 ? HINT2[type] : H3);
  /** Everything a child can answer with. */
  const CHOICES: Record<Hinted, string> = {
    count: '#taskOpts .opt', add: '#taskOpts .opt', sub: '#taskOpts .opt', pattern: '#taskOpts .opt',
    compare: '#taskStage .group.pickable', odd: '#taskStage .it.big', order: '#taskStage .opt.num',
    sort: '#taskOpts .basket', simon: '#taskStage .pad', missing: '#taskOpts .opt', house: '#taskOpts .opt',
    neighbors: '#taskOpts .opt', signs: '#taskOpts .opt', en_count: '#taskOpts .opt',
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
      hints: () => said.filter((x) => /^h\d?_/.test(x)),
      numbers: () => said.filter((x) => x.startsWith('#')).map((x) => Number(x.slice(1))),
    };
  }

  /**
   * What a hint reveals (HINTS.md, "Проверка ступени 1"): numbers on the things, numbers over the groups, the dots of a
   * number, a group that grows or shrinks, the frame of the alike, the number track, a basket the gem tried or kept,
   * the glowing gem, things that left, the counted glow, a pulsing answer, the repeating unit, the replayed show,
   * the counted cells of the neighbours, the things of both numbers of the signs.
   */
  const REVEAL = '.it > i, .group > em, .dots, .up, .dots-up, .grow, .shrink, .alike, .track, .try, .own, .glow, .away, .it.hit, .pulse, .cell.said, .side .tens';
  const revealed = () => all(root(), REVEAL).length > 0
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

  /** A whole round after mistake `k` heard to the end: "try again", the line of the rung, and whatever the rung shows. */
  async function round(cat: ReturnType<typeof talk>, miss: () => Promise<void>) {
    await miss(); await cat.hearOut(); await cat.hearOut(); await vi.advanceTimersByTimeAsync(LONG);
  }

  describe.each(HINTED)('%s', (type) => {
    it('nothing starts before the previous line has ended; rung 1 shows nothing, rung 2 solves it without lighting the answer, rung 3 lights it', async () => {
      const { cat, miss } = await open(type);
      await miss();
      expect(cat.said.at(-1)).toBe('try');
      await vi.advanceTimersByTimeAsync(LONG);       // however long "try again" takes, the hint waits for its end
      expect(cat.hints()).toEqual([]);
      expect(revealed()).toBe(false);

      await cat.hearOut();
      expect(cat.said.at(-1)).toBe(HINT[type]);
      await vi.advanceTimersByTimeAsync(LONG);
      await cat.hearOut();                           // the way is heard to the end: still nothing on screen (R16)
      await vi.advanceTimersByTimeAsync(LONG);
      expect(cat.hints()).toEqual([HINT[type]]);
      expect(cat.numbers()).toEqual([]);
      expect(revealed()).toBe(false);

      await miss();
      await cat.hearOut();
      expect(cat.said.at(-1)).toBe(HINT2[type]);
      await vi.advanceTimersByTimeAsync(LONG);       // and the solution waits for the end of the line
      expect(revealed()).toBe(false);
      await cat.hearOut();
      expect(cat.hints()).toEqual([HINT[type], HINT2[type]]);
      expect(revealed()).toBe(true);
      expect(pulsing()).toEqual([]);                 // solved together: the answer itself does not pulse
      if (COUNTING.includes(type)) { expect(cat.numbers()).toEqual([1]); await expectOneCount(cat.numbers, 0); }
      await vi.advanceTimersByTimeAsync(LONG);

      await miss();
      await cat.hearOut();
      expect(cat.said.at(-1)).toBe(H3);
      expect(pulsing()).toEqual([]);
      await cat.hearOut();
      const lit = pulsing();
      expect(lit).toHaveLength(1);
      expect(lit[0].matches(CHOICES[type])).toBe(true);
      expect(cat.hints()).toEqual([HINT[type], HINT2[type], H3]);
      expect(cat.tries()).toBe(3);
    });

    it('a muted voice keeps the order, and the shake is still seen before the hint', async () => {
      const { cat, tapWrong } = await open(type, true);
      const before = cat.said.length;
      tapWrong();
      await vi.advanceTimersByTimeAsync(899);
      expect(cat.said.slice(before)).toEqual(['try']);
      await vi.advanceTimersByTimeAsync(1);
      expect(cat.said.slice(before, before + 2)).toEqual(['try', HINT[type]]);
      expect(revealed()).toBe(false);
      await vi.advanceTimersByTimeAsync(LONG);
      const second = cat.said.length;
      tapWrong();
      await vi.advanceTimersByTimeAsync(899);
      expect(revealed()).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(cat.said.slice(second, second + 2)).toEqual(['try', HINT2[type]]);
      expect(revealed()).toBe(true);
      if (COUNTING.includes(type)) expect(cat.said.slice(second, second + 3)).toEqual(['try', HINT2[type], '#1']);
    });

    it.each([1, 2, 3])('the right answer during the hint of mistake %i wins at once, and nothing is shown afterwards', async (mistakes) => {
      const { cat, done, miss, solve } = await open(type);
      for (let k = 1; k < mistakes; k++) await round(cat, miss);
      await miss();
      await cat.hearOut();
      expect(cat.said.at(-1)).toBe(lineOf(type, mistakes));
      const hints = cat.hints().length, numbers = cat.numbers().length;
      await solve();                                 // the answer is not held back while the cat is talking
      expect(root().classList.contains('won')).toBe(true);
      await vi.advanceTimersByTimeAsync(FLY_MS);        // the answer lands in its "?" (./fly.ts): that is the win itself
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
      await round(cat, miss);
      await miss();
      await cat.hearOut();
      expect(cat.said.at(-1)).toBe(HINT2[type]);
      document.getElementById('taskClose')!.click();
      expect(await done).toEqual({ solved: false, wrong: 2 });
      const said = cat.said.length;
      await cat.hearOut();
      await vi.advanceTimersByTimeAsync(LONG);
      expect(cat.said).toHaveLength(said);
      expect(revealed()).toBe(false);
      expect(root().classList.contains('hidden')).toBe(true);
    });

    it('a second mistake during the hint: one hint at a time, the second rung is shown, then the third lights the answer', async () => {
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
      expect(cat.hints()).toEqual([HINT[type], HINT2[type]]);
      await vi.advanceTimersByTimeAsync(LONG);
      expect(revealed()).toBe(false);
      expect(cat.numbers()).toEqual([]);

      await cat.hearOut();
      expect(revealed()).toBe(true);
      if (COUNTING.includes(type)) await expectOneCount(cat.numbers, 0);
      expect(pulsing()).toEqual([]);
      await vi.advanceTimersByTimeAsync(LONG);       // the replay of simon locks the buttons meanwhile
      await round(cat, miss);
      expect(cat.hints()).toEqual([HINT[type], HINT2[type], H3]);
      expect(cat.tries()).toBe(3);
      const lit = pulsing();
      expect(lit).toHaveLength(1);
      expect(lit[0].matches(CHOICES[type])).toBe(true);
      tap(lit[0]);                                   // what pulses is what the game accepts
      await vi.advanceTimersByTimeAsync(0);
      expect(cat.tries()).toBe(3);
      if (type === 'order') expect(lit[0].classList.contains('yes')).toBe(true);
      else if (type === 'sort') expect(all(lit[0], '.gem.small')).toHaveLength(1);
      else if (type === 'simon') expect(pulsing()).toEqual([]);
      else expect(root().classList.contains('won')).toBe(true);
    });

    it('a second mistake during "try again": the first round is dropped, the second rung is said once', async () => {
      const { cat, miss } = await open(type);
      await miss();
      await miss();                                  // the second "try again" cuts the first one off
      await vi.advanceTimersByTimeAsync(LONG);
      expect(cat.tries()).toBe(2);
      expect(cat.hints()).toEqual([]);
      await cat.hearOut();
      await vi.advanceTimersByTimeAsync(LONG);
      expect(cat.hints()).toEqual([HINT2[type]]);
      expect(revealed()).toBe(false);
      await cat.hearOut();
      expect(revealed()).toBe(true);
      expect(pulsing()).toEqual([]);
      expect(cat.hints()).toEqual([HINT2[type]]);
    });
  });

  it.each(COUNTING)('%s: a third mistake during the count stops it; the answer is lit, the count does not talk on', async (type) => {
    const { cat, miss } = await open(type, false, () => counted().length >= 3);
    await round(cat, miss);
    expect(cat.numbers()).toEqual([]);
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
    await vi.advanceTimersByTimeAsync(LONG);
    expect(cat.numbers()).toEqual([1, 2]);
    expect(pulsing()).toHaveLength(1);
  });

  it('count: when the child counts by herself during the hint, the cat does not count over her', async () => {
    const { cat, done, miss, solve } = await open('count');
    await round(cat, miss);
    await miss();
    await cat.hearOut();                                   // "try again" has ended, the count-together line is being said
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
    expect(await done).toEqual({ solved: true, wrong: 2 });
  });

  it('count: after her own count during the second rung, the third mistake still lights the answer', async () => {
    const { cat, miss } = await open('count');
    await round(cat, miss);
    await miss();
    await cat.hearOut();
    tap([...all(root(), '#taskStage .it')][0]);            // her own count during the count-together line
    await vi.advanceTimersByTimeAsync(LONG);
    expect(cat.numbers()).toEqual([1]);
    expect(pulsing()).toEqual([]);
    await round(cat, miss);                                // the third mistake: "try again", "look what glows" ...
    expect(cat.said.at(-1)).toBe(H3);
    expect(pulsing()).toHaveLength(1);                     // ... and the answer is lit, though she counted before
  });

  it('simon: the first mistake does not replay; the second replays and locks the buttons, then the sequence can be repeated', async () => {
    const { cat, done, miss, solve } = await open('simon');
    await round(cat, miss);
    expect(stage().classList.contains('watch')).toBe(false);
    await miss();
    await cat.hearOut();
    await cat.hearOut();
    expect(stage().classList.contains('watch')).toBe(true);
    all(root(), CHOICES.simon).forEach(tap);         // taps during the replay are ignored: no new mistake
    await vi.advanceTimersByTimeAsync(SHOW_MS);
    expect(cat.tries()).toBe(2);
    expect(stage().classList.contains('watch')).toBe(false);
    expect(cat.said.at(-1)).toBe('t_simon_repeat');
    await solve();
    await vi.advanceTimersByTimeAsync(1100);
    expect(await done).toEqual({ solved: true, wrong: 2 });
  });
});
