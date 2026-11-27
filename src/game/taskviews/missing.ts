/**
 * The panel show of "the missing addend" (LEARN-06): the known addend as things, "+", the empty place "?", "=", the sum
 * as a number, and the answer numbers. Across the ten (level 5) the things stand in a ten frame, so the empty cells
 * show how far it is to ten. Drawn by `compose.css`, shared with the number house.
 */
import { missing, type MissingSpec } from '../tasks/missing';
import { el, items, options, pulseOf, wait, type PanelCtx } from './panel';
import { tenFrames } from './tenframe';
import { hintOf } from './flow';
import './compose.css';
import { cpaOf } from '../tasks/cpa';
import { asNumber } from './cpa';

/**
 * Counting up (rung 2 of HINTS.md for the composition of a number): from the number that is there, dots come one by
 * one, each with the next number up to `to` (4, 5, 6, 7), placed by `put`; then the dots are counted again, 1, 2, 3, 4 -
 * that many were missing. A newer mistake stops the count: its own round shows what it shows.
 */
export async function countUp(c: PanelCtx, from: number, to: number, put: (dot: HTMLElement) => void) {
  const round = c.wrongs, still = () => c.alive && c.wrongs === round;
  const dots: HTMLElement[] = [];
  for (let n = from + 1; n <= to && still(); n++) {
    const dot = el('span', 'up');
    dot.appendChild(el('i', '', String(n)));
    put(dot); dots.push(dot); c.hooks.number(n);
    await wait(750);
  }
  for (let i = 0; i < dots.length && still(); i++) {
    dots[i].querySelector('i')!.textContent = String(i + 1);
    dots[i].classList.add('on'); c.hooks.number(i + 1);
    await wait(750);
  }
}

export function missingView(spec: MissingSpec, c: PanelCtx) {
  const st = missing.start(spec), { a, sum, thing, tilt } = spec.body, framed = sum > 10 || c.framed === true;   // c.framed: the abacus
  const known = el('div', framed ? 'group framed' : 'group'), gap = el('div', 'gap');
  const q = el('span', 'sign q', '?');
  gap.appendChild(q);
  c.stage.append(known, el('span', 'sign', '+'), gap, el('span', 'sign', '='), el('span', 'sign sum', String(sum)));
  const things = items(known, thing, tilt);
  if (framed) tenFrames(known, things, true);
  // the step of the world (src/game/tasks/cpa.ts): 2 and 3 - the known addend as its number; the hint shows its things
  const step = cpaOf(spec.level);
  if (step > 1) c.stage.dataset.cpa = String(step);
  const open = step === 1 ? () => {} : asNumber(known, a);
  // the hint's dots take the place of "?" (q.remove below): then the answer does not fly
  const ok = options(c, spec.body.options, (v) => missing.answer(spec, st, v) === 'right', { at: () => (q.isConnected ? q : null), row: () => [...c.stage.children] as HTMLElement[] });
  c.hint = hintOf(spec.hint, pulseOf(ok), {
    countUp: () => {
      open();
      // The number of the known addend over its group, then the dots: into the empty cells of its frame up to ten
      // first (across the ten), the rest in the empty place of "?".
      known.appendChild(el('em', '', String(a)));
      q.remove();
      void countUp(c, a, sum, (dot) => { const cell = known.querySelector('.tf-e'); if (cell) cell.replaceWith(dot); else gap.appendChild(dot); });
    },
  });
}
