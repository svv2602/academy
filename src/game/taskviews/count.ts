/** The panel show of "count" (ARCH-09): the things, each a button the child may count by tapping, and the numbers 1..10. */
import { count, type CountSpec } from '../tasks/count';
import { badge, countAloud, items, options, pulseOf, tap, type PanelCtx } from './panel';
import { hintOf } from './flow';

export function countView(spec: CountSpec, c: PanelCtx) {
  const st = count.start(spec), { n } = spec.body;
  const list = items(c.stage, spec.body.thing, spec.body.tilt);
  let counted = 0;
  list.forEach((b) => tap(b, () => { if (!b.classList.contains('hit')) { b.classList.add('hit'); badge(b, ++counted); c.own = c.wrongs; c.hooks.number(counted); } }));
  const ok = options(c, spec.body.options, (v) => count.answer(spec, st, v) === 'right');
  c.hint = hintOf(spec.hint, pulseOf(ok), { countAloud: () => { counted = n; void countAloud(c, list); } });
}
