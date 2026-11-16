/** The panel show of "simon" (ARCH-09): the pads, the sequence shown on them, then repeated by the child. */
import { simon, type SimonSpec } from '../tasks/simon';
import { el, tap, wait, type PanelCtx } from './panel';
import { hintOf } from './flow';

export function simonView(spec: SimonSpec, c: PanelCtx) {
  const { pads, seq, repeat } = spec.body;
  const btns = new Map<string, HTMLElement>();
  let st = simon.start(spec), showing = true;
  // The show of the sequence; after it the child repeats from the start.
  // `paired`: the replay of the hint on a long sequence (6 and 7 steps) pauses after each pair, as rung 1 advised.
  const play = async (paired = false) => {
    showing = true; st = simon.start(spec); c.stage.classList.add('watch');
    btns.forEach((b) => b.classList.remove('pulse'));
    await wait(600);
    for (const [i, s] of seq.entries()) {
      if (!c.alive) return;
      const b = btns.get(s)!; b.classList.add('flash'); c.hooks.good(); await wait(620); b.classList.remove('flash'); await wait(180);
      if (paired && i % 2 === 1) await wait(400);
    }
    if (!c.alive) return;   // closed or solved during the last flash: say nothing, leave the stage alone
    c.stage.classList.remove('watch'); showing = false; c.hooks.prompt(repeat);
  };
  for (const s of pads) {
    const b = el('button', 'it big pad', s); btns.set(s, b);
    tap(b, () => {
      if (showing) return;
      const out = simon.answer(spec, st, s);
      if (out === 'wrong') { b.classList.add('no'); setTimeout(() => b.classList.remove('no'), 400); c.wrong(); return; }
      btns.forEach((x) => x.classList.remove('pulse'));
      b.classList.add('flash'); setTimeout(() => b.classList.remove('flash'), 250);
      if (out === 'right') c.right(); else c.hooks.good();
    });
    c.stage.appendChild(b);
  }
  c.hint = hintOf(spec.hint, null, {
    replay: () => { void play(seq.length >= 6); },
    // rung 3: the pad to tap next pulses (not during a show: the child cannot tap then)
    pulseNext: () => { if (!showing) btns.get(simon.solution(spec, st)[0])?.classList.add('pulse'); },
  });
  c.cheat = () => { showing = false; for (const s of simon.solution(spec, st)) btns.get(s)!.dispatchEvent(new PointerEvent('pointerdown')); };
  void play();
}
