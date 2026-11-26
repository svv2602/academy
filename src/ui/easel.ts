/**
 * The card of a world's easel (PLAY-29, the customer's word of 2026-11-26): the frame of the world's picture, its cells
 * set already showing their part, the others empty (a silhouette of a piece); under it the pieces found in the world
 * and not set yet. She drags a piece onto its cell - it stays there; let go anywhere else it glides back, no mistake
 * (LEARN-14). The pieces not found yet are not there: they are looked for in the world. She may set some and close the
 * card at any time - what is set stays. The game stands while the card is open.
 *
 * The picture is cut as the book cuts it (src/ui/book.ts `renderPicture`): the whole frame, `cols` x `rows`.
 */
import type { Picture } from '../game/collections';
import './easel.css';

export interface EaselHooks {
  picture: Picture;
  /** The cells set already and the cells of the pieces found but not set (src/game/collections.ts). */
  set: readonly number[];
  loose: readonly number[];
  pause(on: boolean): void;
  /** A piece set on its cell: the game records it (and, the last one, makes the picture whole). */
  place(cell: number): void;
  /** A piece set: its little sound. */
  good?(): void;
  /** The card closed by its cross. */
  closed?(): void;
}

/** What the walkthrough reads of an open card, and its lever (?debug): `setAll` sets every piece lying by it, as a finger would. */
export const easelState: { open: boolean; set: number[]; loose: number[]; setAll: (() => void) | null } = { open: false, set: [], loose: [], setAll: null };

const make = (tag: string, cls = '') => { const e = document.createElement(tag); if (cls) e.className = cls; return e; };
/** ms the whole picture is seen on the easel before the card closes by itself. */
export const WHOLE_MS = 700;
/** px: a touch that moved less than this is no drag. */
const TAP_PX = 8;

/** The background of the cell `cell` of the picture cut `cols` x `rows`, by percent of the element (as the book's). */
export function cellBackground(pic: Picture, cell: number) {
  const col = cell % pic.cols, row = Math.floor(cell / pic.cols);
  return {
    size: `${pic.cols * 100}% ${pic.rows * 100}%`,
    position: `${pic.cols > 1 ? (col / (pic.cols - 1)) * 100 : 0}% ${pic.rows > 1 ? (row / (pic.rows - 1)) * 100 : 0}%`,
  };
}

/** Opens the card; it closes by its cross. */
export function openEasel(h: EaselHooks): void {
  let root = document.getElementById('easel');
  if (!root) { root = make('div'); root.id = 'easel'; document.body.appendChild(root); }
  root.className = '';
  root.innerHTML = '';
  const { picture: pic } = h, url = `url("${import.meta.env.BASE_URL}${pic.image}.webp")`;
  const card = make('div', 'es-card'), frame = make('div', 'es-frame'), tray = make('div', 'es-tray'), close = make('button', 'es-close');
  close.id = 'easelClose'; close.textContent = '✕';
  frame.style.setProperty('--cols', String(pic.cols)); frame.style.setProperty('--rows', String(pic.rows));
  tray.style.setProperty('--cols', String(pic.cols)); tray.style.setProperty('--rows', String(pic.rows));
  card.append(frame, tray, close);
  root.appendChild(card);
  h.pause(true);
  const set = [...h.set], loose = [...h.loose];
  easelState.open = true; easelState.set = set; easelState.loose = loose;

  const paint = (e: HTMLElement, cell: number) => {
    const bg = cellBackground(pic, cell);
    e.style.backgroundImage = url; e.style.backgroundSize = bg.size; e.style.backgroundPosition = bg.position;
  };
  const cells = Array.from({ length: pic.cols * pic.rows }, (_, cell) => {
    const c = make('div', 'es-cell');
    c.dataset.cell = String(cell);
    if (set.includes(cell)) { c.classList.add('set'); paint(c, cell); }
    frame.appendChild(c);
    return c;
  });
  const done = () => frame.classList.toggle('whole', set.length === cells.length);
  done();

  /** The piece of `cell` dropped on the cell `on` (null - off the frame): set when it is its own, else back. */
  const drop = (b: HTMLElement, cell: number, on: number | null) => {
    b.style.transform = '';
    if (on !== cell || set.includes(cell)) { b.classList.add('back'); setTimeout(() => b.classList.remove('back'), 300); return; }
    set.push(cell); loose.splice(loose.indexOf(cell), 1);
    b.remove();
    cells[cell].classList.add('set'); paint(cells[cell], cell);
    done();
    try { h.good?.(); } catch { /* no sound */ }
    h.place(cell);
    // the last piece set: the card gives way to the picture come alive (src/game/easel.ts on closing)
    if (set.length === cells.length) setTimeout(shut, WHOLE_MS);
  };

  for (const cell of loose) {
    const b = make('div', 'es-piece');
    b.dataset.cell = String(cell);
    paint(b, cell);
    tray.appendChild(b);
    let from: { x: number; y: number } | null = null;
    b.addEventListener('pointerdown', (e) => {
      e.preventDefault(); from = { x: e.clientX, y: e.clientY };
      try { b.setPointerCapture(e.pointerId); } catch { /* a synthetic event */ }
      b.classList.add('drag');
    });
    b.addEventListener('pointermove', (e) => { if (from) b.style.transform = `translate(${e.clientX - from.x}px, ${e.clientY - from.y}px)`; });
    b.addEventListener('pointerup', (e) => {
      if (!from) return;
      const moved = Math.hypot(e.clientX - from.x, e.clientY - from.y);
      from = null; b.classList.remove('drag');
      if (moved < TAP_PX) { b.style.transform = ''; return; }
      const under = cells.find((c) => { const r = c.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom; });
      drop(b, cell, under ? Number(under.dataset.cell) : null);
    });
  }
  if (!loose.length) tray.classList.add('empty');

  // the walkthrough's lever: every piece lying by the easel dropped on its own cell, the way a finger's drop goes
  easelState.setAll = () => { for (const b of [...tray.querySelectorAll<HTMLElement>('.es-piece')]) { const cell = Number(b.dataset.cell); drop(b, cell, cell); } };

  let shutDone = false;
  function shut() {
    if (shutDone) return;
    shutDone = true;
    root!.className = 'hidden'; root!.innerHTML = '';
    easelState.open = false; easelState.setAll = null;
    h.pause(false);
    h.closed?.();
  }
  close.addEventListener('click', shut);
}
