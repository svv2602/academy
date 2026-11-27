/**
 * The panel show of the signs (LEARN-09): number, the empty place of the sign, number, and the three sign buttons.
 * Drawn by `signs.css`.
 */
import { signs, type SignsSpec } from '../tasks/signs';
import { el, options, pulseOf, wait, type PanelCtx } from './panel';
import { tenFrames } from './tenframe';
import { hintOf } from './flow';
import './signs.css';

/**
 * Rung 2 of the signs (`h2_signs`, HINTS.md; R13 "the hint shows both numbers as things"): under each number its things
 * in ten frames, then matched in pairs one to one - the same cell of both frames, pair by pair - and the things of the
 * larger number left without a pair glow softly (equal numbers leave none). A newer mistake stops the matching.
 * Comparing two examples (./exprs.ts) lays out what each of them comes to the same way.
 */
export async function pairThings(c: PanelCtx, [a, b]: readonly [number, number], thing: string, sides: readonly HTMLElement[]) {
  const round = c.wrongs;
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
  // The abacus (src/game/helpers.ts): under each number its things in ten frames, not matched - the matching is the
  // second rung of the hint.
  if (c.framed) [a, b].forEach((n, i) => tenFrames(sides[i], Array.from({ length: n }, () => el('span', 'pt', spec.body.thing))));
  // The sign the child put flies in and stands between the numbers (./fly.ts; `.got` is drawn as the placed sign).
  const ok = options(c, spec.body.options, (v) => signs.answer(spec, st, v) === 'right', { at: () => slot, row: () => [sides[0], slot, sides[1]] });
  c.hint = hintOf(spec.hint, pulseOf(ok), { pairUp: () => { void pairThings(c, [a, b], spec.body.thing, sides); } });
}
