/** The panel show of "pairs" (ARCH-09): memory cards, every face shown at the start, then found two by two. */
import { pairs, type PairsSpec } from '../tasks/pairs';
import { el, tap, wait, type PanelCtx } from './panel';

export function pairsView(spec: PairsSpec, c: PanelCtx) {
  const st = pairs.start(spec), { deck, cols, peekMs } = spec.body;
  c.stage.classList.add('cards'); c.stage.style.setProperty('--cols', String(cols));
  // Memory has no "wrong" move: a miss is only counted by the model, never scolded or hinted (no `c.wrong`, `hint: null`).
  let lock = false, peeking = true;
  const cards = deck.map((s, i) => {
    const b = el('button', 'mcard'); b.appendChild(el('span', '', s)); b.dataset.s = s;
    tap(b, async () => {
      if (peeking || lock) return;
      const first = st.open[0], out = pairs.answer(spec, st, i);
      if (out === 'ignored') return;
      b.classList.add('open');
      if (out === 'miss') { lock = true; await wait(800); cards[first].classList.remove('open'); b.classList.remove('open'); lock = false; }
      else if (st.done[i]) {
        cards[first].classList.add('done'); b.classList.add('done'); c.hooks.good();
        if (out === 'right') { c.wrongs = pairs.result!(spec, st, c.wrongs); c.right(); }
      }
    });
    c.stage.appendChild(b); return b;
  });
  c.cheat = () => { cards.forEach((b) => b.classList.add('open', 'done')); st.open = []; st.done.fill(true); c.right(); };
  // The opening peek shows the faces through the stage, so the cards themselves stay as they are: taps meanwhile
  // open nothing and are not counted. A task that is over by then (solved or closed) is left alone.
  c.stage.classList.add('peek');
  setTimeout(() => { if (!c.alive) return; peeking = false; c.stage.classList.remove('peek'); }, peekMs);
}
