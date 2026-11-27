/**
 * The panel show of the missing number of a take away (LEARN-27): the things in ten frames, the ones taken away greyed
 * out at the end, and under them the example in numbers, "13 − ? = 6", with the answer numbers. Drawn by `wide.css`.
 */
import { gap, type GapSpec } from '../tasks/gap';
import { countAloud, el, items, options, pulseOf, type PanelCtx } from './panel';
import { tenFrames } from './tenframe';
import { hintOf } from './flow';
import './wide.css';

export function gapView(spec: GapSpec, c: PanelCtx) {
  const st = gap.start(spec), { total, left, thing, tilt } = spec.body;
  const box = el('div', 'things');
  const list = items(box, thing, tilt);
  tenFrames(box, list);
  const gone = list.slice(left);
  gone.forEach((x) => x.classList.add('gone'));
  const q = el('span', 'sign q', '?');
  const row = [el('span', 'sign n', String(total)), el('span', 'sign', '−'), q, el('span', 'sign', '='), el('span', 'sign n', String(left))];
  c.stage.append(box, ...row);
  const ok = options(c, spec.body.options, (v) => gap.answer(spec, st, v) === 'right', { at: () => q, row: () => row });
  // Rung 2 (h2_gap): the things taken away are counted aloud, one by one; each lights up as it is counted.
  c.hint = hintOf(spec.hint, pulseOf(ok), { countGone: () => { void countAloud(c, gone); } });
}
