/**
 * The panel show of "the neighbours of a number" (LEARN-08): a piece of the number track, five cells in a row, the
 * number the question is about marked, the cell right before or after it empty ("?"), and the answer numbers.
 * Nothing on the track is a button. Drawn by `neighbors.css`.
 */
import { neighbors, type NeighborsSpec } from '../tasks/neighbors';
import { el, options, pulseOf, wait, type PanelCtx } from './panel';
import { hintOf } from './flow';
import './neighbors.css';
import { cpaOf } from '../tasks/cpa';
import './cpa.css';

/**
 * Rung 2 of the hint (`h2_neighbors`, HINTS.md): the cat counts the cells from the start of the piece, one by one,
 * each cell lit as its number is said; at the empty cell the count stops and its number is said - not written: the
 * child puts it there. A newer mistake stops the count: its own round counts again.
 */
async function countCells(c: PanelCtx, spec: NeighborsSpec, cells: HTMLElement[]) {
  const round = c.wrongs, { gap } = spec.body;
  cells.forEach((x) => x.classList.remove('said', 'on'));
  for (let i = 0; i <= gap && c.alive && c.wrongs === round; i++) {
    cells.forEach((x) => x.classList.remove('on'));
    cells[i].classList.add('said', 'on');
    c.hooks.number(spec.body.cells[i]);
    await wait(750);
  }
  // The counted cells stay marked; none stays lit as "being said" once the count is over or cut off.
  cells.forEach((x) => x.classList.remove('on'));
}

export function neighborsView(spec: NeighborsSpec, c: PanelCtx) {
  const st = neighbors.start(spec), { cells: numbers, n, gap } = spec.body;
  const road = el('div', 'road');
  const cells = numbers.map((v, i) => road.appendChild(i === gap ? el('span', 'cell empty', '?') : el('span', v === n ? 'cell here' : 'cell', String(v))));
  c.stage.appendChild(road);
  // the step of the world (src/game/tasks/cpa.ts): 2 - the track without its other numbers (the number and "?" alone
  // written), 3 - the number and "?" alone, no track; the hint's count shows the whole track again
  const step = cpaOf(spec.level);
  if (step > 1) c.stage.dataset.cpa = String(step);
  const others = cells.filter((x, i) => i !== gap && numbers[i] !== n);
  if (step === 2) others.forEach((x) => x.classList.add('cpa-off'));
  if (step === 3) others.forEach((x) => x.classList.add('hidden'));
  const open = () => others.forEach((x) => x.classList.remove('cpa-off', 'hidden'));
  const ok = options(c, spec.body.options, (v) => neighbors.answer(spec, st, v) === 'right', { at: () => cells[gap], row: () => cells });
  c.hint = hintOf(spec.hint, pulseOf(ok), { countCells: () => { open(); void countCells(c, spec, cells); } });
}
