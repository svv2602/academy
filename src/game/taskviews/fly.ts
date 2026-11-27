/**
 * The answer flies into its place (the panel tasks with an empty place "?": pattern, missing, neighbours, add, the number
 * house, the signs). A right answer flies from its button to the "?", takes its place in the row, and a wave runs along
 * the row; a wrong one flies to the "?", wobbles there and flies back to its button - nothing is taken away, the hint
 * goes on as before (./flow.ts). What flies is a copy of the button's face, not a button: the panel's buttons and their
 * taps stay as they are. Drawn by `fly.css`.
 */
import { el } from './panel';
import './fly.css';

/** The empty place of a show and the row it stands in (the wave). `at` is read when the answer is given: a hint may
 * have taken the "?" away (the dots of "missing" fill its place), and then nothing flies. */
export interface Slot { at: () => HTMLElement | null; row: () => HTMLElement[] }

export const FLY_MS = 380;        // button → "?" (and back, for a wrong one)
export const WOBBLE_MS = 320;     // a wrong answer at the "?" before it goes back
export const WAVE_STEP_MS = 60;   // the wave: from one thing of the row to the next
export const WAVE_MS = 360;       // one thing of the row going up and down
/** At most this much longer than before to the end of a task after the right answer (the panel ends 1.1 s after it). */
export const EXTRA_MAX_MS = 450;
/** The panel ends this long after the right answer (./panel.ts), and never later than WON_MAX_MS. */
export const WON_MS = 1100;
export const WON_MAX_MS = WON_MS + EXTRA_MAX_MS;

const still = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const animate = (e: HTMLElement, frames: Keyframe[], o: KeyframeAnimationOptions) => { if (typeof e.animate === 'function') e.animate(frames, o); };

/** A copy of the face of `b` on the panel, over `b`, that can fly; gone with the panel (`clearFlights`). */
function face(b: HTMLElement): HTMLElement {
  const f = el('span', 'fly');
  f.setAttribute('aria-hidden', 'true');
  for (const n of b.childNodes) f.appendChild(n.cloneNode(true));
  const r = b.getBoundingClientRect(), cs = getComputedStyle(b);
  Object.assign(f.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, fontSize: cs.fontSize });
  (b.closest('#task') ?? document.body).appendChild(f);
  return f;
}
/** How to move a copy over `from` onto `to`: the move of its centre and the scale to the place's height. */
function towards(from: HTMLElement, to: HTMLElement) {
  const a = from.getBoundingClientRect(), b = to.getBoundingClientRect();
  const dx = b.left + b.width / 2 - (a.left + a.width / 2), dy = b.top + b.height / 2 - (a.top + a.height / 2);
  const k = a.height > 0 && b.height > 0 ? Math.min(1.4, Math.max(0.6, b.height / a.height)) : 1;
  return `translate(${dx}px, ${dy}px) scale(${k})`;
}

/** Removes what is still flying on the panel (the task ended or was closed mid-flight). */
export function clearFlights(root: ParentNode = document) { root.querySelectorAll('.fly').forEach((f) => f.remove()); }

/**
 * The right answer `b`: it flies into the "?", which then shows it, and the row waves. Returns how much later than before
 * the task may end so that the wave is seen through (0 to EXTRA_MAX_MS).
 */
export function flyRight(b: HTMLElement, slot: Slot): number {
  const at = slot.at();
  if (!at || !at.isConnected) return 0;
  const land = () => { at.replaceChildren(...[...b.childNodes].map((n) => n.cloneNode(true))); at.classList.add('got'); };
  if (still()) { land(); return 0; }
  const f = face(b), to = towards(f, at);
  animate(f, [{ transform: 'none' }, { transform: to }], { duration: FLY_MS, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
  setTimeout(() => {
    f.remove();
    if (!at.isConnected) return;
    land();
    slot.row().forEach((x, i) => animate(x, [{ transform: 'none' }, { transform: 'translateY(-9px)' }, { transform: 'none' }],
      { duration: WAVE_MS, delay: i * WAVE_STEP_MS, easing: 'ease-in-out' }));
  }, FLY_MS);
  const n = slot.row().length, wave = FLY_MS + Math.max(0, n - 1) * WAVE_STEP_MS + WAVE_MS;
  return Math.min(EXTRA_MAX_MS, Math.max(0, wave + 150 - WON_MS));
}

/** A wrong answer `b`: it flies to the "?", wobbles and flies back to its button; the "?" stays as it was. */
export function flyWrong(b: HTMLElement, slot: Slot) {
  const at = slot.at();
  if (!at || !at.isConnected || still()) return;
  const f = face(b), to = towards(f, at);
  animate(f, [
    { transform: 'none', offset: 0 },
    { transform: to, offset: FLY_MS / (2 * FLY_MS + WOBBLE_MS), easing: 'ease-in-out' },
    { transform: `${to} rotate(-9deg)`, offset: (FLY_MS + WOBBLE_MS / 3) / (2 * FLY_MS + WOBBLE_MS) },
    { transform: `${to} rotate(9deg)`, offset: (FLY_MS + (2 * WOBBLE_MS) / 3) / (2 * FLY_MS + WOBBLE_MS) },
    { transform: to, offset: (FLY_MS + WOBBLE_MS) / (2 * FLY_MS + WOBBLE_MS), easing: 'ease-in-out' },
    { transform: 'none', offset: 1 },
  ], { duration: 2 * FLY_MS + WOBBLE_MS, fill: 'forwards' });
  setTimeout(() => f.remove(), 2 * FLY_MS + WOBBLE_MS);
}
