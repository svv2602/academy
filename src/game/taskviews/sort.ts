/** The panel show of "sort" (ARCH-09): the current gem on the stage, and a basket of each colour to drop it in. */
import { sort, type SortSpec } from '../tasks/sort';
import { el, tap, type PanelCtx } from './panel';
import { hintOf } from './flow';

export function sortView(spec: SortSpec, c: PanelCtx) {
  const st = sort.start(spec), { colors, queue } = spec.body;
  const cur = el('div', 'gem current'); c.stage.appendChild(cur);
  const baskets = new Map<string, HTMLElement>();
  const show = () => { cur.className = 'gem current ' + queue[st.pos]; cur.style.animation = 'none'; void cur.offsetWidth; cur.style.animation = ''; };
  for (const col of colors) {
    const b = el('button', 'basket ' + col); baskets.set(col, b);
    tap(b, () => {
      const out = sort.answer(spec, st, col);
      if (out === 'ignored') return;
      if (out === 'wrong') { b.classList.add('no'); setTimeout(() => b.classList.remove('no'), 400); c.wrong(); return; }
      b.appendChild(el('div', 'gem small ' + col)); baskets.forEach((x) => x.classList.remove('pulse'));
      if (out === 'step') { c.hooks.good(); show(); } else { cur.remove(); c.right(); }
    });
    c.opts.appendChild(b);
  }
  show();
  c.cheat = () => { for (const col of sort.solution(spec, st)) baskets.get(col)!.dispatchEvent(new PointerEvent('pointerdown')); };
  c.hint = hintOf(spec.hint, null, { pulseNext: () => { baskets.get(sort.solution(spec, st)[0])?.classList.add('pulse'); } });
}
