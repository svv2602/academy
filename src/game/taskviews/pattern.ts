/** The panel show of "pattern" (ARCH-09): the row of colours, a question mark, and the three colours to choose from. */
import { pattern, type PatternSpec } from '../tasks/pattern';
import { el, options, pulseOf, type PanelCtx } from './panel';
import { hintOf } from './flow';

export function patternView(spec: PatternSpec, c: PanelCtx) {
  const st = pattern.start(spec), { unit, row } = spec.body;
  row.forEach((s, i) => { const x = el('span', 'it still', s); x.dataset.u = String(i % unit.length); c.stage.appendChild(x); });
  c.stage.appendChild(el('span', 'it still q', '?'));
  const ok = options(c, spec.body.options, (v) => pattern.answer(spec, st, v) === 'right');
  c.hint = hintOf(spec.hint, pulseOf(ok), { markUnits: () => { c.stage.classList.add('units'); } });
}
