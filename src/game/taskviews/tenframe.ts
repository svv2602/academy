/**
 * Ten frames (LEARN-04): things laid out by tens, each ten a frame of two rows of five, so a whole ten is seen at once.
 * Shared by the shows of any type (add and sub now; count to 20 and number bonds later): it takes elements that are
 * already made and only places them, so taps, badges and the order of counting stay with the show. The things fill
 * a frame row by row, left to right, in the order of the list; the last frame keeps its empty cells.
 * Drawn by `hints.css` (`.tens`, `.tf`).
 */
import { badge, el, wait, type PanelCtx } from './panel';

/** The cells of one frame and of one of its rows. */
export const TEN = 10, ROW = 5;
/** The level from which the shows lay out their things in ten frames: the numbers of the ladder go past 10 there. */
export const FRAMES_FROM = 4;

/** How many things go into each frame for `n` things: full tens, then the rest; at least one frame. */
export const frameSizes = (n: number) => Array.from({ length: Math.max(1, Math.ceil(n / TEN)) }, (_, i) => Math.min(TEN, Math.max(0, n - i * TEN)));

/**
 * Moves `things` into ten frames inside a new `.tens` box at the end of `parent` and returns the box.
 * `stack` puts the frames under one another (one group of a sum), otherwise they stand in a row and wrap.
 */
export function tenFrames(parent: HTMLElement, things: readonly HTMLElement[], stack = false) {
  const box = el('div', stack ? 'tens stack' : 'tens');
  let at = 0;
  for (const size of frameSizes(things.length)) {
    const frame = el('div', 'tf');
    for (let i = 0; i < TEN; i++) frame.appendChild(i < size ? things[at++] : el('span', 'tf-e'));
    box.appendChild(frame);
  }
  parent.appendChild(box);
  return box;
}

/** The hint of mistake `round` is still wanted: the task is open and no newer mistake has started its own round. */
const still = (c: PanelCtx, round: number) => c.alive && c.wrongs === round;
/** One thing counted aloud: its number on it, its glow, the number said, then the pause of the count. */
async function one(c: PanelCtx, e: HTMLElement, n: number) { badge(e, n); e.classList.add('hit'); c.hooks.number(n); await wait(750); }

/**
 * Counting on from ten (rung 2 of HINTS.md for 11..20 things): the full first frame is "10" at once - its tenth thing
 * gets the number, the whole frame glows - then the things after it are counted 11, 12, ... one by one.
 */
export async function countOn(c: PanelCtx, list: readonly HTMLElement[]) {
  const round = c.wrongs, ten = Math.min(TEN, list.length);
  for (const e of list) e.querySelector('i')?.remove();
  list.slice(0, ten - 1).forEach((e) => e.classList.add('hit'));
  for (let i = ten - 1; i < list.length && still(c, round); i++) await one(c, list[i], i + 1);
}

/**
 * Adding across ten (8 + 5): the things of the second group move one by one into the empty cells of the first frame
 * (9, 10: the frame is full, "10"), then the rest of the second group is counted on, 11, 12, 13. A thing that moves
 * leaves an empty cell behind, so the frame of the second group keeps its shape.
 */
export async function fillTen(c: PanelCtx, first: HTMLElement, a: number, second: readonly HTMLElement[]) {
  const round = c.wrongs;
  for (const e of second) e.querySelector('i')?.remove();
  for (let i = 0; i < second.length && still(c, round); i++) {
    const cell = first.querySelector('.tf-e');
    if (cell) { const hole = el('span', 'tf-e'); second[i].replaceWith(hole); cell.replaceWith(second[i]); }
    await one(c, second[i], a + i + 1);
  }
}

/**
 * Taking away across ten (13 - 6): the gone things over ten leave first - "10" stays, the full frame - then the rest of
 * the gone ones leave one by one, then the things that are left are counted aloud.
 */
export async function takeToTen(c: PanelCtx, list: readonly HTMLElement[], left: number) {
  const round = c.wrongs;
  for (const e of list) e.querySelector('i')?.remove();
  list.slice(TEN).forEach((e) => e.classList.add('away'));
  if (list.length > TEN) { badge(list[TEN - 1], TEN); c.hooks.number(TEN); await wait(750); }
  for (let i = TEN - 1; i >= left && still(c, round); i--) { list[i].classList.add('away'); await wait(750); }
  for (let i = 0; i < left && still(c, round); i++) await one(c, list[i], i + 1);
}
