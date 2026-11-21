// @vitest-environment happy-dom
/**
 * The promise of the game (LEARN-14): a mistake never takes anything away, no task limits the time of an answer,
 * and any task can be closed without consequences.
 *
 * Stars are read off the sources: the game keeps them in one save field, and the only code that may write it is
 * `addStars` in src/game/context.ts, which adds a positive amount, and `buy` in src/game/shop.ts, the one spending
 * function (PLAY-04), which takes the price of a thing only after canBuy has said yes.
 * Timers are checked by behaviour: every task type at every level is left open for an hour of fake time.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SKILL, cheatTask, runTask } from './taskviews/panel';
import type { TaskHooks, TaskResult } from './taskviews/panel';
import type { TaskType } from './tasks/types';
import type { Spoken } from '../core/audio';

// ---------- stars: only ever added ----------

const SOURCES = Object.entries(import.meta.glob('../**/*.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)
  .filter(([path]) => !path.endsWith('.test.ts') && !path.endsWith('.d.ts'))
  // Vite names the files of this very folder "./x.ts" and the others "../dir/x.ts".
  .map(([path, text]) => ({ path: path.replace(/^\.\//, 'src/game/').replace(/^\.\.\//, 'src/'), text }));

interface Hit { file: string; line: number; text: string; }
function find(re: RegExp): Hit[] {
  const out: Hit[] = [];
  for (const { path, text } of SOURCES) {
    for (const m of text.matchAll(re)) {
      const line = text.slice(0, m.index).split('\n').length;
      out.push({ file: path, line, text: m[0].trim() });
    }
  }
  return out;
}
const where = (hits: Hit[]) => hits.map((h) => `${h.file}:${h.line} "${h.text}"`).join('; ');

// Any write of a property called "stars": assignment of any kind, increment or decrement, dotted or in brackets.
const ASSIGN = String.raw`\s*(?:\*\*|<<|>>>|>>|\?\?|&&|\|\||[-+*/%&|^])?=(?!=)`;
const CHAIN = String.raw`[\w$]+(?:\s*\??\.\s*[\w$]+)*\s*\??\.\s*stars\b`;      // save.stars, __game.save?.stars
const AFTER_CALL = String.raw`[\])]\s*\??\.\s*stars\b`;                               // list[0].stars, get().stars
const STAR_WRITES = [
  new RegExp(`${CHAIN}${ASSIGN}[^;\\n]*`, 'g'),
  new RegExp(`${AFTER_CALL}${ASSIGN}[^;\\n]*`, 'g'),
  new RegExp(String.raw`\[\s*(['"\`])stars\1\s*\]${ASSIGN}[^;\n]*`, 'g'),
  /(?:\+\+|--)\s*[\w$.?\]\[()]*\.\s*stars\b/g,
  new RegExp(`(?:${CHAIN}|${AFTER_CALL})\\s*(?:\\+\\+|--)`, 'g'),
];
/** The first allowed writer: addStars in src/game/context.ts adds its own parameter. */
const ADD_STARS = /const addStars = \(n: number\b[^)]*\) => \{ save\.stars \+= n;/;
/** The second allowed writer: buy in src/game/shop.ts, which refuses first unless canBuy says yes, then takes the price. */
const BUY = /export function buy\(s: Save, id: string\): boolean \{\n\s*if \(!canBuy\(s, id\)\) return false;\n\s*const it = goods\(id\)!, day = dealDay\(\), deal = dealOf\(s, day\), price = priceOf\(s, id, day\)!;\n\s*s\.stars -= price;\n/;
const ALLOWED = [
  { file: 'src/game/context.ts', text: 'save.stars += n' },
  { file: 'src/game/shop.ts', text: 's.stars -= price' },
];

describe('stars are only ever added (LEARN-14, R13)', () => {
  it('the sources were found', () => {
    const names = SOURCES.map((s) => s.path);
    expect(names, 'the glob did not reach the game sources').toContain('src/main.ts');
    expect(names).toContain('src/core/save.ts');
    expect(names).toContain('src/game/taskviews/panel.ts');
    expect(names).toContain('src/game/taskviews/sort.ts');
    expect(names).toContain('src/game/tasks/sort.ts');
    expect(names).toContain('src/game/shop.ts');
  });

  it('the save field of the stars is written only by addStars, which only adds, and by the shop\'s buy (PLAY-04)', () => {
    const writes = STAR_WRITES.flatMap(find);
    const others = writes.filter((w) => !ALLOWED.some((a) => a.file === w.file && a.text === w.text));
    expect(others, `stars are written outside addStars and buy: ${where(others)}`).toEqual([]);
    const context = SOURCES.find((s) => s.path === 'src/game/context.ts')!.text;
    expect(ADD_STARS.test(context), 'addStars in src/game/context.ts does not add its amount to save.stars ("save.stars += n")').toBe(true);
    const shop = SOURCES.find((s) => s.path === 'src/game/shop.ts')?.text ?? '';
    expect(BUY.test(shop), 'buy in src/game/shop.ts does not take the price canBuy checked right after it ("s.stars -= price", price = priceOf)').toBe(true);
    expect(writes.length, `addStars and buy must be the only writers of the stars, found: ${where(writes)}`).toBe(2);
  });

  it('a "stars" field is set in an object only by the fresh save', () => {
    const keys = find(/(?<![\w$-])(['"`]?)stars\1\s*:\s*[^,;\n}]*/g);
    const save = SOURCES.find((s) => s.path === 'src/core/save.ts')!.text;
    const fresh = save.indexOf('export function defaultSave');
    const freshEnd = save.indexOf('\n}', fresh);
    // ui.ts: the element of the star counter in the HUD, not a number of stars.
    const allowed = (h: Hit) => (h.file === 'src/ui/ui.ts' && h.text === "stars: $('stars')")
      || h.file === 'src/core/save.ts' && (h.text === 'stars: number' || (h.text === 'stars: 0'
      && save.split('\n').slice(0, h.line - 1).join('\n').length > fresh && save.split('\n').slice(0, h.line).join('\n').length < freshEnd));
    const others = keys.filter((h) => !allowed(h));
    expect(others, `stars are set outside the fresh save (defaultSave): ${where(others)}`).toEqual([]);
  });

  it('the reward of a task does not depend on its mistakes (decision of 2026-11-14)', () => {
    const calls = find(/\baddStars\([^;\n]*/g);
    const bad = calls.filter((c) => /\bwrong\b|\berrors?\b|\bmistakes?\b/.test(c.text));
    expect(calls.length, 'no call of addStars was found: the check reads nothing').toBeGreaterThanOrEqual(3);
    expect(bad, `the number of stars depends on mistakes: ${where(bad)}`).toEqual([]);
  });

  it('every call of addStars gives a positive number of stars', () => {
    const calls = find(/\baddStars\(([^,()]*(?:\([^()]*\)[^,()]*)*),/g);
    expect(calls.length, 'no call of addStars was found: the check reads nothing').toBeGreaterThanOrEqual(3);
    const positive = (s: string) => /^\d+$/.test(s.trim()) && Number(s) > 0;
    const bad = calls.filter((c) => {
      const arg = c.text.slice('addStars('.length, -1).trim();
      const alt = /^[^?]+\?\s*([^:]+):\s*(.+)$/.exec(arg);       // cond ? a : b - both branches must be positive
      return alt ? !(positive(alt[1]) && positive(alt[2])) : !positive(arg);
    });
    expect(bad, `addStars is called with an amount that is not a positive number: ${where(bad)}`).toEqual([]);
  });
});

// ---------- timers: none of them ends a task or counts a mistake ----------

const spoken = () => Promise.resolve() as Spoken;
const MARKUP = '<div id="task" class="hidden"><button id="taskClose"></button>'
  + '<div id="taskStage" class="t-stage"></div><div id="taskOpts" class="t-opts"></div></div>';
const HOUR = 60 * 60 * 1000;
const TYPES = Object.keys(SKILL) as TaskType[];
const CASES = TYPES.flatMap((type) => [1, 2, 3].map((level) => [type, level] as const));

beforeEach(() => { vi.useFakeTimers(); document.body.innerHTML = MARKUP; });
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); document.body.innerHTML = ''; });

const root = () => document.getElementById('task')!;
function listen() {
  const heard = { wrong: 0, hints: 0 };
  const hooks: TaskHooks = {
    prompt: () => {}, number: () => {}, good: () => {},
    wrong: () => { heard.wrong++; return spoken(); },
    hint: () => { heard.hints++; return spoken(); },
  };
  return { hooks, heard };
}
function open(type: TaskType, level: number) {
  const { hooks, heard } = listen();
  const out: { result: TaskResult | null } = { result: null };
  void runTask(type, level, hooks).then((r) => { out.result = r; });
  return { heard, out };
}
/**
 * One wrong tap, found the way the walkthrough finds it: the task's own "solve" runs with its taps swallowed, which
 * names the right element; another element of the same kind is then tapped. Sorting solves in a loop that needs its
 * taps to land, so there the wrong basket is told by its colour. Memory pairs have no wrong move.
 */
function tapWrong(type: TaskType) {
  const tap = (e: Element) => e.dispatchEvent(new PointerEvent('pointerdown'));
  if (type === 'sort') {
    const colour = [...document.querySelector('.gem.current')!.classList].find((c) => c !== 'gem' && c !== 'current');
    tap([...document.querySelectorAll('#taskOpts .basket')].find((b) => !b.classList.contains(colour!))!);
    return;
  }
  let right: HTMLElement | null = null;
  const swallow = (e: Event) => { right ??= e.target as HTMLElement; e.stopImmediatePropagation(); };
  document.addEventListener('pointerdown', swallow, true);
  try { cheatTask(); } finally { document.removeEventListener('pointerdown', swallow, true); }
  const r = right as HTMLElement | null;
  if (!r) throw new Error(`${type}: the game did not show which element is right`);
  const same = [...document.querySelectorAll<HTMLElement>(`#task ${r.tagName}.${r.classList[0]}`)]
    .filter((e) => e !== r && !e.contains(r) && !r.contains(e) && !e.classList.contains('yes') && !e.classList.contains('q'));
  if (!same.length) throw new Error(`${type}: no other element like the right one (${r.className})`);
  tap(same[0]);
}

describe('no task limits the time of an answer (LEARN-14, R12)', () => {
  it.each(CASES)('%s, level %i: an hour without an answer ends nothing and counts no mistake', async (type, level) => {
    const { heard, out } = open(type, level);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(out.result, `${type}: a timer ended the task with ${JSON.stringify(out.result)}`).toBeNull();
    expect(root().classList.contains('hidden'), `${type}: a timer hid the task`).toBe(false);
    expect(heard.wrong, `${type}: a timer counted a mistake`).toBe(0);
    // "find the differences" alone gives its two hints by time, as its card asks (LEARN-18) - and no more, no mistake
    expect(heard.hints, `${type}: a timer gave a hint without a mistake`).toBe(type === 'diff' ? 2 : 0);
    // The answer still counts after the hour, and as a clean one.
    expect(cheatTask(), `${type}: the task is no longer on screen`).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(out.result, `${type}: the answer after an hour was not taken`).toEqual({ solved: true, wrong: 0 });
  });

  // memory pairs and the differences have no wrong move (a miss is no mistake)
  it.each(CASES.filter(([type]) => type !== 'pairs' && type !== 'diff'))('%s, level %i: an hour after a mistake the task waits for the answer', async (type, level) => {
    const { heard, out } = open(type, level);
    if (type === 'simon') await vi.advanceTimersByTimeAsync(10000);   // the sequence is shown first
    tapWrong(type);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(out.result, `${type}: a timer ended the task after the mistake with ${JSON.stringify(out.result)}`).toBeNull();
    expect(root().classList.contains('hidden'), `${type}: a timer hid the task after the mistake`).toBe(false);
    expect(heard.wrong, `${type}: one mistake was counted ${heard.wrong} times`).toBe(1);
    expect(cheatTask(), `${type}: the task is no longer on screen`).toBe(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(out.result, `${type}: the answer after the mistake was not taken`).toEqual({ solved: true, wrong: 1 });
  });
});

describe('any task can be closed without consequences (LEARN-14, R12)', () => {
  it.each(CASES)('%s, level %i: the close button ends the task unsolved, with no mistake, and nothing follows', async (type, level) => {
    const { heard, out } = open(type, level);
    await vi.advanceTimersByTimeAsync(300);
    document.getElementById('taskClose')!.click();
    await vi.advanceTimersByTimeAsync(0);
    expect(out.result, `${type}: closing did not end the task as unsolved without mistakes`).toEqual({ solved: false, wrong: 0 });
    expect(root().classList.contains('hidden'), `${type}: the closed task is still on screen`).toBe(true);
    await vi.advanceTimersByTimeAsync(HOUR);
    expect(heard.wrong + heard.hints, `${type}: the closed task still spoke a "try again" or a hint`).toBe(0);
    expect(cheatTask(), `${type}: the closed task still takes answers`).toBe(false);
  });
});
