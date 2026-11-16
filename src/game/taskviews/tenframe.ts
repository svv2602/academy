/**
 * Ten frames (LEARN-04): things laid out by tens, each ten a frame of two rows of five, so a whole ten is seen at once.
 * Shared by the shows of any type (add and sub now; count to 20 and number bonds later): it takes elements that are
 * already made and only places them, so taps, badges and the order of counting stay with the show. The things fill
 * a frame row by row, left to right, in the order of the list; the last frame keeps its empty cells.
 * Drawn by `hints.css` (`.tens`, `.tf`).
 */
import { el } from './panel';

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
