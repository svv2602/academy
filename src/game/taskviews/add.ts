/** The panel show of "add" (ARCH-09): two groups of things, "+", "=", "?", and the answer numbers. */
import { add, type AddSpec } from '../tasks/add';
import { countAloud, el, items, options, pulseOf, type PanelCtx } from './panel';
import { hintOf } from './flow';

export function addView(spec: AddSpec, c: PanelCtx) {
  const st = add.start(spec), { a, thing, tilt } = spec.body;
  const ga = el('div', 'group'), gb = el('div', 'group');
  c.stage.append(ga, el('span', 'sign', '+'), gb, el('span', 'sign', '='), el('span', 'sign q', '?'));
  const all = [...items(ga, thing, tilt.slice(0, a)), ...items(gb, thing, tilt.slice(a))];
  const ok = options(c, spec.body.options, (v) => add.answer(spec, st, v) === 'right');
  c.hint = hintOf(spec.hint, pulseOf(ok), { countAloud: () => { void countAloud(c, all); } });
}
