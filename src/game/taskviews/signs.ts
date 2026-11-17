/**
 * The panel show of the signs (LEARN-09): number, the empty place of the sign, number, and the three sign buttons.
 * Drawn by `signs.css`.
 */
import { signs, type SignsSpec } from '../tasks/signs';
import { el, options, pulseOf, tap, wait, type PanelCtx } from './panel';
import { tenFrames } from './tenframe';
import { hintOf } from './flow';
import './signs.css';

/**
 * Rung 2 of the signs (`h2_signs`, HINTS.md; R13 "the hint shows both numbers as things"): under each number its things
 * in ten frames, then matched in pairs one to one - the same cell of both frames, pair by pair - and the things of the
 * larger number left without a pair glow softly (equal numbers leave none). A newer mistake stops the matching.
 */
async function pairUp(c: PanelCtx, spec: SignsSpec, sides: HTMLElement[]) {
  const round = c.wrongs, { a, b, thing } = spec.body;
  const groups = [a, b].map((n, i) => {
    sides[i].querySelector('.tens')?.remove();
    const things = Array.from({ length: n }, () => el('span', 'pt', thing));
    tenFrames(sides[i], things);
    return things;
  });
  const both = Math.min(a, b);
  for (let k = 0; k < both && c.alive && c.wrongs === round; k++) {
    groups[0][k].classList.add('pair'); groups[1][k].classList.add('pair');
    await wait(220);
  }
  if (c.alive && c.wrongs === round) for (const g of groups) g.slice(both).forEach((e) => e.classList.add('extra'));
}

/** The panel show of the signs (LEARN-09): number, the empty place of the sign, number; the buttons `>`, `<`, `=`. */
export function signsView(spec: SignsSpec, c: PanelCtx) {
  const st = signs.start(spec), { a, b } = spec.body;
  const side = (n: number) => { const s = el('div', 'side'); s.appendChild(el('b', 'n', String(n))); return s; };
  const sides = [side(a), side(b)];
  const slot = el('span', 'slot', '?');
  c.stage.append(sides[0], slot, sides[1]);
  const ok = options(c, spec.body.options, (v) => signs.answer(spec, st, v) === 'right');
  // The sign the child put stands between the numbers.
  tap(ok, () => { slot.textContent = spec.body.answer; slot.classList.add('set'); });
  c.hint = hintOf(spec.hint, pulseOf(ok), { pairUp: () => { void pairUp(c, spec, sides); } });
}
