/** The panel show of "sort" (ARCH-09): the current gem on the stage, and a basket of each colour to drop it in. */
import { sort, type SortSpec } from '../tasks/sort';
import { el, tap, wait, type PanelCtx } from './panel';
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
      b.appendChild(el('div', 'gem small ' + col)); baskets.forEach((x) => x.classList.remove('pulse', 'try', 'own')); cur.classList.remove('glow');
      if (out === 'step') { c.hooks.good(); show(); } else { cur.remove(); c.right(); }
    });
    c.opts.appendChild(b);
  }
  show();
  c.cheat = () => { for (const col of sort.solution(spec, st)) baskets.get(col)!.dispatchEvent(new PointerEvent('pointerdown')); };
  // Rung 2 (`h2_sort`): the gem glows in its colour and tries the baskets in turn; the basket of its colour keeps a frame.
  const tryOn = async () => {
    const round = c.wrongs, pos = st.pos, gem = queue[pos], live = () => c.alive && c.wrongs === round && st.pos === pos;
    cur.classList.add('glow');
    for (const [col, b] of baskets) {
      if (!live()) return;
      b.classList.add('try'); await wait(700); b.classList.remove('try');
      if (col === gem && live()) { b.classList.add('own'); return; }
    }
  };
  c.hint = hintOf(spec.hint, null, {
    tryBaskets: () => { void tryOn(); },
    pulseNext: () => { baskets.get(sort.solution(spec, st)[0])?.classList.add('pulse'); },
  });
}
