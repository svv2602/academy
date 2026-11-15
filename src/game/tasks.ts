/**
 * Panel mini-games: ten task types, each generated for a difficulty level 1..3.
 * A task never punishes: a wrong tap shakes, the cat encourages, and a type-specific hint follows.
 * After a mistake the order is fixed: "try again" to its end, then the whole spoken hint, then the solution
 * is shown. The child may answer at any moment of that; nothing waits for the cat to finish.
 *
 * The panel itself is `taskviews/panel.ts` (ARCH-09): it shows a task's description, the order after a mistake is
 * `taskviews/flow.ts`, the shows of count, add, sub, compare and pattern are `taskviews/<type>.ts`. The shows of the
 * other five types are still here and are handed to the panel; this file keeps its old exports for its importers.
 */
import type { TaskType } from './tasks/types';
import type { OddSpec } from './tasks/odd';
import type { PairsSpec } from './tasks/pairs';
import type { OrderSpec } from './tasks/order';
import type { SortSpec } from './tasks/sort';
import type { SimonSpec } from './tasks/simon';
import { odd } from './tasks/odd';
import { pairs, PAIRS_PEEK_MS } from './tasks/pairs';
import { order } from './tasks/order';
import { sort } from './tasks/sort';
import { simon } from './tasks/simon';
import { addPanelViews, el, pulseOf, tap, wait, type PanelCtx } from './taskviews/panel';
import { hintOf } from './taskviews/flow';
import './hints.css';

export type { TaskType };
export { PAIRS_PEEK_MS };
export { cheatTask, runTask } from './taskviews/panel';
export type { TaskHooks, TaskResult } from './taskviews/panel';
export type Skill = 'count' | 'add' | 'sub' | 'compare' | 'logic';
export const SKILL: Record<TaskType, Skill> = {
  count: 'count', add: 'add', sub: 'sub', compare: 'compare', pattern: 'logic', odd: 'logic', pairs: 'logic', order: 'logic', sort: 'logic', simon: 'logic',
};

// The shows of the other five types: each draws its task's description (`tasks/<type>.ts`) and judges the inputs by the
// type's model; none of them draws a random number.
function oddView(spec: OddSpec, c: PanelCtx) {
  const st = odd.start(spec), right = odd.solution(spec, st)[0];
  const list = spec.body.things.map((s, i) => {
    const b = el('button', 'it big', s);
    tap(b, () => { if (odd.answer(spec, st, i) === 'right') { b.classList.add('yes'); c.right(); } else { b.classList.add('no'); c.wrong(b); } });
    c.stage.appendChild(b); return b;
  });
  c.cheat = () => list[right].dispatchEvent(new PointerEvent('pointerdown'));
  // The alike things share one frame, the odd one is left without: who belongs together is seen, not read.
  c.hint = hintOf(spec.hint, pulseOf(list[right]), { frameAlike: () => list.forEach((b, i) => { if (i !== right) b.classList.add('alike'); }) });
}
function pairsView(spec: PairsSpec, c: PanelCtx) {
  const st = pairs.start(spec), { deck, cols, peekMs } = spec.body;
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
}
function orderView(spec: OrderSpec, c: PanelCtx) {
  const st = order.start(spec);
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
}
function sortView(spec: SortSpec, c: PanelCtx) {
  const st = sort.start(spec), { colors, queue } = spec.body;
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
}
function simonView(spec: SimonSpec, c: PanelCtx) {
  const { pads, seq, repeat } = spec.body;
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
}
addPanelViews({ odd: oddView, pairs: pairsView, order: orderView, sort: sortView, simon: simonView });
