/**
 * The panel show of "the number house" (LEARN-07): the number on the roof, the floors with two windows each, one window
 * empty ("?"), and the answer numbers. Drawn by `compose.css`.
 */
import { house, type HouseSpec } from '../tasks/house';
import { el, options, pulseOf, type PanelCtx } from './panel';
import { countUp } from './missing';
import { hintOf } from './flow';
import './compose.css';

export function houseView(spec: HouseSpec, c: PanelCtx) {
  const st = house.start(spec), { roof, floors, gap } = spec.body;
  const home = el('div', 'house');
  home.appendChild(el('div', 'roof', String(roof)));
  const rows = floors.map((pair, f) => {
    const row = el('div', 'floor');
    pair.forEach((n, side) => row.appendChild(f === gap.floor && side === gap.side ? el('span', 'win empty', '?') : el('span', 'win', String(n))));
    home.appendChild(row);
    return row;
  });
  c.stage.appendChild(home);
  const ok = options(c, spec.body.options, (v) => house.answer(spec, st, v) === 'right',
    { at: () => rows[gap.floor].querySelector<HTMLElement>('.win.empty'), row: () => [...rows[gap.floor].querySelectorAll<HTMLElement>('.win')] });
  c.hint = hintOf(spec.hint, pulseOf(ok), {
    countUp: () => {
      // On the floor of the empty window only: the dots of the number in the window next to it, then empty dots
      // counted up to the roof, then counted again. The other floors are not touched.
      const row = rows[gap.floor], next = floors[gap.floor][1 - gap.side];
      const dots = el('div', 'dots-up');
      for (let i = 0; i < next; i++) dots.appendChild(el('span', 'have'));
      row.appendChild(dots);
      void countUp(c, next, roof, (dot) => dots.appendChild(dot));
    },
  });
}
