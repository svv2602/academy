/**
 * The panel show of "find the differences" (LEARN-18): the two pictures of one glade side by side (one under the other
 * held upright, src/style.css), a difference touched on either is ringed on both. A touch elsewhere takes nothing and
 * is no mistake. No timer: after HINT_S seconds with nothing found the cat says where to look and half of a picture
 * glows round a difference not found yet; after the next HINT_S seconds, a quarter - and no more. A hint by time is no
 * mistake (LEARN-14: waiting is never held against her): the task's result counts no mistake for it.
 */
import { diff, diffAt, secondPicture, slotRect, type DiffSpec } from '../tasks/diff';
import { drawGlade } from './diff-scene';
import { el, type PanelCtx } from './panel';
import './diff.css';

/** s with nothing found before the cat gives a hint (then the next one). */
export const HINT_S = 20;

export function diffView(spec: DiffSpec, c: PanelCtx) {
  const st = diff.start(spec), body = spec.body;
  const pair = el('div', 'diffpair');
  const pictures = [body.things, secondPicture(body)].map((things, i) => {
    const box = el('div', 'diffpic'), canvas = document.createElement('canvas');
    box.dataset.pic = String(i);
    // what the picture shows, in words (the drawing is pixels): for the tests and the walkthrough
    box.dataset.things = things.map((t) => `${t.prop}${t.color}${t.n}`).join(' ');
    drawGlade(things, canvas);
    box.appendChild(canvas);
    pair.appendChild(box);
    return box;
  });
  c.stage.appendChild(pair);

  const ring = (k: number) => {
    const t = body.things[body.changes[k].at], r = slotRect(t.col, t.row);
    for (const box of pictures) {
      const o = el('div', 'diffring');
      Object.assign(o.style, { left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%` });
      box.appendChild(o);
    }
  };

  // the hints by time: the clock starts again at every find
  let hints = 0, timer = 0;
  const glow = (part: 'half' | 'quarter') => {
    pictures.forEach((b) => b.querySelector('.diffglow')?.remove());
    const k = st.found.findIndex((f) => !f);
    if (k < 0) return;
    const t = body.things[body.changes[k].at], r = slotRect(t.col, t.row), cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const x = cx < 0.5 ? 0 : 0.5, y = cy < 0.5 ? 0 : 0.5;
    const box = part === 'half' ? { x, y: 0, w: 0.5, h: 1 } : { x, y, w: 0.5, h: 0.5 };
    for (const b of pictures) {
      const g = el('div', 'diffglow');
      Object.assign(g.style, { left: `${box.x * 100}%`, top: `${box.y * 100}%`, width: `${box.w * 100}%`, height: `${box.h * 100}%` });
      b.appendChild(g);
    }
    c.stage.dataset.shown = String(hints);
  };
  const arm = () => {
    clearTimeout(timer);
    if (!c.alive || hints >= 2) return;
    timer = window.setTimeout(() => {
      if (!c.alive) return;
      hints++;
      void c.hooks.hint(hints === 1 ? 'h1_diff' : 'h2_diff');
      glow(hints === 1 ? 'half' : 'quarter');
      arm();
    }, HINT_S * 1000);
  };

  /** A touch at (x, y) of a picture (0..1): a difference there is ringed on both; elsewhere nothing happens. */
  const touchAt = (x: number, y: number) => {
    if (!c.alive) return;
    const k = diffAt(body, x, y), out = diff.answer(spec, st, { x, y });
    if ((out !== 'step' && out !== 'right') || k === null) return;
    ring(k);
    c.stage.dataset.found = String(st.found.filter(Boolean).length);
    pictures.forEach((b) => b.querySelector('.diffglow')?.remove());
    if (out === 'right') { clearTimeout(timer); c.right(); } else { try { c.hooks.good(); } catch { /* no sound */ } arm(); }
  };
  const touch = (box: HTMLElement, ev: PointerEvent) => {
    const rect = box.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) touchAt((ev.clientX - rect.left) / rect.width, (ev.clientY - rect.top) / rect.height);
  };
  for (const box of pictures) box.addEventListener('pointerdown', (ev) => { ev.preventDefault(); touch(box, ev); });
  arm();

  // the test hook (cheatTask): every difference left touched in the middle of its zone, through the same way as a touch
  c.cheat = () => { for (const p of diff.solution(spec, st)) touchAt(p.x, p.y); };
  c.hint = null;
}
