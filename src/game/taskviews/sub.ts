/**
 * The panel show of "sub" (ARCH-09) by the step of the world (src/game/tasks/cpa.ts): 1 - the things, the ones taken
 * away greyed out; 2 - every thing coloured and "− k" by the basket, the k go into it only after the answer; 3 - "Було
 * N, k забрали" in numbers by a closed basket, the things only after the answer or in a hint. From level 4 the things
 * stand in ten frames (LEARN-04). The hints count the things at every step (they open them on the step of numbers).
 */
import { sub, type SubSpec } from '../tasks/sub';
import { countAloud, items, options, pulseOf, type PanelCtx } from './panel';
import { FRAMES_FROM, countOn, takeToTen, tenFrames } from './tenframe';
import { hintOf } from './flow';
import { cpaOf } from '../tasks/cpa';
import { basket, line, markStep, takeAway, things } from './cpa';
import { tf } from '../../ui/strings';

export function subView(spec: SubSpec, c: PanelCtx) {
  const st = sub.start(spec), { total, gone } = spec.body, step = cpaOf(spec.level);
  markStep(c.stage, step);   // the first step draws exactly as it always did
  if (step === 3) line(c.stage, tf('cpa_sub', { n: total, k: gone }));
  const box = step === 1 ? null : things(c.stage, step === 3);
  const list = items(box?.box ?? c.stage, spec.body.thing, spec.body.tilt);
  if (spec.level >= FRAMES_FROM || c.framed) tenFrames(box?.box ?? c.stage, list);   // c.framed: the abacus (src/game/helpers.ts)
  const taken = list.slice(total - gone);
  if (step === 1) taken.forEach((x) => x.classList.add('gone'));
  else basket(c.stage, gone, step === 3);
  const ok = options(c, spec.body.options, (v) => sub.answer(spec, st, v) === 'right');
  // the answer given: the things (opened) and the k of them into the basket
  if (step > 1) ok.addEventListener('pointerdown', () => { box?.open(); takeAway(taken); });
  // a hint shows the picture of the first step: the things, the ones taken greyed out
  const shown = (fn: () => void) => () => { box?.open(); taken.forEach((x) => x.classList.add('gone')); fn(); };
  c.hint = hintOf(spec.hint, pulseOf(ok), {
    countAloud: (step) => shown(() => { void countAloud(c, step.do === 'countAloud' && step.which === 'left' ? list.slice(0, total - gone) : list); })(),
    countOn: (step) => shown(() => { void countOn(c, step.do === 'countOn' && step.which === 'left' ? list.slice(0, total - gone) : list); })(),
    takeToTen: shown(() => { void takeToTen(c, list, total - gone); }),
  });
}
