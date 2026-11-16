/**
 * The panel show of "add" (ARCH-09): two groups of things, "+", "=", "?", and the answer numbers. From level 4 each
 * group lays its things out in ten frames, one under another (LEARN-04).
 */
import { add, type AddSpec } from '../tasks/add';
import { countAloud, el, items, options, pulseOf, type PanelCtx } from './panel';
import { FRAMES_FROM, countOn, fillTen, tenFrames } from './tenframe';
import { hintOf } from './flow';

export function addView(spec: AddSpec, c: PanelCtx) {
  const st = add.start(spec), { a, thing, tilt } = spec.body, framed = spec.level >= FRAMES_FROM;
  const ga = el('div', framed ? 'group framed' : 'group'), gb = el('div', framed ? 'group framed' : 'group');
  c.stage.append(ga, el('span', 'sign', '+'), gb, el('span', 'sign', '='), el('span', 'sign q', '?'));
  const all = [...items(ga, thing, tilt.slice(0, a)), ...items(gb, thing, tilt.slice(a))];
  if (framed) { tenFrames(ga, all.slice(0, a), true); tenFrames(gb, all.slice(a), true); }
  const ok = options(c, spec.body.options, (v) => add.answer(spec, st, v) === 'right');
  c.hint = hintOf(spec.hint, pulseOf(ok), {
    countAloud: () => { void countAloud(c, all); },
    countOn: () => { void countOn(c, all); },
    fillTen: () => { const first = ga.querySelector<HTMLElement>('.tf'); if (first) void fillTen(c, first, a, all.slice(a)); },
  });
}
