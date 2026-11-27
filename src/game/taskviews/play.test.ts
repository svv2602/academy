// @vitest-environment happy-dom
/**
 * The panel plays every task type (ARCH-09; moved from `src/game/tasks.test.ts`): a thousand random tasks per level are
 * read off the screen, checked against the declared bounds and solved through the same pointerdown handlers a child's
 * finger reaches.
 */
import { WON_MAX_MS } from './fly';
import { afterEach, beforeEach, describe, it, vi } from 'vitest';
import { mulberry32 } from '../../core/util';
import type { Key } from '../../ui/strings';
import type { Spoken } from '../../core/audio';
import type { TaskType } from '../tasks/types';
import { PAIRS_PEEK_MS } from '../tasks/pairs';
import { cheatTask, runTask, type TaskHooks } from './panel';

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
    // The opening peek: every face is shown, taps do nothing; then the cards turn face down.
    must(stage().classList.contains('peek') && cards.every((c) => !c.classList.contains('open')), 'the task does not start with the peek');
    vi.advanceTimersByTime(PAIRS_PEEK_MS[level]);
    must(!stage().classList.contains('peek'), 'the cards did not turn face down after the peek');
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
  // The composition of a number (levels 1-3 play its lowest, the missing addend up to 10; the house is the same on every level).
  missing() {
    const a = all(stage(), '.group .it').length, sum = Number(text(stage().querySelector<HTMLElement>('.sign.sum')!));
    const { buttons, values } = numberOptions(`${a} + ? = ${sum}`, 4, 0);
    must(all(stage(), '.q').length === 1, 'there must be one question mark');
    between(sum, 3, 10, 'the sum');
    between(a, 1, sum - 1, 'the known addend');
    once(values, sum - a, 'the right answer');
    must(Number(text(accepted(buttons))) === sum - a, 'the accepted answer is not what is missing');
  },
  house() {
    const roof = Number(text(stage().querySelector<HTMLElement>('.roof')!)), floors = all(stage(), '.floor');
    const { buttons, values } = numberOptions(`roof ${roof}`, 4, 0);
    must(floors.length === 3, `${floors.length} floors, declared 3`);
    must(all(stage(), '.win.empty').length === 1, 'there must be one empty window');
    between(roof, 4, 10, 'the roof');
    let answer = -1;
    for (const f of floors) {
      const wins = all(f, '.win');
      must(wins.length === 2, 'a floor has two windows');
      const empty = wins.findIndex((w) => w.classList.contains('empty'));
      if (empty < 0) must(Number(text(wins[0])) + Number(text(wins[1])) === roof, 'a floor does not make the roof');
      else answer = roof - Number(text(wins[1 - empty]));
    }
    once(values, answer, 'the right answer');
    must(Number(text(accepted(buttons))) === answer, 'the accepted answer is not the number of the empty window');
  },
  // The neighbours of a number (LEARN-08): five cells in a row up to 20, one empty right before or after the marked one.
  neighbors(_level, heard) {
    const cells = all(stage(), '.road .cell'), empty = cells.findIndex((c) => c.classList.contains('empty'));
    const here = cells.findIndex((c) => c.classList.contains('here')), before = heard.prompts[0] === 't_before';
    seen = `${cells.map(text).join(' ')}; asked ${heard.prompts.join(' ')}`;
    must(cells.length === 5, `${cells.length} cells, declared 5`);
    must(heard.prompts.length === 1 && ['t_before', 't_after'].includes(heard.prompts[0]), 'the question is not "before" / "after"');
    must(all(stage(), '.cell.empty').length === 1 && text(cells[empty]) === '?', 'there must be one empty cell with "?"');
    must(here === empty + (before ? 1 : -1), 'the empty cell is not right before / after the marked number');
    const known = cells.map((c, i) => (i === empty ? NaN : Number(text(c))));
    const first = Number.isNaN(known[0]) ? known[1] - 1 : known[0];
    known.forEach((v, i) => { if (i !== empty) must(v === first + i, 'the numbers of the track are not in a row'); });
    between(first, 1, 16, 'the first cell');
    const answer = first + empty, buttons = all(opts(), '.opt'), values = buttons.map((b) => Number(text(b)));
    seen += `; options ${values.join(' ')}`;
    values.forEach((v) => between(v, 1, 20, 'an option'));
    distinct(values, 'options');
    once(values, answer, 'the right answer');
    must(Number(text(accepted(buttons))) === answer, 'the accepted answer is not the number of the empty cell');
  },
  // The signs (LEARN-09): two numbers up to 20, the empty place of the sign, the buttons ">", "<", "=".
  diff(level) {
    const pics = all(stage(), '.diffpic'), want = { 1: 2, 2: 3, 3: 3 }[level as 1 | 2 | 3];
    must(pics.length === 2, 'there must be two pictures');
    const [a, b] = pics.map((p) => (p.dataset.things ?? '').split(' '));
    seen = `${a.join(',')} / ${b.join(',')}`;
    must(a.length === 12 && b.length === 12, 'a glade is twelve things');
    must(a.filter((t, i) => t !== b[i]).length === want, `the pictures differ in ${want} things`);
    must(cheatTask(), 'there is no task on screen');
    must(all(pics[0], '.diffring').length === want && all(pics[1], '.diffring').length === want, 'every difference found is ringed on both pictures');
  },
  puzzle(level) {
    const pieces = all(stage(), '.pzpiece'), want = { 1: 6, 2: 9, 3: 12 }[level as 1 | 2 | 3];
    seen = `${pieces.length} pieces`;
    must(pieces.length === want, `${want} pieces`);
    must(all(stage(), '.pzcell').length === want, 'as many cells as pieces');
    must(cheatTask(), 'there is no task on screen');
    must(all(stage(), '.pzcell > .pzpiece.placed').length === want, 'every piece in a cell');
    must(all(stage(), '.pzcell').every((c) => c.firstElementChild?.getAttribute('data-cell') === c.getAttribute('data-cell')), 'each piece in its own cell');
  },
  signs() {
    const [a, b] = all(stage(), '.side > .n').map((e) => Number(text(e))), buttons = all(opts(), '.opt');
    seen = `${a} ? ${b}; options ${buttons.map(text).join(' ')}`;
    between(a, 1, 20, 'the first number'); between(b, 1, 20, 'the second number');
    must(buttons.map(text).join(' ') === '> < =', 'the sign buttons are not ">", "<", "="');
    must(text(stage().querySelector<HTMLElement>('.slot')!) === '?', 'the place of the sign is not empty');
    must(text(accepted(buttons)) === (a > b ? '>' : a < b ? '<' : '='), 'the accepted sign does not open towards the larger number');
  },
  // The tasks in breadth (LEARN-27) play one set of numbers whatever level they are asked with.
  sum3() {
    const groups = all(stage(), '.group'), parts = groups.map((g) => Number(text(g.querySelector<HTMLElement>('.n')!)));
    const things = groups.map((g) => all(g, '.tf > .it').length), sum = parts.reduce((x, y) => x + y, 0);
    const buttons = all(opts(), '.opt'), values = buttons.map((b) => Number(text(b)));
    seen = `${parts.join(' + ')}; things ${things.join(' ')}; options ${values.join(' ')}`;
    must(parts.length === 3, `${parts.length} addends, declared 3`);
    parts.forEach((p) => between(p, 2, 9, 'an addend'));
    between(sum, 11, 20, 'the sum');
    must(things.join() === parts.join(), 'each group shows as many things as its number says');
    must(all(stage(), '.sign').map(text).join(' ') === '+ + = ?', 'the row is not "a + b + c = ?"');
    must(all(stage(), 'button').length === 0, 'a thing of a group is a button');
    must(buttons.length === 4, `${buttons.length} options, declared 4`);
    values.forEach((v) => between(v, 0, 20, 'an option'));
    distinct(values, 'options');
    once(values, sum, 'the sum');
    must(Number(text(accepted(buttons))) === sum, 'the accepted option is not the sum of the three numbers');
  },
  gap() {
    const things = all(stage(), '.things .it'), gone = all(stage(), '.things .it.gone');
    const row = all(stage(), '.sign').map(text), [total, , , , left] = row.map(Number);
    const buttons = all(opts(), '.opt'), values = buttons.map((b) => Number(text(b)));
    seen = `${row.join(' ')}; things ${things.length}, gone ${gone.length}; options ${values.join(' ')}`;
    must(row.length === 5 && row[1] === '−' && row[2] === '?' && row[3] === '=', 'the row is not "total − ? = left"');
    between(total, 11, 20, 'the number of things');
    between(total - left, 2, 9, 'the number taken away');
    must(things.length === total, 'as many things as the first number says');
    must(gone.length === total - left, 'as many things greyed out as were taken away');
    must(things.slice(left).every((x) => x.classList.contains('gone')), 'the things taken away are the last ones');
    must(buttons.length === 4, `${buttons.length} options, declared 4`);
    values.forEach((v) => between(v, 0, 20, 'an option'));
    distinct(values, 'options');
    once(values, total - left, 'the number taken away');
    must(Number(text(accepted(buttons))) === total - left, 'the accepted option is not the number taken away');
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
        vi.advanceTimersByTime(WON_MAX_MS);
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
