/**
 * The panel show of "sub" (ARCH-09): the things, the ones taken away greyed out at the end, and the answer numbers.
 * From level 4 the things stand in ten frames (LEARN-04).
 */
import { sub, type SubSpec } from '../tasks/sub';
import { countAloud, items, options, pulseOf, type PanelCtx } from './panel';
import { FRAMES_FROM, countOn, takeToTen, tenFrames } from './tenframe';
import { hintOf } from './flow';

export function subView(spec: SubSpec, c: PanelCtx) {
  const st = sub.start(spec), { total, gone } = spec.body;
  const list = items(c.stage, spec.body.thing, spec.body.tilt);
  if (spec.level >= FRAMES_FROM) tenFrames(c.stage, list);
  list.slice(total - gone).forEach((x) => x.classList.add('gone'));
  const ok = options(c, spec.body.options, (v) => sub.answer(spec, st, v) === 'right');
  c.hint = hintOf(spec.hint, pulseOf(ok), {
    countAloud: (step) => { void countAloud(c, step.do === 'countAloud' && step.which === 'left' ? list.slice(0, total - gone) : list); },
    countOn: (step) => { void countOn(c, step.do === 'countOn' && step.which === 'left' ? list.slice(0, total - gone) : list); },
    takeToTen: () => { void takeToTen(c, list, total - gone); },
  });
}
