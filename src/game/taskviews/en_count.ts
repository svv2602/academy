/**
 * The panel show of "how many? - let's count!" in English (../tasks/en_count.ts): the show of "count", every number said
 * in English - a thing tapped, the count of the hint, the digit chosen.
 */
import { en_count, numberClip, type EnCountSpec } from '../tasks/en_count';
import { enVoice } from '../../s2/types';
import { badge, items, options, pulseOf, tap, type PanelCtx } from './panel';
import { hintOf } from './flow';

const sayNumber = (n: number) => { const k = numberClip(n); return k ? enVoice().say(k) : Promise.resolve(); };

export function enCountView(spec: EnCountSpec, c: PanelCtx) {
  const st = en_count.start(spec);
  const list = items(c.stage, spec.body.thing, spec.body.tilt);
  let counted = 0;
  list.forEach((b) => tap(b, () => { if (!b.classList.contains('hit')) { b.classList.add('hit'); badge(b, ++counted); c.own = c.wrongs; void sayNumber(counted); } }));
  const ok = options(c, spec.body.options, (v) => en_count.answer(spec, st, v) === 'right');
  // the digit chosen is said in English, right or not
  for (const b of c.opts.querySelectorAll<HTMLElement>('.opt')) tap(b, () => { void sayNumber(Number(b.textContent)); });
  c.hint = hintOf(spec.hint, pulseOf(ok), {
    countAloud: () => {
      counted = spec.body.n;
      const round = c.wrongs;
      void (async () => {
        for (const e of list) e.querySelector('i')?.remove();
        for (let i = 0; i < list.length && c.alive && c.wrongs === round; i++) { badge(list[i], i + 1); list[i].classList.add('hit'); await sayNumber(i + 1); }
      })();
    },
  });
}
