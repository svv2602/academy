// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, levelFor, recordTask } from '../core/save';
import { mulberry32 } from '../core/util';
import type { Key } from '../ui/strings';
import { SKILL, cheatTask, runTask } from './tasks';
import type { TaskHooks, TaskResult, TaskType } from './tasks';
import type { Spoken } from '../core/audio';

/** A test stands in for the voice: only here a plain promise may pose as a spoken line. */
const spoken = (end: Promise<void> = Promise.resolve()) => end as Spoken;

// The generators build page elements instead of returning data, so every check here reads the task
// off the screen and answers it through the same pointerdown handlers a child's finger reaches.

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

interface Heard { prompts: Key[]; numbers: number[]; hints: Key[]; wrong: number; good: number; onGood: () => void; }
/** Hooks that only remember what the game asked the cat to say. */
function listen(): { hooks: TaskHooks; heard: Heard } {
  const heard: Heard = { prompts: [], numbers: [], hints: [], wrong: 0, good: 0, onGood: () => {} };
  const hooks: TaskHooks = {
    prompt: (key) => { heard.prompts.push(key); },
    number: (n) => { heard.numbers.push(n); },
    wrong: () => { heard.wrong++; return spoken(); },
    hint: (key) => { heard.hints.push(key); return spoken(); },
    good: () => { heard.good++; heard.onGood(); },
  };
  return { hooks, heard };
}

function must(ok: boolean, what: string): asserts ok { if (!ok) throw new Error(what); }
const between = (v: number, lo: number, hi: number, what: string) =>
  must(Number.isInteger(v) && v >= lo && v <= hi, `${what} is ${v}, declared bounds are ${lo}..${hi}`);
const distinct = <T>(values: T[], what: string) =>
  must(new Set(values).size === values.length, `${what} repeat: ${values.join(' ')}`);
const once = <T>(values: T[], answer: T, what: string) => {
  const n = values.filter((v) => v === answer).length;
  must(n === 1, `${what} ${String(answer)} is among the options ${n} times, expected exactly once`);
};

/**
 * Finds the option the game accepts. cheatTask() presses it through the option's own pointerdown handler;
 * the task is won by then, so tapping every other candidate only reveals how its handler judges it.
 */
function accepted(candidates: HTMLElement[]): HTMLElement {
  must(cheatTask(), 'there is no task on screen');
  must(candidates.filter((c) => c.classList.contains('yes')).length === 1, 'the right answer was not pressed exactly once');
  candidates.forEach(tap);
  const yes = candidates.filter((c) => c.classList.contains('yes'));
  must(yes.length === 1, `the handlers accept ${yes.length} options, expected exactly one`);
  must(candidates.every((c) => c === yes[0] || c.classList.contains('no')), 'an option is neither right nor wrong');
  return yes[0];
}

/** Number buttons under the stage: declared count, whole numbers inside 0..10 (count: 1..10), no repeats. */
function numberOptions(task: string, howMany: number, lo: number) {
  const buttons = all(opts(), '.opt'), values = buttons.map((b) => Number(text(b)));
  seen = `${task}; options ${values.join(' ')}`;
  must(buttons.length === howMany, `${buttons.length} options, declared ${howMany}`);
  values.forEach((v) => between(v, lo, 10, 'an option'));
  distinct(values, 'options');
  return { buttons, values };
}

const LIMIT = [0, 5, 8, 10];                       // the largest number of a level in count-like tasks
const COUNT = [[0, 0], [3, 6], [5, 9], [7, 10]];
const UNITS = [[], ['AB'], ['AAB', 'ABB', 'ABC'], ['AABB', 'ABAC', 'ABCB', 'AABC']];
const SHOWN = [[0, 0], [5, 5], [7, 8], [9, 11]];   // two whole units and the start of the third
const PAIRS = [0, 3, 4, 6];
const ORDER = [[0, 0, 0], [4, 1, 6], [5, 1, 9], [5, 1, 10]];   // how many numbers, lowest, highest
const SORT = [[0, 0], [2, 6], [3, 6], [3, 9]];     // colours, gems
const COLORS = ['red', 'blue', 'yellow', 'green'];
// The test's own idea of what belongs together: an odd-one-out must come from another group.
const GROUPS = ['🍎🍐🍊🍋🍓🍇', '🐱🐶🐰🦊🐻🐼', '🌸🌼🌷🌻🌹💐', '🚗🚌🚲🚀⛵🚂', '🍰🍭🍩🍪🍫🧁'];
const groupOf = (s: string) => GROUPS.findIndex((g) => g.includes(s));

let seen = '';   // the task as it looks on screen, for the failure message

/** Reads one task off the screen, checks it against the declared bounds and solves it the way a child would. */
const PLAY: Record<TaskType, (level: number, heard: Heard) => void | Promise<void>> = {
  count(level) {
    const n = all(stage(), '.it').length;
    const { buttons, values } = numberOptions(`${n} things`, 10, 1);
    between(n, COUNT[level][0], COUNT[level][1], 'the number of things');
    once(values, n, 'the right answer');
    must(Number(text(accepted(buttons))) === n, 'the accepted answer is not the number of things');
  },
  add(level) {
    const [a, b] = all(stage(), '.group').map((g) => all(g, '.it').length);
    const { buttons, values } = numberOptions(`${a} + ${b}`, 4, 0);
    must(all(stage(), '.group').length === 2, 'there must be two groups to add');
    between(a, 1, LIMIT[level] - 1, 'the first addend');
    between(b, 1, LIMIT[level] - 1, 'the second addend');
    between(a + b, 2, LIMIT[level], 'the sum');
    once(values, a + b, 'the right answer');
    must(Number(text(accepted(buttons))) === a + b, 'the accepted answer is not the sum');
  },
  sub(level) {
    const things = all(stage(), '.it'), gone = things.filter((t) => t.classList.contains('gone')).length;
    const { buttons, values } = numberOptions(`${things.length} - ${gone}`, 4, 0);
    between(things.length, 3, LIMIT[level], 'the number to subtract from');
    between(gone, 1, things.length - 1, 'the number taken away');
    between(things.length - gone, 1, LIMIT[level] - 1, 'what is left');
    once(values, things.length - gone, 'the right answer');
    must(Number(text(accepted(buttons))) === things.length - gone, 'the accepted answer is not what is left');
  },
  compare(level, heard) {
    const groups = all(stage(), '.group.pickable'), sizes = groups.map((g) => all(g, '.it').length);
    const question = heard.prompts[0];
    seen = `${sizes.join(' vs ')}; question ${question}`;
    must(groups.length === 2, `${groups.length} groups, declared 2`);
    must(question === 't_compare_more' || question === 't_compare_less', 'the question is neither "more" nor "less"');
    sizes.forEach((n) => between(n, 1, LIMIT[level], 'a group'));
    between(Math.abs(sizes[0] - sizes[1]), level === 1 ? 2 : 1, LIMIT[level] - 1, 'the difference between the groups');
    const best = question === 't_compare_more' ? Math.max(...sizes) : Math.min(...sizes);
    once(sizes, best, 'the right answer');
    must(sizes[groups.indexOf(accepted(groups))] === best, 'the accepted group does not answer the question');
  },
  pattern(level) {
    const row = all(stage(), '.it.still:not(.q)').map(text), buttons = all(opts(), '.opt'), values = buttons.map(text);
    seen = `${row.join('')}?; options ${values.join(' ')}`;
    must(all(stage(), '.q').length === 1, 'there must be one question mark');
    between(row.length, SHOWN[level][0], SHOWN[level][1], 'the length of the row');
    must(buttons.length === 3, `${buttons.length} options, declared 3`);
    distinct(values, 'options');
    must(row.every((s) => values.includes(s)), 'a symbol of the row is missing from the options');
    // Every period that is shown at least twice must predict the same next symbol, or the task has two answers.
    const periods = Array.from({ length: row.length >> 1 }, (_, i) => i + 1).filter((p) => row.every((s, i) => i < p || s === row[i - p]));
    must(periods.length > 0, 'the row does not repeat');
    const next = row[row.length - periods[0]];
    must(periods.every((p) => row[row.length - p] === next), 'the row can be continued in two ways');
    const letters = [...new Set(row)];
    const unit = row.slice(0, periods[0]).map((s) => 'ABC'[letters.indexOf(s)]).join('');
    must(UNITS[level].includes(unit), `the unit ${unit} is not declared for this level (${UNITS[level].join(', ')})`);
    once(values, next, 'the right answer');
    must(text(accepted(buttons)) === next, 'the accepted answer does not continue the row');
  },
  odd(level) {
    const buttons = all(stage(), '.it.big'), values = buttons.map(text);
    seen = values.join(' ');
    must(buttons.length === (level === 3 ? 5 : 4), `${buttons.length} things, declared ${level === 3 ? 5 : 4}`);
    must(values.every((s) => groupOf(s) >= 0), 'a thing belongs to no known group');
    const sizes = new Map<number, number>();
    for (const s of values) sizes.set(groupOf(s), (sizes.get(groupOf(s)) ?? 0) + 1);
    const lonely = values.filter((s) => sizes.get(groupOf(s)) === 1);
    must(sizes.size === 2 && lonely.length === 1, 'there must be one group plus exactly one thing from another group');
    once(values, lonely[0], 'the right answer');
    const rest = values.filter((s) => s !== lonely[0]);
    // Level 1 is "the obvious odd one": three copies of one thing. From level 2 on nothing repeats.
    if (level === 1) must(new Set(rest).size === 1, `level 1 shows three copies of one thing, got ${rest.join(' ')}`);
    else distinct(values, 'things');
    must(text(accepted(buttons)) === lonely[0], 'the accepted thing is not the odd one');
  },
  pairs(level, heard) {
    const cards = all(stage(), '.mcard'), faces = cards.map(text);
    seen = faces.join(' ');
    must(cards.length === PAIRS[level] * 2, `${cards.length} cards, declared ${PAIRS[level]} pairs`);
    must(cards.every((c) => c.dataset.s === text(c)), 'a card is matched by something other than its picture');
    const kinds = [...new Set(faces)];
    must(kinds.length === PAIRS[level], `${kinds.length} different pictures, declared ${PAIRS[level]}`);
    for (const k of kinds) {
      const pair = cards.filter((_, i) => faces[i] === k);
      must(pair.length === 2, `the picture ${k} is on ${pair.length} cards, expected exactly two`);
      pair.forEach(tap);
      must(pair.every((c) => c.classList.contains('done')), `two cards ${k} were not accepted as a pair`);
    }
    must(heard.good === PAIRS[level] + 1, 'each found pair chimes once, and the finished task once more');
  },
  order(level) {
    const buttons = all(stage(), '.opt.num'), values = buttons.map((b) => Number(text(b)));
    seen = values.join(' ');
    const [howMany, lo, hi] = ORDER[level];
    must(buttons.length === howMany, `${buttons.length} numbers, declared ${howMany}`);
    values.forEach((v) => between(v, lo, hi, 'a number'));
    distinct(values, 'numbers');
    const sorted = [...values].sort((a, b) => a - b);
    if (level === 1) between(sorted[0], 1, 3, 'the first number');
    if (level === 2) between(sorted[0], 1, 5, 'the first number');
    if (level < 3) must(sorted.every((v, i) => v === sorted[0] + i), 'levels 1 and 2 show consecutive numbers');
    for (const v of sorted) {
      const b = buttons[values.indexOf(v)];
      tap(b);
      must(b.classList.contains('yes'), `${v} was not accepted as the next smallest number`);
    }
  },
  sort(level) {
    const baskets = all(opts(), '.basket'), colors = baskets.map((b) => COLORS.find((c) => b.classList.contains(c)) ?? '?');
    const [howMany, gems] = SORT[level];
    seen = `baskets ${colors.join(' ')}; gems`;
    must(baskets.length === howMany, `${baskets.length} baskets, declared ${howMany}`);
    must(!colors.includes('?'), 'a basket has no known colour');
    distinct(colors, 'baskets');
    let sorted = 0;
    for (let gem = stage().querySelector('.gem.current'); gem; gem = stage().querySelector('.gem.current')) {
      const here = gem;
      const color = COLORS.find((c) => here.classList.contains(c)) ?? '?';
      seen += ` ${color}`;
      once(colors, color, 'the basket for the gem');
      must(++sorted <= gems, `more than the declared ${gems} gems`);
      const basket = baskets[colors.indexOf(color)];
      tap(basket);
      must(all(basket, '.gem.small').length > 0 && all(basket, '.gem.small').every((g) => g.classList.contains(color)), 'the gem did not land in its basket');
    }
    must(sorted === gems, `${sorted} gems, declared ${gems}`);
    must(baskets.every((b) => all(b, '.gem.small').length === gems / howMany), 'the gems are not shared equally between the baskets');
  },
  async simon(level, heard) {
    const pads = all(stage(), '.it.big.pad'), values = pads.map(text);
    must(pads.length === level + 3, `${pads.length} buttons, declared ${level + 3}`);
    distinct(values, 'buttons');
    // Watch the show like a child does: each chime lights exactly one button.
    const shown: HTMLElement[] = [];
    let lit = true;
    heard.onGood = () => { const on = all(stage(), '.pad.flash'); lit &&= on.length === 1; shown.push(on[0]); };
    must(heard.prompts[0] === 't_simon_watch' && stage().classList.contains('watch'), 'the task must start with the show');
    pads.forEach(tap);                                         // taps during the show are ignored
    await vi.advanceTimersByTimeAsync(600 + 800 * (level + 2));
    heard.onGood = () => {};
    seen = `buttons ${values.join(' ')}; shown ${shown.map((b) => (b ? text(b) : '?')).join(' ')}`;
    must(lit, 'a step of the show lit no button or several at once');
    must(heard.prompts[1] === 't_simon_repeat' && !stage().classList.contains('watch'), 'the show did not end in time');
    must(shown.length === level + 2, `${shown.length} steps, declared ${level + 2}`);
    shown.forEach(tap);
  },
};

const TYPES = Object.keys(PLAY) as TaskType[];
const TASKS = 1000;
/**
 * happy-dom caches query results behind WeakRefs, and the engine keeps a WeakRef's target (here: the whole page of
 * a finished task) alive until the code returns to the event loop. Awaiting promises never gets there, so without a
 * real pause the 30 000 pages add up to more than 4 GB and the run dies on a machine with the default heap.
 */
const BREATH = 50;
const realTimeout = setTimeout;                   // taken before any test installs the fake clock, which would never fire it
const breathe = () => new Promise<void>((resolve) => { realTimeout(resolve, 0); });
/** One seed per task: to replay a failure, set Math.random = mulberry32(seed) and run that single task. */
const seedOf = (type: TaskType, level: number, i: number) => (TYPES.indexOf(type) * 3 + level - 1) * 100_000 + i + 1;

describe.each(TYPES)('generator %s', (type) => {
  it.each([1, 2, 3])(`level %i: ${TASKS} random tasks have one right answer, no repeated options and stay within bounds`, { timeout: 30_000 }, async (level) => {
    for (let i = 0; i < TASKS; i++) {
      const seed = seedOf(type, level, i);
      Math.random = mulberry32(seed);
      document.body.innerHTML = MARKUP;          // a fresh page per task: nothing piles up over 30 000 tasks
      const { hooks, heard } = listen();
      seen = '(not built)';
      try {
        const done = runTask(type, level, hooks);
        await PLAY[type](level, heard);
        must(root().classList.contains('won'), 'the right answer did not finish the task');
        vi.advanceTimersByTime(1100);
        const result = await done;
        must(result.solved && result.wrong === 0, `solved cleanly, but the result is ${JSON.stringify(result)}`);
        must(heard.wrong === 0 && heard.hints.length === 0, 'a clean solve triggered "try again" or a hint');
        must(root().classList.contains('hidden'), 'the panel stayed open');
      } catch (e) {
        throw new Error(`${type}, level ${level}, task #${i} (seed ${seed}): ${(e as Error).message}\n  on screen: ${seen}`);
      }
      vi.clearAllTimers();
      if (i % BREATH === BREATH - 1) await breathe();
    }
  });
});

describe('pairs: extra openings make the result shaky, never "wrong"', () => {
  /** Opens `misses` non-matching pairs of cards, then finds every pair. Returns what the task reported. */
  async function playPairs(level: number, misses: number, hooks: TaskHooks, whileShown?: (cards: HTMLElement[]) => void): Promise<TaskResult> {
    const done = runTask('pairs', level, hooks);
    const cards = all(stage(), '.mcard');
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
    save.difficulty = 3;                           // the parent fixed the hardest games: six pairs at skill level 1
    await playAndRecord(save, 20);
    expect(save.skills.logic.level).toBe(1);
    await playAndRecord(save, 20);
    expect(save.skills.logic).toMatchObject({ level: 1, tasks: 2, first: 0 });
  });

  it('6 pairs with no extra openings, twice in a row: the level goes up', async () => {
    const save = defaultSave();
    save.difficulty = 3;
    await playAndRecord(save, 0);
    await playAndRecord(save, 0);
    expect(save.skills.logic).toMatchObject({ level: 2, tasks: 2, first: 2 });
  });

  it('adaptive difficulty: brute-forced pairs never count as a clean solve', async () => {
    const save = defaultSave();                    // level 1: three pairs
    await playAndRecord(save, 0);
    await playAndRecord(save, 20);                 // breaks the streak instead of completing it
    expect(save.skills.logic.level).toBe(1);
    await playAndRecord(save, 3);                  // within the allowance: clean
    await playAndRecord(save, 3);
    expect(save.skills.logic.level).toBe(2);
  });
});

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
