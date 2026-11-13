/**
 * Panel mini-games: ten task types, each generated for a difficulty level 1..3.
 * A task never punishes: a wrong tap shakes, the cat encourages, and a type-specific hint follows.
 * After a mistake the order is fixed: "try again" to its end, then the whole spoken hint, then the solution
 * is shown. The child may answer at any moment of that; nothing waits for the cat to finish.
 */
import { shuffle, pick, randInt } from '../core/util';
import type { Spoken } from '../core/audio';
import type { SpokenKey } from '../ui/strings';

export type Skill = 'count' | 'add' | 'sub' | 'compare' | 'logic';
export type TaskType = 'count' | 'add' | 'sub' | 'compare' | 'pattern' | 'odd' | 'pairs' | 'order' | 'sort' | 'simon';
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
  wrongs: number; alive: boolean;
  /** The mistake (value of `wrongs`) after which the child last counted the things by herself; -1 = not yet. */
  own: number;
  right(): void; wrong(el?: HTMLElement): void;
  /** The hint of this task type: the line the cat says, and the solution shown once the line has ended. */
  hint: { key: SpokenKey; show(wrongs: number): void } | null;
  cheat: () => void;
}
type Builder = (c: Ctx) => SpokenKey;

const THINGS = ['🌸', '🦋', '🍓', '⭐', '🍄', '🐞', '🍎', '🌼', '🐟', '🍒'];
const CATS = [['🍎', '🍐', '🍊', '🍋', '🍓', '🍇'], ['🐱', '🐶', '🐰', '🦊', '🐻', '🐼'], ['🌸', '🌼', '🌷', '🌻', '🌹', '💐'], ['🚗', '🚌', '🚲', '🚀', '⛵', '🚂'], ['🍰', '🍭', '🍩', '🍪', '🍫', '🧁']];
const el = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const tap = (e: HTMLElement, fn: () => void) => e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); fn(); });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The shake of a wrong answer must be seen before the hint, even when "try again" is silent and ends at once. */
const SHAKE_MS = 900;

function items(parent: HTMLElement, emoji: string, n: number, cls = '') {
  const out: HTMLElement[] = [];
  for (let i = 0; i < n; i++) {
    const b = el('button', 'it ' + cls, emoji);
    b.style.setProperty('--r', `${randInt(-12, 12)}deg`);
    parent.appendChild(b); out.push(b);
  }
  return out;
}
function badge(e: HTMLElement, n: number) { e.querySelector('i')?.remove(); const b = el('i', '', String(n)); e.appendChild(b); }

/** Answer buttons; returns the correct one. */
function options(c: Ctx, values: (number | string)[], correct: number | string) {
  let ok!: HTMLElement;
  for (const v of values) {
    const b = el('button', 'opt', String(v));
    if (v === correct) ok = b;
    tap(b, () => { if (v === correct) { b.classList.add('yes'); c.right(); } else { b.classList.add('no'); c.wrong(b); } });
    c.opts.appendChild(b);
  }
  c.cheat = () => ok.dispatchEvent(new PointerEvent('pointerdown'));
  return ok;
}
function numberChoices(correct: number, max: number, n = 4) {
  const set = new Set([correct]);
  for (const d of shuffle([-1, 1, -2, 2, 3, -3])) { const v = correct + d; if (v >= 0 && v <= max && set.size < n) set.add(v); }
  return [...set].sort((a, b) => a - b);
}
/** Numbers every element one by one, aloud: the "let's count together" hint. A newer mistake stops the count: its own round will count again. */
async function countAloud(c: Ctx, list: HTMLElement[]) {
  const round = c.wrongs;
  for (const e of list) e.querySelector('i')?.remove();
  for (let i = 0; i < list.length && c.alive && c.wrongs === round; i++) { badge(list[i], i + 1); list[i].classList.add('hit'); c.hooks.number(i + 1); await wait(750); }
}

const builders: Record<TaskType, Builder> = {
  count(c) {
    const n = c.level === 1 ? randInt(3, 6) : c.level === 2 ? randInt(5, 9) : randInt(7, 10);
    const list = items(c.stage, pick(THINGS), n);
    let counted = 0;
    list.forEach((b) => tap(b, () => { if (!b.classList.contains('hit')) { b.classList.add('hit'); badge(b, ++counted); c.own = c.wrongs; c.hooks.number(counted); } }));
    const ok = options(c, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], n);
    c.hint = { key: 'h_count', show: (w) => { counted = n; void countAloud(c, list); if (w >= 2) ok.classList.add('pulse'); } };
    return 't_count';
  },
  add(c) {
    const max = c.level === 1 ? 5 : c.level === 2 ? 8 : 10;
    const a = randInt(1, max - 1), b = randInt(1, max - a), e = pick(THINGS);
    const ga = el('div', 'group'), gb = el('div', 'group');
    c.stage.append(ga, el('span', 'sign', '+'), gb, el('span', 'sign', '='), el('span', 'sign q', '?'));
    const all = [...items(ga, e, a), ...items(gb, e, b)];
    const ok = options(c, numberChoices(a + b, 10), a + b);
    c.hint = { key: 'h_count', show: (w) => { void countAloud(c, all); if (w >= 2) ok.classList.add('pulse'); } };
    return 't_add';
  },
  sub(c) {
    const max = c.level === 1 ? 5 : c.level === 2 ? 8 : 10;
    const a = randInt(3, max), b = randInt(1, a - 1), e = pick(THINGS);
    const list = items(c.stage, e, a);
    list.slice(a - b).forEach((x) => x.classList.add('gone'));
    const ok = options(c, numberChoices(a - b, 10), a - b);
    c.hint = { key: 'h_left', show: (w) => { void countAloud(c, list.slice(0, a - b)); if (w >= 2) ok.classList.add('pulse'); } };
    return 't_sub';
  },
  compare(c) {
    const max = c.level === 1 ? 5 : c.level === 2 ? 8 : 10, gap = c.level === 1 ? 2 : 1;
    let a = randInt(1, max), b = randInt(1, max);
    while (Math.abs(a - b) < gap) b = randInt(1, max);
    const more = c.level === 1 || Math.random() < 0.6, e = pick(THINGS);
    const groups = [a, b].map((n) => { const g = el('button', 'group pickable'); items(g, e, n, 'still'); c.stage.appendChild(g); return g; });
    const right = (a > b) === more ? 0 : 1;
    groups.forEach((g, i) => tap(g, () => { if (i === right) { g.classList.add('yes'); c.right(); } else { g.classList.add('no'); c.wrong(g); } }));
    c.cheat = () => groups[right].dispatchEvent(new PointerEvent('pointerdown'));
    c.hint = { key: 'h_compare', show: (w) => { groups.forEach((g, i) => { g.querySelector('em')?.remove(); g.appendChild(el('em', '', String(i ? b : a))); }); if (w >= 2) groups[right].classList.add('pulse'); } };
    return more ? 't_compare_more' : 't_compare_less';
  },
  pattern(c) {
    const unit = pick(c.level === 1 ? ['AB'] : c.level === 2 ? ['AAB', 'ABB', 'ABC'] : ['AABB', 'ABAC', 'ABCB', 'AABC']);
    const sym = shuffle(['🔴', '🔵', '🟡', '🟢', '🟣', '🟠']).slice(0, 3);
    const len = unit.length * 2 + randInt(1, unit.length - 1 || 1);
    const seq = Array.from({ length: len + 1 }, (_, i) => sym[unit.charCodeAt(i % unit.length) - 65]);
    seq.slice(0, len).forEach((s, i) => { const x = el('span', 'it still', s); x.dataset.u = String(i % unit.length); c.stage.appendChild(x); });
    c.stage.appendChild(el('span', 'it still q', '?'));
    const ok = options(c, shuffle(sym), seq[len]);
    c.hint = { key: 'h_pattern', show: (w) => { c.stage.classList.add('units'); if (w >= 2) ok.classList.add('pulse'); } };
    return 't_pattern';
  },
  odd(c) {
    const [main, other] = shuffle(CATS);
    const base = c.level === 1 ? Array(3).fill(pick(main)) : shuffle(main).slice(0, c.level === 2 ? 3 : 4);
    const odd = pick(other), list = shuffle([...base, odd]);
    let ok!: HTMLElement;
    for (const s of list) {
      const b = el('button', 'it big', s);
      if (s === odd) ok = b;
      tap(b, () => { if (s === odd) { b.classList.add('yes'); c.right(); } else { b.classList.add('no'); c.wrong(b); } });
      c.stage.appendChild(b);
    }
    c.cheat = () => ok.dispatchEvent(new PointerEvent('pointerdown'));
    c.hint = { key: 'h_odd', show: (w) => { if (w >= 2) ok.classList.add('pulse'); } };
    return 't_odd';
  },
  pairs(c) {
    const pairs = c.level === 1 ? 3 : c.level === 2 ? 4 : 6;
    const deck = shuffle(shuffle(THINGS).slice(0, pairs).flatMap((s) => [s, s]));
    c.stage.classList.add('cards'); c.stage.style.setProperty('--cols', String(pairs === 3 ? 3 : 4));
    // Memory has no "wrong" move, so a non-matching pair is only counted, never scolded or hinted.
    // Finding every pair takes about one miss per pair even with a perfect memory; more than that is
    // guessing. The result is then shaky (1), not the miss count: two or more would drop the level at once.
    let open: HTMLElement[] = [], lock = false, left = pairs, misses = 0;
    const cards = deck.map((s) => {
      const b = el('button', 'mcard'); b.appendChild(el('span', '', s)); b.dataset.s = s;
      tap(b, async () => {
        if (lock || b.classList.contains('open')) return;
        b.classList.add('open'); open.push(b);
        if (open.length < 2) return;
        const [x, y] = open; open = [];
        if (x.dataset.s === y.dataset.s) { x.classList.add('done'); y.classList.add('done'); c.hooks.good(); if (--left === 0) { if (misses > pairs) c.wrongs = 1; c.right(); } }
        else { misses++; lock = true; await wait(800); x.classList.remove('open'); y.classList.remove('open'); lock = false; }
      });
      c.stage.appendChild(b); return b;
    });
    c.cheat = () => { cards.forEach((b) => b.classList.add('open', 'done')); c.right(); };
    return 't_pairs';
  },
  order(c) {
    const n = c.level === 1 ? 4 : 5;
    const start = randInt(1, c.level === 1 ? 3 : 5);
    const nums = c.level < 3 ? Array.from({ length: n }, (_, i) => start + i) : shuffle(Array.from({ length: 10 }, (_, i) => i + 1)).slice(0, n).sort((a, b) => a - b);
    let next = 0;
    const btns = new Map<number, HTMLElement>();
    for (const v of shuffle([...nums])) {
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
    const colors = shuffle(['red', 'blue', 'yellow', 'green']).slice(0, c.level === 1 ? 2 : 3);
    const queue = shuffle(Array.from({ length: c.level === 3 ? 9 : 6 }, (_, i) => colors[i % colors.length]));
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
    const len = c.level + 2, sym = shuffle(['🌸', '⭐', '🍄', '🦋', '💎', '🍓']).slice(0, c.level + 3);
    const seq = Array.from({ length: len }, () => pick(sym));
    const btns = new Map<string, HTMLElement>();
    let pos = 0, showing = true;
    const play = async () => {
      showing = true; pos = 0; c.stage.classList.add('watch');
      await wait(600);
      for (const s of seq) { if (!c.alive) return; const b = btns.get(s)!; b.classList.add('flash'); c.hooks.good(); await wait(620); b.classList.remove('flash'); await wait(180); }
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

export function runTask(type: TaskType, level: number, hooks: TaskHooks): Promise<TaskResult> {
  const root = document.getElementById('task')!, stage = document.getElementById('taskStage')!, opts = document.getElementById('taskOpts')!;
  const close = document.getElementById('taskClose')!;
  stage.className = 't-stage t-' + type; stage.innerHTML = ''; opts.innerHTML = ''; stage.removeAttribute('style');
  root.classList.remove('hidden', 'won');
  return new Promise((resolve) => {
    const finish = (solved: boolean) => { c.alive = false; current = null; root.classList.add('hidden'); resolve({ solved, wrong: c.wrongs }); };
    const c: Ctx = {
      stage, opts, level, hooks, wrongs: 0, alive: true, own: -1, hint: null, cheat: () => {},
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
