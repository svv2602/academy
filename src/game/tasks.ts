/**
 * Panel mini-games: ten task types, each generated for a difficulty level 1..3.
 * A task never punishes: a wrong tap shakes, the cat encourages, and a type-specific hint follows.
 * After a mistake the order is fixed: "try again" to its end, then the whole spoken hint, then the solution
 * is shown. The child may answer at any moment of that; nothing waits for the cat to finish.
 */
import { shuffle, pick, randInt } from '../core/util';
import { createRng, type Rng } from '../core/rng';
import type { Spoken } from '../core/audio';
import type { SpokenKey } from '../ui/strings';
import { THINGS, type Hint, type HintStep, type TaskType } from './tasks/types';
import { count } from './tasks/count';
import { add } from './tasks/add';
import { sub } from './tasks/sub';
import { compare } from './tasks/compare';
import { pattern } from './tasks/pattern';
import './hints.css';

export type { TaskType };
export type Skill = 'count' | 'add' | 'sub' | 'compare' | 'logic';
export const SKILL: Record<TaskType, Skill> = {
  count: 'count', add: 'add', sub: 'sub', compare: 'compare', pattern: 'logic', odd: 'logic', pairs: 'logic', order: 'logic', sort: 'logic', simon: 'logic',
};
export interface TaskResult { solved: boolean; wrong: number; }
/**
 * What the game asks the cat to say. `wrong` and `hint` return the end of their line, so the next step can wait for it.
 * A line that is cut off by a newer one settles at once as well: a settled promise does not mean "heard to the end",
 * and whoever waits must check for itself that its step is still wanted.
 */
export interface TaskHooks {
  prompt(key: SpokenKey): void;    // show + speak the question
  number(n: number): void;         // say a number aloud while counting
  wrong(): Spoken;                 // gentle "try again"
  hint(key: SpokenKey): Spoken;    // the cat says the hint aloud, with its subtitle
  good(): void;                    // right-answer chime
}

interface Ctx {
  stage: HTMLElement; opts: HTMLElement; level: number; hooks: TaskHooks;
  /** Every random choice of the task comes from here (ARCH-08): one seed, one task. */
  rng: Rng;
  wrongs: number; alive: boolean;
  /** The mistake (value of `wrongs`) after which the child last counted the things by herself; -1 = not yet. */
  own: number;
  right(): void; wrong(el?: HTMLElement): void;
  /** The hint of this task type: the line the cat says, and the solution shown once the line has ended. */
  hint: { key: SpokenKey; show(wrongs: number): void } | null;
  cheat: () => void;
}
type Builder = (c: Ctx) => SpokenKey;

const CATS = [['🍎', '🍐', '🍊', '🍋', '🍓', '🍇'], ['🐱', '🐶', '🐰', '🦊', '🐻', '🐼'], ['🌸', '🌼', '🌷', '🌻', '🌹', '💐'], ['🚗', '🚌', '🚲', '🚀', '⛵', '🚂'], ['🍰', '🍭', '🍩', '🍪', '🍫', '🧁']];
const el = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const tap = (e: HTMLElement, fn: () => void) => e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); fn(); });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The shake of a wrong answer must be seen before the hint, even when "try again" is silent and ends at once. */
const SHAKE_MS = 900;
/**
 * Memory pairs open with every face shown for a moment (by level), before the first tap counts: the child sees that
 * the pictures come in twos and roughly where they lie. Six cards can be taken in at about half a second each; twelve
 * cannot be learnt in any short look, so the third level only gets a reminder and stays a memory game.
 * This is not a time limit: the game has not started yet, and nothing is lost when the cards turn face down.
 */
export const PAIRS_PEEK_MS = [0, 3000, 2500, 2000];

/** One button per thing, each with its tilt from the task's description (one tilt per thing). */
function items(parent: HTMLElement, emoji: string, tilt: readonly number[], cls = '') {
  return tilt.map((r) => {
    const b = el('button', 'it ' + cls, emoji);
    b.style.setProperty('--r', `${r}deg`);
    parent.appendChild(b); return b;
  });
}
function badge(e: HTMLElement, n: number) { e.querySelector('i')?.remove(); const b = el('i', '', String(n)); e.appendChild(b); }

/** Answer buttons, judged by the task's model; returns the correct one. */
function options<V extends number | string>(c: Ctx, values: readonly V[], right: (v: V) => boolean) {
  let ok!: HTMLElement;
  for (const v of values) {
    const b = el('button', 'opt', String(v));
    if (right(v)) ok = b;
    tap(b, () => { if (right(v)) { b.classList.add('yes'); c.right(); } else { b.classList.add('no'); c.wrong(b); } });
    c.opts.appendChild(b);
  }
  c.cheat = () => ok.dispatchEvent(new PointerEvent('pointerdown'));
  return ok;
}
/**
 * The hint of a described task (ARCH-09): its line, and its steps carried out in their order once the line has ended.
 * `act` is what each step does on the panel; "pulse the answer" is the same for every task: `ok` pulses from that mistake on.
 */
function hintOf(hint: Hint | null, ok: HTMLElement, act: Partial<Record<HintStep['do'], (step: HintStep) => void>>): Ctx['hint'] {
  if (!hint) return null;
  return { key: hint.key, show: (w) => {
    for (const step of hint.steps) {
      if (step.do === 'pulseAnswer') { if (w >= step.fromMistake) ok.classList.add('pulse'); } else act[step.do]?.(step);
    }
  } };
}
/** Numbers every element one by one, aloud: the "let's count together" hint. A newer mistake stops the count: its own round will count again. */
async function countAloud(c: Ctx, list: HTMLElement[]) {
  const round = c.wrongs;
  for (const e of list) e.querySelector('i')?.remove();
  for (let i = 0; i < list.length && c.alive && c.wrongs === round; i++) { badge(list[i], i + 1); list[i].classList.add('hit'); c.hooks.number(i + 1); await wait(750); }
}

// The first five types are described by their generator (`tasks/<type>.ts`, ARCH-09): the builder takes every random
// choice from `generate(level, rng)` and only draws the description; none of them asks `c.rng` itself.
const builders: Record<TaskType, Builder> = {
  count(c) {
    const spec = count.generate(c.level, c.rng), st = count.start(spec), { n } = spec.body;
    const list = items(c.stage, spec.body.thing, spec.body.tilt);
    let counted = 0;
    list.forEach((b) => tap(b, () => { if (!b.classList.contains('hit')) { b.classList.add('hit'); badge(b, ++counted); c.own = c.wrongs; c.hooks.number(counted); } }));
    const ok = options(c, spec.body.options, (v) => count.answer(spec, st, v) === 'right');
    c.hint = hintOf(spec.hint, ok, { countAloud: () => { counted = n; void countAloud(c, list); } });
    return spec.prompt;
  },
  add(c) {
    const spec = add.generate(c.level, c.rng), st = add.start(spec), { a, thing, tilt } = spec.body;
    const ga = el('div', 'group'), gb = el('div', 'group');
    c.stage.append(ga, el('span', 'sign', '+'), gb, el('span', 'sign', '='), el('span', 'sign q', '?'));
    const all = [...items(ga, thing, tilt.slice(0, a)), ...items(gb, thing, tilt.slice(a))];
    const ok = options(c, spec.body.options, (v) => add.answer(spec, st, v) === 'right');
    c.hint = hintOf(spec.hint, ok, { countAloud: () => { void countAloud(c, all); } });
    return spec.prompt;
  },
  sub(c) {
    const spec = sub.generate(c.level, c.rng), st = sub.start(spec), { total, gone } = spec.body;
    const list = items(c.stage, spec.body.thing, spec.body.tilt);
    list.slice(total - gone).forEach((x) => x.classList.add('gone'));
    const ok = options(c, spec.body.options, (v) => sub.answer(spec, st, v) === 'right');
    c.hint = hintOf(spec.hint, ok, {
      countAloud: (step) => { void countAloud(c, step.do === 'countAloud' && step.which === 'left' ? list.slice(0, total - gone) : list); },
    });
    return spec.prompt;
  },
  compare(c) {
    const spec = compare.generate(c.level, c.rng), st = compare.start(spec), { thing, groups: sizes, tilt, more } = spec.body;
    const groups = sizes.map((_, i) => { const g = el('button', 'group pickable'); items(g, thing, tilt[i], 'still'); c.stage.appendChild(g); return g; });
    // The question without words, from the start: a dot that keeps growing ("more") or shrinking ("less").
    // It sits between the groups and depends on the question alone, so it never points at the right group.
    const ask = el('span', 'ask ' + (more ? 'more' : 'less')); ask.setAttribute('aria-hidden', 'true'); ask.appendChild(el('b'));
    c.stage.insertBefore(ask, groups[1]);
    const right = compare.solution(spec, st)[0];
    groups.forEach((g, i) => tap(g, () => { if (compare.answer(spec, st, i as 0 | 1) === 'right') { g.classList.add('yes'); c.right(); } else { g.classList.add('no'); c.wrong(g); } }));
    c.cheat = () => groups[right].dispatchEvent(new PointerEvent('pointerdown'));
    // With the numbers, the right group does what the dot of the question does: its things grow or shrink.
    c.hint = hintOf(spec.hint, groups[right], {
      showNumbers: () => groups.forEach((g, i) => { g.querySelector('em')?.remove(); g.appendChild(el('em', '', String(sizes[i]))); }),
      grow: () => groups[right].classList.add('grow'),
      shrink: () => groups[right].classList.add('shrink'),
    });
    return spec.prompt;
  },
  pattern(c) {
    const spec = pattern.generate(c.level, c.rng), st = pattern.start(spec), { unit, row } = spec.body;
    row.forEach((s, i) => { const x = el('span', 'it still', s); x.dataset.u = String(i % unit.length); c.stage.appendChild(x); });
    c.stage.appendChild(el('span', 'it still q', '?'));
    const ok = options(c, spec.body.options, (v) => pattern.answer(spec, st, v) === 'right');
    c.hint = hintOf(spec.hint, ok, { markUnits: () => { c.stage.classList.add('units'); } });
    return spec.prompt;
  },
  odd(c) {
    const [main, other] = shuffle(CATS, c.rng);
    const base = c.level === 1 ? Array(3).fill(pick(main, c.rng)) : shuffle(main, c.rng).slice(0, c.level === 2 ? 3 : 4);
    const odd = pick(other, c.rng), list = shuffle([...base, odd], c.rng);
    let ok!: HTMLElement;
    const alike: HTMLElement[] = [];
    for (const s of list) {
      const b = el('button', 'it big', s);
      if (s === odd) ok = b; else alike.push(b);
      tap(b, () => { if (s === odd) { b.classList.add('yes'); c.right(); } else { b.classList.add('no'); c.wrong(b); } });
      c.stage.appendChild(b);
    }
    c.cheat = () => ok.dispatchEvent(new PointerEvent('pointerdown'));
    // The alike things share one frame, the odd one is left without: who belongs together is seen, not read.
    c.hint = { key: 'h_odd', show: (w) => { alike.forEach((b) => b.classList.add('alike')); if (w >= 2) ok.classList.add('pulse'); } };
    return 't_odd';
  },
  pairs(c) {
    const pairs = c.level === 1 ? 3 : c.level === 2 ? 4 : 6;
    const deck = shuffle(shuffle(THINGS, c.rng).slice(0, pairs).flatMap((s) => [s, s]), c.rng);
    c.stage.classList.add('cards'); c.stage.style.setProperty('--cols', String(pairs === 3 ? 3 : 4));
    // Memory has no "wrong" move, so a non-matching pair is only counted, never scolded or hinted.
    // Finding every pair takes about one miss per pair even with a perfect memory; more than that is
    // guessing. The result is then shaky (1), not the miss count: two or more would drop the level at once.
    let open: HTMLElement[] = [], lock = false, left = pairs, misses = 0, peeking = true;
    const cards = deck.map((s) => {
      const b = el('button', 'mcard'); b.appendChild(el('span', '', s)); b.dataset.s = s;
      tap(b, async () => {
        if (peeking || lock || b.classList.contains('open')) return;
        b.classList.add('open'); open.push(b);
        if (open.length < 2) return;
        const [x, y] = open; open = [];
        if (x.dataset.s === y.dataset.s) { x.classList.add('done'); y.classList.add('done'); c.hooks.good(); if (--left === 0) { if (misses > pairs) c.wrongs = 1; c.right(); } }
        else { misses++; lock = true; await wait(800); x.classList.remove('open'); y.classList.remove('open'); lock = false; }
      });
      c.stage.appendChild(b); return b;
    });
    c.cheat = () => { cards.forEach((b) => b.classList.add('open', 'done')); c.right(); };
    // The opening peek shows the faces through the stage, so the cards themselves stay as they are: taps meanwhile
    // open nothing and are not counted. A task that is over by then (solved or closed) is left alone.
    c.stage.classList.add('peek');
    setTimeout(() => { if (!c.alive) return; peeking = false; c.stage.classList.remove('peek'); }, PAIRS_PEEK_MS[c.level]);
    return 't_pairs';
  },
  order(c) {
    const n = c.level === 1 ? 4 : 5;
    const start = randInt(1, c.level === 1 ? 3 : 5, c.rng);
    const nums = c.level < 3 ? Array.from({ length: n }, (_, i) => start + i) : shuffle(Array.from({ length: 10 }, (_, i) => i + 1), c.rng).slice(0, n).sort((a, b) => a - b);
    let next = 0;
    const btns = new Map<number, HTMLElement>();
    for (const v of shuffle([...nums], c.rng)) {
      const b = el('button', 'opt num', String(v)); btns.set(v, b);
      tap(b, () => {
        if (b.classList.contains('yes')) return;
        if (v === nums[next]) { b.classList.add('yes'); b.style.order = String(next - 100); c.hooks.number(v); if (++next === n) c.right(); else c.hooks.good(); }
        else { b.classList.add('no'); setTimeout(() => b.classList.remove('no'), 400); c.wrong(); }
      });
      c.stage.appendChild(b);
    }
    c.cheat = () => { for (const v of nums.slice(next)) btns.get(v)!.dispatchEvent(new PointerEvent('pointerdown')); };
    c.hint = { key: 'h_order', show: () => { btns.get(nums[next])?.classList.add('pulse'); } };
    return 't_order';
  },
  sort(c) {
    const colors = shuffle(['red', 'blue', 'yellow', 'green'], c.rng).slice(0, c.level === 1 ? 2 : 3);
    const queue = shuffle(Array.from({ length: c.level === 3 ? 9 : 6 }, (_, i) => colors[i % colors.length]), c.rng);
    const cur = el('div', 'gem current'); c.stage.appendChild(cur);
    const baskets = new Map<string, HTMLElement>();
    const show = () => { cur.className = 'gem current ' + queue[0]; cur.style.animation = 'none'; void cur.offsetWidth; cur.style.animation = ''; };
    for (const col of colors) {
      const b = el('button', 'basket ' + col); baskets.set(col, b);
      tap(b, () => {
        if (!queue.length) return;
        if (col === queue[0]) {
          b.appendChild(el('div', 'gem small ' + col)); queue.shift(); baskets.forEach((x) => x.classList.remove('pulse'));
          if (queue.length) { c.hooks.good(); show(); } else { cur.remove(); c.right(); }
        } else { b.classList.add('no'); setTimeout(() => b.classList.remove('no'), 400); c.wrong(); }
      });
      c.opts.appendChild(b);
    }
    show();
    c.cheat = () => { while (queue.length) baskets.get(queue[0])!.dispatchEvent(new PointerEvent('pointerdown')); };
    c.hint = { key: 'h_sort', show: () => { baskets.get(queue[0])?.classList.add('pulse'); } };
    return 't_sort';
  },
  simon(c) {
    const len = c.level + 2, sym = shuffle(['🌸', '⭐', '🍄', '🦋', '💎', '🍓'], c.rng).slice(0, c.level + 3);
    const seq = Array.from({ length: len }, () => pick(sym, c.rng));
    const btns = new Map<string, HTMLElement>();
    let pos = 0, showing = true;
    const play = async () => {
      showing = true; pos = 0; c.stage.classList.add('watch');
      await wait(600);
      for (const s of seq) { if (!c.alive) return; const b = btns.get(s)!; b.classList.add('flash'); c.hooks.good(); await wait(620); b.classList.remove('flash'); await wait(180); }
      if (!c.alive) return;   // closed or solved during the last flash: say nothing, leave the stage alone
      c.stage.classList.remove('watch'); showing = false; c.hooks.prompt('t_simon_repeat');
    };
    for (const s of sym) {
      const b = el('button', 'it big pad', s); btns.set(s, b);
      tap(b, () => {
        if (showing) return;
        if (s === seq[pos]) { b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 250); if (++pos === len) c.right(); else c.hooks.good(); }
        else { b.classList.add('no'); setTimeout(() => b.classList.remove('no'), 400); c.wrong(); }
      });
      c.stage.appendChild(b);
    }
    c.hint = { key: 'h_simon', show: () => { void play(); } };
    c.cheat = () => { showing = false; for (const s of seq.slice(pos)) btns.get(s)!.dispatchEvent(new PointerEvent('pointerdown')); };
    void play();
    return 't_simon_watch';
  },
};

let current: Ctx | null = null;
/** Test hook: solves the task on screen the way a child would (through the same handlers). */
export function cheatTask() { current?.cheat(); return !!current; }

/**
 * `rng` is the source of every random choice of the task (ARCH-08); the game passes its own, seeded by `?seed=`.
 * Without it the task is as random as before: the default is taken at each call.
 */
export function runTask(type: TaskType, level: number, hooks: TaskHooks, rng: Rng = createRng(null)): Promise<TaskResult> {
  const root = document.getElementById('task')!, stage = document.getElementById('taskStage')!, opts = document.getElementById('taskOpts')!;
  const close = document.getElementById('taskClose')!;
  stage.className = 't-stage t-' + type; stage.innerHTML = ''; opts.innerHTML = ''; stage.removeAttribute('style');
  root.classList.remove('hidden', 'won');
  return new Promise((resolve) => {
    const finish = (solved: boolean) => { c.alive = false; current = null; root.classList.add('hidden'); resolve({ solved, wrong: c.wrongs }); };
    const c: Ctx = {
      stage, opts, level, hooks, rng, wrongs: 0, alive: true, own: -1, hint: null, cheat: () => {},
      right() { if (!c.alive) return; c.alive = false; hooks.good(); root.classList.add('won'); setTimeout(() => finish(true), 1100); },
      wrong(e) {
        if (!c.alive) return;
        const round = ++c.wrongs;
        if (e) e.classList.add('no');
        // A cut-off line settles at once too, so each step first checks that it is still wanted:
        // the task is open (not solved, not closed) and no newer mistake has started its own round.
        const wanted = () => c.alive && c.wrongs === round;
        void (async () => {
          await Promise.all([hooks.wrong(), wait(SHAKE_MS)]);
          if (!wanted() || !c.hint) return;
          await hooks.hint(c.hint.key);
          // Her own tap on a thing says its number and so cuts the hint off. She is doing what the hint asked:
          // the cat must not start counting from one over her. The next mistake brings the cat's count back.
          if (wanted() && c.own !== round) c.hint.show(round);
        })();
      },
    };
    current = c;
    close.onclick = () => { if (c.alive) finish(false); };
    hooks.prompt(builders[type](c));
  });
}
