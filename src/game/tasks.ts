/**
 * Panel mini-games: ten task types, each generated for a difficulty level 1..3.
 * A task never punishes: a wrong tap shakes, the cat encourages, and a type-specific hint follows.
 * After a mistake the order is fixed: "try again" to its end, then the whole spoken hint, then the solution
 * is shown. The child may answer at any moment of that; nothing waits for the cat to finish.
 */
import { createRng, type Rng } from '../core/rng';
import type { Spoken } from '../core/audio';
import type { SpokenKey } from '../ui/strings';
import type { Hint, HintStep, TaskType } from './tasks/types';
import { count } from './tasks/count';
import { add } from './tasks/add';
import { sub } from './tasks/sub';
import { compare } from './tasks/compare';
import { pattern } from './tasks/pattern';
import { odd } from './tasks/odd';
import { pairs, PAIRS_PEEK_MS } from './tasks/pairs';
import { order } from './tasks/order';
import { sort } from './tasks/sort';
import { simon } from './tasks/simon';
import './hints.css';

export type { TaskType };
export { PAIRS_PEEK_MS };
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

const el = (tag: string, cls = '', text = '') => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
const tap = (e: HTMLElement, fn: () => void) => e.addEventListener('pointerdown', (ev) => { ev.preventDefault(); fn(); });
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** The shake of a wrong answer must be seen before the hint, even when "try again" is silent and ends at once. */
const SHAKE_MS = 900;

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
 * `act` is what each step does on the panel; "pulse the answer" is the same for every task: `ok` pulses from that mistake on
 * (a task answered step by step has no single answer and no such step: `ok` is null).
 */
function hintOf(hint: Hint | null, ok: HTMLElement | null, act: Partial<Record<HintStep['do'], (step: HintStep) => void>>): Ctx['hint'] {
  if (!hint) return null;
  return { key: hint.key, show: (w) => {
    for (const step of hint.steps) {
      if (step.do === 'pulseAnswer') { if (w >= step.fromMistake) ok?.classList.add('pulse'); } else act[step.do]?.(step);
    }
  } };
}
/** Numbers every element one by one, aloud: the "let's count together" hint. A newer mistake stops the count: its own round will count again. */
async function countAloud(c: Ctx, list: HTMLElement[]) {
  const round = c.wrongs;
  for (const e of list) e.querySelector('i')?.remove();
  for (let i = 0; i < list.length && c.alive && c.wrongs === round; i++) { badge(list[i], i + 1); list[i].classList.add('hit'); c.hooks.number(i + 1); await wait(750); }
}

// Every type is described by its generator (`tasks/<type>.ts`, ARCH-09): the builder takes every random choice from
// `generate(level, rng)`, judges the inputs by the type's model and only draws; none of them asks `c.rng` itself.
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
    const spec = odd.generate(c.level, c.rng), st = odd.start(spec), right = odd.solution(spec, st)[0];
    const list = spec.body.things.map((s, i) => {
      const b = el('button', 'it big', s);
      tap(b, () => { if (odd.answer(spec, st, i) === 'right') { b.classList.add('yes'); c.right(); } else { b.classList.add('no'); c.wrong(b); } });
      c.stage.appendChild(b); return b;
    });
    c.cheat = () => list[right].dispatchEvent(new PointerEvent('pointerdown'));
    // The alike things share one frame, the odd one is left without: who belongs together is seen, not read.
    c.hint = hintOf(spec.hint, list[right], { frameAlike: () => list.forEach((b, i) => { if (i !== right) b.classList.add('alike'); }) });
    return spec.prompt;
  },
  pairs(c) {
    const spec = pairs.generate(c.level, c.rng), st = pairs.start(spec), { deck, cols, peekMs } = spec.body;
    c.stage.classList.add('cards'); c.stage.style.setProperty('--cols', String(cols));
    // Memory has no "wrong" move: a miss is only counted by the model, never scolded or hinted (no `c.wrong`, `hint: null`).
    let lock = false, peeking = true;
    const cards = deck.map((s, i) => {
      const b = el('button', 'mcard'); b.appendChild(el('span', '', s)); b.dataset.s = s;
      tap(b, async () => {
        if (peeking || lock) return;
        const first = st.open[0], out = pairs.answer(spec, st, i);
        if (out === 'ignored') return;
        b.classList.add('open');
        if (out === 'miss') { lock = true; await wait(800); cards[first].classList.remove('open'); b.classList.remove('open'); lock = false; }
        else if (st.done[i]) {
          cards[first].classList.add('done'); b.classList.add('done'); c.hooks.good();
          if (out === 'right') { c.wrongs = pairs.result!(spec, st, c.wrongs); c.right(); }
        }
      });
      c.stage.appendChild(b); return b;
    });
    c.cheat = () => { cards.forEach((b) => b.classList.add('open', 'done')); st.open = []; st.done.fill(true); c.right(); };
    // The opening peek shows the faces through the stage, so the cards themselves stay as they are: taps meanwhile
    // open nothing and are not counted. A task that is over by then (solved or closed) is left alone.
    c.stage.classList.add('peek');
    setTimeout(() => { if (!c.alive) return; peeking = false; c.stage.classList.remove('peek'); }, peekMs);
    return spec.prompt;
  },
  order(c) {
    const spec = order.generate(c.level, c.rng), st = order.start(spec);
    const btns = new Map<number, HTMLElement>();
    for (const v of spec.body.shown) {
      const b = el('button', 'opt num', String(v)); btns.set(v, b);
      tap(b, () => {
        const at = st.next, out = order.answer(spec, st, v);
        if (out === 'ignored') return;
        if (out === 'wrong') { b.classList.add('no'); setTimeout(() => b.classList.remove('no'), 400); c.wrong(); return; }
        b.classList.add('yes'); b.style.order = String(at - 100); c.hooks.number(v);
        if (out === 'right') c.right(); else c.hooks.good();
      });
      c.stage.appendChild(b);
    }
    c.cheat = () => { for (const v of order.solution(spec, st)) btns.get(v)!.dispatchEvent(new PointerEvent('pointerdown')); };
    c.hint = hintOf(spec.hint, null, { pulseNext: () => { btns.get(order.solution(spec, st)[0])?.classList.add('pulse'); } });
    return spec.prompt;
  },
  sort(c) {
    const spec = sort.generate(c.level, c.rng), st = sort.start(spec), { colors, queue } = spec.body;
    const cur = el('div', 'gem current'); c.stage.appendChild(cur);
    const baskets = new Map<string, HTMLElement>();
    const show = () => { cur.className = 'gem current ' + queue[st.pos]; cur.style.animation = 'none'; void cur.offsetWidth; cur.style.animation = ''; };
    for (const col of colors) {
      const b = el('button', 'basket ' + col); baskets.set(col, b);
      tap(b, () => {
        const out = sort.answer(spec, st, col);
        if (out === 'ignored') return;
        if (out === 'wrong') { b.classList.add('no'); setTimeout(() => b.classList.remove('no'), 400); c.wrong(); return; }
        b.appendChild(el('div', 'gem small ' + col)); baskets.forEach((x) => x.classList.remove('pulse'));
        if (out === 'step') { c.hooks.good(); show(); } else { cur.remove(); c.right(); }
      });
      c.opts.appendChild(b);
    }
    show();
    c.cheat = () => { for (const col of sort.solution(spec, st)) baskets.get(col)!.dispatchEvent(new PointerEvent('pointerdown')); };
    c.hint = hintOf(spec.hint, null, { pulseNext: () => { baskets.get(sort.solution(spec, st)[0])?.classList.add('pulse'); } });
    return spec.prompt;
  },
  simon(c) {
    const spec = simon.generate(c.level, c.rng), { pads, seq, repeat } = spec.body;
    const btns = new Map<string, HTMLElement>();
    let st = simon.start(spec), showing = true;
    // The show of the sequence; after it the child repeats from the start.
    const play = async () => {
      showing = true; st = simon.start(spec); c.stage.classList.add('watch');
      await wait(600);
      for (const s of seq) { if (!c.alive) return; const b = btns.get(s)!; b.classList.add('flash'); c.hooks.good(); await wait(620); b.classList.remove('flash'); await wait(180); }
      if (!c.alive) return;   // closed or solved during the last flash: say nothing, leave the stage alone
      c.stage.classList.remove('watch'); showing = false; c.hooks.prompt(repeat);
    };
    for (const s of pads) {
      const b = el('button', 'it big pad', s); btns.set(s, b);
      tap(b, () => {
        if (showing) return;
        const out = simon.answer(spec, st, s);
        if (out === 'wrong') { b.classList.add('no'); setTimeout(() => b.classList.remove('no'), 400); c.wrong(); return; }
        b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 250);
        if (out === 'right') c.right(); else c.hooks.good();
      });
      c.stage.appendChild(b);
    }
    c.hint = hintOf(spec.hint, null, { replay: () => { void play(); } });
    c.cheat = () => { showing = false; for (const s of simon.solution(spec, st)) btns.get(s)!.dispatchEvent(new PointerEvent('pointerdown')); };
    void play();
    return spec.prompt;
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
