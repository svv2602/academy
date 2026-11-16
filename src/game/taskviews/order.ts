/** The panel show of "order" (ARCH-09): the numbers, tapped from the smallest up. */
import { order, type OrderSpec } from '../tasks/order';
import { el, tap, wait, type PanelCtx } from './panel';
import { hintOf } from './flow';
import './twenty.css';   // two-digit numbers on the buttons of level 5

/**
 * Rung 2 of the hint (`h2_order`): a number track 1..10 (1..20 on level 5) under the buttons; the cat walks it from 1,
 * each number lights as it is said, and the numbers that are on the buttons stay marked. The buttons do not pulse.
 */
async function walk(c: PanelCtx, spec: OrderSpec) {
  const round = c.wrongs, top = spec.level >= 5 ? 20 : 10, last = spec.body.sorted.at(-1)!;
  c.stage.querySelector('.track')?.remove();
  const track = el('div', 'track'); track.setAttribute('aria-hidden', 'true');
  const cells = Array.from({ length: top }, (_, i) => track.appendChild(el('span', '', String(i + 1))));
  c.stage.appendChild(track);
  for (let v = 1; v <= last && c.alive && c.wrongs === round; v++) {
    cells.forEach((x) => x.classList.remove('on'));
    cells[v - 1].classList.add('on');
    if (spec.body.shown.includes(v)) cells[v - 1].classList.add('mark');
    c.hooks.number(v); await wait(750);
  }
  cells.forEach((x) => x.classList.remove('on'));
}

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
  c.hint = hintOf(spec.hint, null, {
    track: () => { void walk(c, spec); },
    pulseNext: () => { btns.get(order.solution(spec, st)[0])?.classList.add('pulse'); },
  });
}
