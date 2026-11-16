/**
 * The panel show of "sort" (ARCH-09): the current gem on the stage, and a basket of each colour to drop it in.
 * Level 5 sorts figures by colour and shape: the basket of a colour shows its shape, the current gem is the figure.
 */
import { sort, type SortSpec } from '../tasks/sort';
import { figureOf } from '../tasks/odd';
import { el, tap, wait, type PanelCtx } from './panel';
import { hintOf } from './flow';
import { shapeEl } from './shapes';

/** The look of a gem that is a figure: no rotated square of colour, the figure itself (the colour stays as `--c`). */
const FIG_GEM = 'background:none;box-shadow:none;transform:none;display:grid;place-items:center';

export function sortView(spec: SortSpec, c: PanelCtx) {
  const st = sort.start(spec), { colors, queue } = spec.body, two = colors[0].includes(' ');
  const cur = el('div', 'gem current'); c.stage.appendChild(cur);
  const baskets = new Map<string, HTMLElement>();
  const show = () => {
    cur.className = 'gem current ' + queue[st.pos]; cur.style.animation = 'none'; void cur.offsetWidth; cur.style.animation = '';
    if (two) { cur.style.cssText += ';' + FIG_GEM; cur.replaceChildren(shapeEl(queue[st.pos], '100%')); }
  };
  // Two features: the baskets of the other colour go dim, then those of the other shape (rung 2); dropping a gem lights all again.
  const lit = () => baskets.forEach((x) => { x.style.opacity = ''; });
  for (const col of colors) {
    const b = el('button', 'basket ' + col); baskets.set(col, b);
    if (two) { const mark = shapeEl(col, '44px'); mark.style.opacity = '.45'; mark.style.flexBasis = '100%'; mark.style.height = '34px'; b.appendChild(mark); }
    tap(b, () => {
      const out = sort.answer(spec, st, col);
      if (out === 'ignored') return;
      if (out === 'wrong') { b.classList.add('no'); setTimeout(() => b.classList.remove('no'), 400); c.wrong(); return; }
      if (two) { const g = el('div', 'gem small ' + col); g.style.cssText = FIG_GEM; g.appendChild(shapeEl(col, '100%')); b.appendChild(g); }
      else b.appendChild(el('div', 'gem small ' + col));
      baskets.forEach((x) => x.classList.remove('pulse', 'try', 'own')); cur.classList.remove('glow'); lit();
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
  // Rung 2 of two features (`h2_sort_two`): first the colour, then the shape - the baskets that differ go dim, one is left.
  const dimOn = async () => {
    const round = c.wrongs, pos = st.pos, gem = figureOf(queue[pos]), live = () => c.alive && c.wrongs === round && st.pos === pos;
    cur.classList.add('glow'); lit();
    for (const differs of [(k: string) => figureOf(k).color !== gem.color, (k: string) => figureOf(k).shape !== gem.shape]) {
      await wait(900);
      if (!live()) return;
      baskets.forEach((b, k) => { if (differs(k)) b.style.opacity = '.3'; });
    }
    baskets.get(queue[pos])?.classList.add('own');
  };
  c.hint = hintOf(spec.hint, null, {
    tryBaskets: () => { void (two ? dimOn() : tryOn()); },
    pulseNext: () => { baskets.get(sort.solution(spec, st)[0])?.classList.add('pulse'); },
  });
}
