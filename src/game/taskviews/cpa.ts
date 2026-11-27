/**
 * What the shows of the number tasks share for the steps «things → picture → numbers» (src/game/tasks/cpa.ts): the
 * basket the things taken go into, the box that hides the things on the step of numbers, the line of numbers in words.
 * Not in ./panel.ts (the shared panel of another part): its own module, imported by the shows that use it.
 */
import { el } from './panel';
import './cpa.css';

/** The basket the things taken go into: open with "− k" (the picture), or closed (the numbers). */
export function basket(parent: HTMLElement, k: number, closed: boolean) {
  const b = el('div', closed ? 'cpa-basket closed' : 'cpa-basket');
  b.append(el('span', 'cpa-bk', '🧺'), el('span', 'cpa-k', `− ${k}`));
  parent.appendChild(b);
  return b;
}

/** The things `list` go into the basket: they leave the picture after the answer (a short flight, then gone). */
export function takeAway(list: readonly HTMLElement[]) {
  for (const [i, e] of list.entries()) { e.style.setProperty('--d', `${i * 60}ms`); e.classList.add('taken'); }
}

/** A box for the things of a show; hidden on the step of numbers until `open()` (the answer, or a hint). */
export function things(parent: HTMLElement, hidden: boolean) {
  const box = el('div', hidden ? 'cpa-things hid' : 'cpa-things');
  parent.appendChild(box);
  return { box, open: () => box.classList.remove('hid'), get hidden() { return box.classList.contains('hid'); } };
}

/** A line of the task in numbers and words on the screen ("Було 8, 3 забрали"). */
export const line = (parent: HTMLElement, text: string) => { const p = el('div', 'cpa-line', text); parent.appendChild(p); return p; };
