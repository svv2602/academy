/**
 * The panel show of "add" (ARCH-09): two groups of things, "+", "=", "?", and the answer numbers. From level 4 each
 * group lays its things out in ten frames, one under another (LEARN-04).
 */
import { add, type AddSpec } from '../tasks/add';
import { countAloud, el, items, options, pulseOf, type PanelCtx } from './panel';
import { FRAMES_FROM, countOn, fillTen, tenFrames } from './tenframe';
import { hintOf } from './flow';
import { cpaOf } from '../tasks/cpa';
import { asNumber, markStep } from './cpa';

export function addView(spec: AddSpec, c: PanelCtx) {
  const st = add.start(spec), { a, thing, tilt } = spec.body, framed = spec.level >= FRAMES_FROM || c.framed === true;   // c.framed: the abacus
  const ga = el('div', framed ? 'group framed' : 'group'), gb = el('div', framed ? 'group framed' : 'group');
  const q = el('span', 'sign q', '?');
  c.stage.append(ga, el('span', 'sign', '+'), gb, el('span', 'sign', '='), q);
  const all = [...items(ga, thing, tilt.slice(0, a)), ...items(gb, thing, tilt.slice(a))];
  if (framed) { tenFrames(ga, all.slice(0, a), true); tenFrames(gb, all.slice(a), true); }
  // the step of the world (src/game/tasks/cpa.ts): 2 - the first group as its number (counting on from it), 3 - both;
  // the hint opens the things again, as do the answer
  const step = cpaOf(spec.level);
  markStep(c.stage, step);
  const backs = step === 1 ? [] : [asNumber(ga, a), ...(step === 3 ? [asNumber(gb, all.length - a)] : [])];
  const open = () => backs.forEach((b) => b());
  const ok = options(c, spec.body.options, (v) => add.answer(spec, st, v) === 'right', { at: () => q, row: () => [...c.stage.children] as HTMLElement[] });
  ok.addEventListener('pointerdown', open);
  c.hint = hintOf(spec.hint, pulseOf(ok), {
    countAloud: () => { open(); void countAloud(c, all); },
    countOn: () => { open(); void countOn(c, all); },
    fillTen: () => { open(); const first = ga.querySelector<HTMLElement>('.tf'); if (first) void fillTen(c, first, a, all.slice(a)); },
  });
}
