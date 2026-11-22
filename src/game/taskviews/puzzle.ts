/**
 * The panel show of the puzzle (LEARN-19): the frame and the pieces scattered by it (under it held upright,
 * ./puzzle.css). A piece is dragged with a finger: let go over its own cell - or the free cell of a piece that looks the
 * same - the right way up, it stays there; let go anywhere else it glides back - no mistake, nothing taken (LEARN-14).
 * A short touch turns a piece a quarter round (on the top level some lie turned). No timer: after HINT_S seconds with no
 * piece placed the cat says where one goes and its cell and the piece glow, at most HINTS times a task; a hint by time
 * is no mistake (as in "find the differences").
 *
 * The picture is a frame of a story (../tasks/puzzle.ts PUZZLE_PICTURES), its middle 4:3: every piece and the pale
 * picture in the frame are the same image file as backgrounds placed by percent, nothing is drawn. Once the frame is
 * loaded its cells are compared small (ALIKE) and the cells that look the same are told to the model (`setAlike`).
 */
import { PICTURE_CROP, PICTURE_SIZE, pictureImage, puzzle, setAlike, type PuzzleSpec } from '../tasks/puzzle';
import { el, type PanelCtx } from './panel';
import './puzzle.css';

/** s with no piece placed before a hint; how many hints a task gives at most. */
export const HINT_S = 20, HINTS = 3;
/** px: a touch that moved less than this is a touch (a turn), not a drag. */
const TAP_PX = 8;
/** The cells compared as ALIKE.w x ALIKE.h colours; alike when the mean difference of a channel is under ALIKE.d (0-255). */
export const ALIKE = { w: 8, h: 6, d: 10 } as const;

const pictureUrl = (id: string) => `${import.meta.env.BASE_URL}${pictureImage(id)}.webp`;

/**
 * The background of the piece `x, y` of a frame cut `cols` x `rows` (its middle 4:3), by percent of the element: the
 * whole frame is `cols` pieces wide and more by the sides cut off.
 */
export function pieceBackground(cols: number, rows: number, x: number, y: number) {
  const wide = PICTURE_SIZE.w / PICTURE_CROP.w, left = PICTURE_CROP.x / PICTURE_CROP.w;   // in widths of the crop
  const px = ((left * cols + x) / (cols * wide - 1)) * 100, py = rows > 1 ? (y / (rows - 1)) * 100 : 0;
  return { size: `${cols * wide * 100}% ${rows * 100}%`, position: `${px}% ${py}%` };
}

/**
 * The groups of the cells alike (`groups[cell]` - the first cell of its group) from colours of the frame drawn small,
 * `pixels` RGBA of (cols * ALIKE.w) x (rows * ALIKE.h): a cell joins the group of the first cell before it near to it.
 */
export function alikeGroups(pixels: ArrayLike<number>, cols: number, rows: number): number[] {
  const width = cols * ALIKE.w;
  const cell = (c: number) => {
    const out: number[] = [], x0 = (c % cols) * ALIKE.w, y0 = Math.floor(c / cols) * ALIKE.h;
    for (let y = 0; y < ALIKE.h; y++) for (let x = 0; x < ALIKE.w; x++) { const i = ((y0 + y) * width + x0 + x) * 4; out.push(pixels[i], pixels[i + 1], pixels[i + 2]); }
    return out;
  };
  const cells = Array.from({ length: cols * rows }, (_, c) => cell(c));
  const near = (a: number[], b: number[]) => a.reduce((s, v, i) => s + Math.abs(v - b[i]), 0) / a.length < ALIKE.d;
  const groups: number[] = [];
  for (const [c, a] of cells.entries()) { const d = cells.findIndex((b, k) => k < c && near(a, b)); groups.push(d < 0 ? c : groups[d]); }
  return groups;
}

/** The frame drawn small for `alikeGroups` (null - no 2D canvas here). */
function smallPixels(image: CanvasImageSource, cols: number, rows: number): Uint8ClampedArray | null {
  const canvas = document.createElement('canvas');
  canvas.width = cols * ALIKE.w; canvas.height = rows * ALIKE.h;
  const cx = canvas.getContext('2d', { willReadFrequently: true });
  if (!cx) return null;
  cx.drawImage(image, PICTURE_CROP.x, 0, PICTURE_CROP.w, PICTURE_CROP.h, 0, 0, canvas.width, canvas.height);
  return cx.getImageData(0, 0, canvas.width, canvas.height).data;
}

export function puzzleView(spec: PuzzleSpec, c: PanelCtx) {
  const st = puzzle.start(spec), { cols, rows, guide, pieces, picture } = spec.body;
  const url = pictureUrl(picture);
  delete c.stage.dataset.placed;
  delete c.stage.dataset.alike;

  const wrap = el('div', 'pzwrap'), frame = el('div', 'pzframe'), tray = el('div', 'pztray');
  frame.style.setProperty('--cols', String(cols)); frame.style.setProperty('--rows', String(rows));
  // a piece in the tray has the shape of its cell: the 4:3 picture cut cols x rows
  tray.style.setProperty('--cols', String(cols)); tray.style.setProperty('--shape', `${4 * rows} / ${3 * cols}`);
  if (guide > 0) {
    const g = el('div', 'pzguide'), bg = pieceBackground(1, 1, 0, 0);
    g.style.backgroundImage = `url(${url})`; g.style.backgroundSize = bg.size; g.style.backgroundPosition = bg.position;
    g.style.opacity = String(guide);
    frame.appendChild(g);
  }
  const cells = Array.from({ length: cols * rows }, (_, i) => { const cell = el('div', 'pzcell'); cell.dataset.cell = String(i); frame.appendChild(cell); return cell; });
  wrap.append(frame, tray);
  c.stage.appendChild(wrap);
  c.stage.dataset.picture = picture;

  /** A piece shows the part of the picture of the cell it belongs to now, turned as it lies. */
  const look = (b: HTMLElement, i: number) => {
    const cell = st.home[i], bg = pieceBackground(cols, rows, cell % cols, Math.floor(cell / cols));
    b.style.backgroundImage = `url(${url})`; b.style.backgroundSize = bg.size; b.style.backgroundPosition = bg.position;
    b.dataset.cell = String(cell);
    b.style.setProperty('--turn', `${st.turn[i] * 90}deg`);
  };
  const shown = pieces.map((_, i) => {
    const b = el('div', 'pzpiece');
    b.dataset.piece = String(i);
    look(b, i);
    tray.appendChild(b);
    return b;
  });

  // the cells alike, once the frame is loaded (it is in the cache of the installation with its story)
  const image = new Image();
  image.onload = () => {
    if (!c.alive) return;
    const pixels = smallPixels(image, cols, rows);
    if (!pixels) return;
    const groups = alikeGroups(pixels, cols, rows);
    setAlike(st, groups);
    c.stage.dataset.alike = groups.join(' ');
  };
  image.src = url;

  // ---- the hints by time: the clock starts again at every piece placed ----
  let hints = 0, timer = 0;
  const unglow = () => { for (const e of [...cells, ...shown]) e.classList.remove('glow'); };
  const arm = () => {
    clearTimeout(timer);
    if (!c.alive || hints >= HINTS) return;
    timer = window.setTimeout(() => {
      if (!c.alive) return;
      const i = st.placed.findIndex((p) => p === null);
      if (i < 0) return;
      hints++;
      unglow();
      cells[st.home[i]].classList.add('glow'); shown[i].classList.add('glow');
      c.stage.dataset.shown = String(hints);
      void c.hooks.hint('h1_puzzle');
      arm();
    }, HINT_S * 1000);
  };

  /** One input through the model, as a touch or a drop gives it; the pieces follow what it says. */
  const act = (i: number, input: { turn: true } | { cell: number | null }) => {
    if (!c.alive) return;
    const out = puzzle.answer(spec, st, { piece: i, ...input });
    const b = shown[i];
    if ('turn' in input) { look(b, i); return; }
    if (out === 'step' || out === 'right') {
      // a piece alike to it may have given it its cell: each shows the part of the cell it belongs to now
      for (const [k, e] of shown.entries()) if (e.dataset.cell !== String(st.home[k])) look(e, k);
      b.classList.add('placed'); b.classList.remove('glow'); b.style.transform = '';
      cells[input.cell!].appendChild(b); cells[input.cell!].classList.remove('glow');
      c.stage.dataset.placed = String(st.placed.filter((p) => p !== null).length);
      if (out === 'right') { clearTimeout(timer); unglow(); c.right(); } else { try { c.hooks.good(); } catch { /* no sound */ } arm(); }
      return;
    }
    // not its place, or turned wrong: back where it lay, gently
    b.classList.add('back'); b.style.transform = '';
    setTimeout(() => b.classList.remove('back'), 300);
  };

  // ---- dragging with a finger ----
  for (const [i, b] of shown.entries()) {
    let from: { x: number; y: number } | null = null;
    b.addEventListener('pointerdown', (e) => {
      if (!c.alive || st.placed[i] !== null) return;
      e.preventDefault(); from = { x: e.clientX, y: e.clientY };
      try { b.setPointerCapture(e.pointerId); } catch { /* a synthetic event */ }
      b.classList.add('drag');
    });
    b.addEventListener('pointermove', (e) => {
      if (!from) return;
      b.style.transform = `translate(${e.clientX - from.x}px, ${e.clientY - from.y}px) rotate(var(--turn))`;
    });
    b.addEventListener('pointerup', (e) => {
      if (!from) return;
      const moved = Math.hypot(e.clientX - from.x, e.clientY - from.y);
      from = null; b.classList.remove('drag');
      if (moved < TAP_PX) { b.style.transform = ''; act(i, { turn: true }); return; }
      const under = cells.find((cell) => { const r = cell.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right && e.clientY >= r.top && e.clientY < r.bottom; });
      act(i, { cell: under ? Number(under.dataset.cell) : null });
    });
  }
  arm();

  // the test hook (cheatTask): every piece turned right and dropped on its cell, through the same way as the fingers'
  c.cheat = () => {
    for (const step of puzzle.solution(spec, st)) act(step.piece, 'turn' in step ? { turn: true } : { cell: step.cell });
  };
  c.hint = null;
}
