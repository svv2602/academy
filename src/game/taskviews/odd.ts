/** The panel show of "odd" (ARCH-09): the things, one of which belongs to another group. */
import { odd, type OddSpec } from '../tasks/odd';
import { el, pulseOf, tap, type PanelCtx } from './panel';
import { hintOf } from './flow';

export function oddView(spec: OddSpec, c: PanelCtx) {
  const st = odd.start(spec), right = odd.solution(spec, st)[0];
  const list = spec.body.things.map((s, i) => {
    const b = el('button', 'it big', s);
    tap(b, () => { if (odd.answer(spec, st, i) === 'right') { b.classList.add('yes'); c.right(); } else { b.classList.add('no'); c.wrong(b); } });
    c.stage.appendChild(b); return b;
  });
  c.cheat = () => list[right].dispatchEvent(new PointerEvent('pointerdown'));
  // The alike things share one frame, the odd one is left without: who belongs together is seen, not read.
  c.hint = hintOf(spec.hint, pulseOf(list[right]), { frameAlike: () => list.forEach((b, i) => { if (i !== right) b.classList.add('alike'); }) });
}
