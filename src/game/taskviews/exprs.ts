/**
 * The panel show of comparing two examples (LEARN-27): example, the empty place of the sign, example, and the three
 * sign buttons - the show of the signs (./signs.ts) with an example where it has a number. Drawn by `signs.css` (the
 * stage carries the class of the signs too) and, for what differs, by `wide.css`.
 */
import { exprs, textOf, type ExprsSpec } from '../tasks/exprs';
import { el, options, pulseOf, type PanelCtx } from './panel';
import { pairThings } from './signs';
import { hintOf } from './flow';
import './wide.css';

export function exprsView(spec: ExprsSpec, c: PanelCtx) {
  const st = exprs.start(spec), { sides, thing } = spec.body;
  c.stage.classList.add('t-signs');
  const boxes = sides.map((s) => { const box = el('div', 'side'); box.appendChild(el('b', 'n', textOf(s))); return box; });
  const slot = el('span', 'slot', '?');
  c.stage.append(boxes[0], slot, boxes[1]);
  const ok = options(c, spec.body.options, (v) => exprs.answer(spec, st, v) === 'right', { at: () => slot, row: () => [boxes[0], slot, boxes[1]] });
  c.hint = hintOf(spec.hint, pulseOf(ok), {
    // Rung 2 (h2_exprs): under each example what it comes to - the number, then its things in ten frames matched in
    // pairs with the other side's, the ones left over of the larger value glowing.
    pairUp: () => {
      sides.forEach((s, i) => { boxes[i].querySelector('.val')?.remove(); boxes[i].appendChild(el('i', 'val', String(s.value))); });
      void pairThings(c, [sides[0].value, sides[1].value], thing, boxes);
    },
  });
}
