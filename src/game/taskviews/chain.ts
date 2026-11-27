/**
 * The panel show of a chain of two actions (LEARN-27): the things in ten frames show the first number and the first
 * action - the ones it added stand after the first ones, marked; the ones it took away are greyed out at the end - and
 * under them stands the example in numbers, "8 + 5 − 6 = ?". The second action is the child's to do in her head.
 * Drawn by `wide.css`.
 */
import { chain, type ChainSpec } from '../tasks/chain';
import { el, items, options, pulseOf, wait, type PanelCtx } from './panel';
import { TEN, tenFrames } from './tenframe';
import { hintOf } from './flow';
import './wide.css';

/**
 * A number that goes on with an action played one thing at a time (rung 2 of a chain and of a story, h2_chain: "action
 * by action"): `em` shows `from` and the cat says it; then `count` times `each(i)` plays one thing, and the number -
 * one more or one less - is shown and said. A newer mistake stops it: its own round shows what it shows.
 */
export async function runOn(c: PanelCtx, em: HTMLElement, from: number, up: boolean, count: number, each: (i: number) => void) {
  const round = c.wrongs, still = () => c.alive && c.wrongs === round;
  em.textContent = String(from); c.hooks.number(from);
  await wait(900);
  for (let i = 1; i <= count && still(); i++) {
    each(i);
    const n = up ? from + i : from - i;
    em.textContent = String(n); c.hooks.number(n);
    await wait(750);
  }
}

/** A thing that comes takes the cell of one that left, else an empty cell, else the first cell of a new frame. */
function place(box: HTMLElement, thing: HTMLElement) {
  const cell = box.querySelector('.tf > .it.gone') ?? box.querySelector('.tf > .tf-e');
  if (cell) { cell.replaceWith(thing); return; }
  const frame = el('div', 'tf');
  frame.appendChild(thing);
  for (let i = 1; i < TEN; i++) frame.appendChild(el('span', 'tf-e'));
  box.querySelector('.tens')?.appendChild(frame);
}

export function chainView(spec: ChainSpec, c: PanelCtx) {
  const st = chain.start(spec), { first, addsFirst, second, third, mid, thing, tilt } = spec.body;
  const row = el('div', 'things'), box = el('div', 'group framed');
  row.appendChild(box);
  const list = items(box, thing, tilt);
  tenFrames(box, list);
  // the first action, on the things: what it added, or what it took away
  if (addsFirst) list.slice(first).forEach((x) => x.classList.add('more'));
  else list.slice(mid).forEach((x) => x.classList.add('gone'));
  const q = el('span', 'sign q', '?');
  const sign = (adds: boolean) => el('span', 'sign', adds ? '+' : '−');
  const done = [el('span', 'sign n', String(first)), sign(addsFirst), el('span', 'sign n', String(second))];
  const example = [...done, sign(!addsFirst), el('span', 'sign n', String(third)), el('span', 'sign', '='), q];
  c.stage.append(row, ...example);
  const ok = options(c, spec.body.options, (v) => chain.answer(spec, st, v) === 'right', { at: () => q, row: () => example });
  c.hint = hintOf(spec.hint, pulseOf(ok), {
    // Rung 2 (h2_chain): the number after the first action over the things, the first action of the example marked as
    // done; then the second action thing by thing - the last ones leave, or new ones come - and the number goes on.
    showMid: () => {
      box.querySelector('em')?.remove();
      const em = el('em');
      box.appendChild(em);
      done.forEach((x) => x.classList.add('done'));
      void runOn(c, em, mid, !addsFirst, third, (i) => {
        if (addsFirst) list[mid - i].classList.add('away');
        else place(box, el('span', 'it more', thing));
      });
    },
  });
}
