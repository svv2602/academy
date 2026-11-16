/** The panel show of "order" (ARCH-09): the numbers, tapped from the smallest up. */
import { order, type OrderSpec } from '../tasks/order';
import { el, tap, type PanelCtx } from './panel';
import { hintOf } from './flow';
import './twenty.css';   // two-digit numbers on the buttons of level 5

export function orderView(spec: OrderSpec, c: PanelCtx) {
  const st = order.start(spec);
  const btns = new Map<number, HTMLElement>();
  for (const v of spec.body.shown) {
    const b = el('button', 'opt num', String(v)); btns.set(v, b);
    tap(b, () => {
      const at = st.next, out = order.answer(spec, st, v);
      if (out === 'ignored') return;
      if (out === 'wrong') { b.classList.add('no'); setTimeout(() => b.classList.remove('no'), 400); c.wrong(); return; }
      b.classList.add('yes'); b.style.order = String(at - 100); c.hooks.number(v);
      if (out === 'right') c.right(); else c.hooks.good();
    });
    c.stage.appendChild(b);
  }
  c.cheat = () => { for (const v of order.solution(spec, st)) btns.get(v)!.dispatchEvent(new PointerEvent('pointerdown')); };
  c.hint = hintOf(spec.hint, null, { pulseNext: () => { btns.get(order.solution(spec, st)[0])?.classList.add('pulse'); } });
}
