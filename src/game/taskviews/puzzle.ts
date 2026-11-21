/**
 * The panel show of the puzzle (LEARN-19): the frame and the pieces scattered by it (under it held upright,
 * ./puzzle.css). A piece is dragged with a finger: let go over its own cell, the right way up, it stays there; let go
 * anywhere else it glides back - no mistake, nothing taken (LEARN-14). A short touch turns a piece a quarter round (on
 * the top level some lie turned). No timer: after HINT_S seconds with no piece placed the cat says where one goes and
 * its cell and the piece glow, at most HINTS times a task; a hint by time is no mistake (as in "find the differences").
 * The picture is the glade of "find the differences", drawn once (./diff-scene.ts) and cut by the pieces' backgrounds.
 */
import { puzzle, type PuzzleSpec } from '../tasks/puzzle';
import { drawGlade } from './diff-scene';
import { el, type PanelCtx } from './panel';
import './puzzle.css';

/** s with no piece placed before a hint; how many hints a task gives at most. */
export const HINT_S = 20, HINTS = 3;
/** px: a touch that moved less than this is a touch (a turn), not a drag. */
const TAP_PX = 8;

export function puzzleView(spec: PuzzleSpec, c: PanelCtx) {
  const st = puzzle.start(spec), { cols, rows, guide, pieces } = spec.body;
  const canvas = document.createElement('canvas');
  const drawn = drawGlade(spec.body.things, canvas);
  const picture = drawn ? canvas.toDataURL() : '';
  delete c.stage.dataset.placed;

  const wrap = el('div', 'pzwrap'), frame = el('div', 'pzframe'), tray = el('div', 'pztray');
  frame.style.setProperty('--cols', String(cols)); frame.style.setProperty('--rows', String(rows));
  tray.style.setProperty('--cols', String(cols));
  if (guide > 0 && picture) { const g = el('div', 'pzguide'); g.style.backgroundImage = `url(${picture})`; g.style.opacity = String(guide); frame.appendChild(g); }
  const cells = Array.from({ length: cols * rows }, (_, i) => { const cell = el('div', 'pzcell'); cell.dataset.cell = String(i); frame.appendChild(cell); return cell; });
  wrap.append(frame, tray);
  c.stage.appendChild(wrap);

  const look = (b: HTMLElement, i: number) => {
    const cell = pieces[i].cell, x = cell % cols, y = Math.floor(cell / cols);
    b.style.backgroundImage = picture ? `url(${picture})` : '';
    b.style.backgroundSize = `${cols * 100}% ${rows * 100}%`;
    b.style.backgroundPosition = `${cols > 1 ? (x / (cols - 1)) * 100 : 0}% ${rows > 1 ? (y / (rows - 1)) * 100 : 0}%`;
    b.style.setProperty('--turn', `${st.turn[i] * 90}deg`);
  };
  const shown = pieces.map((p, i) => {
    const b = el('div', 'pzpiece');
    b.dataset.piece = String(i); b.dataset.cell = String(p.cell);
    look(b, i);
    tray.appendChild(b);
    return b;
  });

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
      cells[pieces[i].cell].classList.add('glow'); shown[i].classList.add('glow');
      c.stage.dataset.shown = String(hints);
      void c.hooks.hint('h1_puzzle');
      arm();
    }, HINT_S * 1000);
  };

  /** One input through the model, as a touch or a drop gives it; the piece follows what it says. */
  const act = (i: number, input: { turn: true } | { cell: number | null }) => {
    if (!c.alive) return;
    const out = puzzle.answer(spec, st, { piece: i, ...input });
    const b = shown[i];
    if ('turn' in input) { look(b, i); return; }
    if (out === 'step' || out === 'right') {
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
