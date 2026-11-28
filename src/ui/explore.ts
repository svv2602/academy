import type { Explored } from '../game/explore';
import { t } from './strings';

/**
 * The explorer's key on screen (PLAY-36, src/game/explore.ts): the points of a world as a row of dots - one a point,
 * filled when got, a small gap after the half that wakes the next arch (`mark`). Under the counters of the world
 * played (its own row of #hud: the row of the counters keeps its width, the bubble keeps its place - src/style.css
 * --hud) and in the shelf of the book, for the world of the place picked.
 */

/** The dots of a world's points, as HTML: `mark` - a gap after the dots of the half (a world with an arch after it). */
export function exploreDots(e: Explored, mark: boolean): string {
  let out = '';
  for (let i = 0; i < e.of; i++) {
    out += `<i class="${i < e.got ? 'on' : ''}${mark && i === e.need - 1 && e.need < e.of ? ' half' : ''}"></i>`;
  }
  return out;
}

let row: HTMLElement | null = null, shown = '';
/** The row of the points under the counters; null hides it (the hub, a world off the shelf). */
export function setExploreRow(e: Explored | null, mark: boolean): void {
  if (!row) {
    const hud = document.getElementById('hud');
    if (!hud) return;
    row = document.createElement('div');
    row.id = 'explore';
    hud.appendChild(row);
  }
  const html = e && e.of > 0 ? exploreDots(e, mark) : '';
  if (html === shown) return;
  shown = html;
  row.innerHTML = html ? `<span>🧭</span>${html}` : '';
  row.classList.toggle('hidden', !html);
  row.setAttribute('aria-label', e ? `${t('book_explored')} ${e.got} / ${e.of}` : '');
  row.dataset.got = e ? String(e.got) : '';
  row.dataset.of = e ? String(e.of) : '';
}
