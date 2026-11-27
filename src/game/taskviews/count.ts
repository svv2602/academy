/**
 * The panel show of "count" (ARCH-09): the things, each a button the child may count by tapping, and the answer numbers.
 * From level 4 the things stand in ten frames (LEARN-05), so a whole ten is seen at once.
 */
import { count, type CountSpec } from '../tasks/count';
import { badge, countAloud, el, items, options, pulseOf, tap, type PanelCtx } from './panel';
import { FRAMES_FROM, countOn, tenFrames } from './tenframe';
import { hintOf } from './flow';
import { cpaOf } from '../tasks/cpa';
import { markStep, things } from './cpa';
import { CPA_PEEK_MS } from '../../core/tuning';
import { t } from '../../ui/strings';

export function countView(spec: CountSpec, c: PanelCtx) {
  const st = count.start(spec), { n } = spec.body, framed = spec.level >= FRAMES_FROM || c.framed === true;
  // the step of the world (src/game/tasks/cpa.ts): 2 - the things scattered, not in rows; 3 - shown for a moment
  // (CPA_PEEK_MS, seen at a glance), then hidden; «Ще раз» shows them again, as often as she likes, and costs nothing
  const step = cpaOf(spec.level);
  markStep(c.stage, step);
  const box = step === 3 ? things(c.stage, false) : null;
  const list = items(box?.box ?? c.stage, spec.body.thing, spec.body.tilt);
  if (framed) tenFrames(box?.box ?? c.stage, list);   // c.framed: the abacus (src/game/helpers.ts)
  if (step === 2 && !framed) {
    c.stage.classList.add('cpa-scatter');
    // the same scatter for the same task: from the place of each thing, no random number
    list.forEach((b, i) => { b.style.setProperty('--dx', `${((i * 37) % 11 - 5) * 3}px`); b.style.setProperty('--dy', `${((i * 53) % 9 - 4) * 5}px`); });
  }
  let peek: ReturnType<typeof setTimeout> | undefined, opened = false;
  const hide = () => { if (!opened && c.alive) box?.box.classList.add('hid'); };
  const show = () => { box?.box.classList.remove('hid'); clearTimeout(peek); peek = setTimeout(hide, CPA_PEEK_MS); };
  // opened by the hint (or the answer) they stay: «Ще раз» no longer hides them
  const open = () => { opened = true; clearTimeout(peek); box?.box.classList.remove('hid'); };
  if (box) {
    const again = el('button', 'cpa-again', t('cpa_again'));
    tap(again, show);
    const row = el('div', 'cpa-again-row');
    row.appendChild(again);
    c.stage.appendChild(row);
    show();
  }
  let counted = 0;
  list.forEach((b) => tap(b, () => { if (!b.classList.contains('hit')) { b.classList.add('hit'); badge(b, ++counted); c.own = c.wrongs; c.hooks.number(counted); } }));
  const ok = options(c, spec.body.options, (v) => count.answer(spec, st, v) === 'right');
  ok.addEventListener('pointerdown', open);
  c.hint = hintOf(spec.hint, pulseOf(ok), {
    countAloud: () => { open(); counted = n; void countAloud(c, list); },
    countOn: () => { open(); counted = n; void countOn(c, list); },
  });
}
