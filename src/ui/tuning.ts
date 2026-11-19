/**
 * The tuning panel (ARCH-14): sliders for the numbers of the controls and the camera, for the grown-up who tunes them
 * on the phone. Created only with ?debug (or on the development server) - see src/main.ts; without it the document has
 * neither the panel nor its button. A slider changes `tuning` at once; "copy" puts the current values as text on the
 * clipboard, or shows the text for copying by hand where there is no clipboard.
 * The texts are for the grown-up only: they are not in src/ui/strings.ts and are never spoken.
 */
import { TUNING_KEYS, TUNING_RANGES, resetTuning, setTuning, tuning, tuningText, type TuningKey } from '../core/tuning';

const LABELS: Record<TuningKey, string> = {
  lookX: 'обзор ↔',
  lookY: 'обзор ↕',
  speed: 'скорость',
  runFrom: 'бег от',
  joyRadius: 'радиус джойст.',
  joyZone: 'зона джойст.',
  joyHoldMs: 'кольцо через, мс',
  camDist: 'камера',
  jump: 'прыжок',
};

const shown = (n: number) => String(+n.toFixed(4));

/** Builds the button and the (closed) panel right after `after` in the document. */
export function initTuningPanel(after: Element) {
  const doc = after.ownerDocument;
  const make = <K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}): HTMLElementTagNameMap[K] =>
    Object.assign(doc.createElement(tag), props);

  const btn = make('button', { id: 'tuneBtn', textContent: '⚙' });
  btn.setAttribute('aria-label', 'tuning');
  const panel = make('div', { id: 'tune', className: 'hidden' });

  const sliders = new Map<TuningKey, { range: HTMLInputElement; value: HTMLElement }>();
  for (const k of TUNING_KEYS) {
    const [min, max, step] = TUNING_RANGES[k];
    const range = make('input', { type: 'range', min: String(min), max: String(max), step: String(step) });
    range.dataset.k = k;
    const value = make('b');
    const row = make('label', { className: 'tune-row' });
    row.append(make('span', { textContent: LABELS[k] }), range, value);
    panel.append(row);
    sliders.set(k, { range, value });
    range.addEventListener('input', () => { setTuning(k, Number(range.value)); value.textContent = shown(tuning[k]); });
    // The keys that move the heroine would move the slider too while it has the focus.
    range.addEventListener('change', () => range.blur());
  }
  const sync = () => { for (const [k, s] of sliders) { s.range.value = String(tuning[k]); s.value.textContent = shown(tuning[k]); } };

  const copy = make('button', { id: 'tuneCopy', textContent: 'копировать' });
  const reset = make('button', { id: 'tuneReset', textContent: 'сброс' });
  const out = make('textarea', { id: 'tuneText', readOnly: true, className: 'hidden' });
  const btns = make('div', { className: 'tune-btns' });
  btns.append(copy, reset);
  panel.append(btns, out);

  copy.addEventListener('click', async () => {
    const text = tuningText();
    try {
      await navigator.clipboard.writeText(text);
      copy.textContent = 'скопировано';
      out.classList.add('hidden');
    } catch {
      // No clipboard (an insecure address, no permission): the text is shown selected, to copy by hand.
      copy.textContent = 'копировать';
      out.value = text; out.rows = TUNING_KEYS.length;
      out.classList.remove('hidden');
      out.focus(); out.select();
    }
  });
  reset.addEventListener('click', () => { resetTuning(); sync(); });
  btn.addEventListener('click', () => {
    const open = panel.classList.toggle('hidden') === false;
    if (open) { sync(); copy.textContent = 'копировать'; out.classList.add('hidden'); }
    btn.blur();   // Space would press it again instead of jumping
  });

  sync();
  after.after(btn, panel);
  return { btn, panel };
}
