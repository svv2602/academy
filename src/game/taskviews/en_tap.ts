/**
 * The panel show of "listen and touch" (../tasks/en_tap.ts, Season 2): the pictures of one kind, a button 🔊 that says
 * the English question again, and under the right picture, once it is found, its translation in the language of the
 * game (before the answer it would give the word away: she reads).
 */
import { en_tap, type EnTapSpec } from '../tasks/en_tap';
import { enVoice, type WordId } from '../../s2/types';
import { EN } from '../../s2/strings-en';
import { PICTURE, type Picture } from '../../s2/pictures';
import { lang } from '../../ui/strings';
import { el, pulseOf, tap, type PanelCtx } from './panel';
import { hintOf } from './flow';
import './en_tap.css';


function picture(w: WordId): HTMLElement {
  const p = (PICTURE as Readonly<Record<string, Picture>>)[w], b = el('button', 'it big en-pic');
  b.dataset.word = w;
  if (!p) throw new Error(`no picture of "${w}"`);
  if ('emoji' in p) b.textContent = p.emoji;
  else if ('colour' in p) { const s = el('span', 'en-colour'); s.style.background = p.colour; b.appendChild(s); }
  else b.textContent = String(p.digit);
  return b;
}

/** The translation of a word in the language of the game (src/s2/strings-en.ts). */
export const translation = (w: WordId): string => EN.get(`wb_w_${w}`)?.[lang] ?? '';

export function enTapView(spec: EnTapSpec, c: PanelCtx) {
  const st = en_tap.start(spec), right = spec.body.answer;
  const say = () => { void enVoice().say(spec.screen.en); };
  const again = el('button', 'en-again', '🔊');
  again.setAttribute('aria-label', 'again');
  tap(again, say);
  c.stage.appendChild(again);
  const row = el('div', 'en-row');
  const list = spec.body.options.map((w, i) => {
    const b = picture(w);
    tap(b, () => {
      if (en_tap.answer(spec, st, i) !== 'right') { b.classList.add('no'); c.wrong(b); return; }
      if (!c.alive) return;
      b.classList.add('yes');
      b.appendChild(el('small', 'en-word', translation(w)));
      c.right();
    });
    row.appendChild(b);
    return b;
  });
  c.stage.appendChild(row);
  c.cheat = () => list[right].dispatchEvent(new PointerEvent('pointerdown'));
  c.hint = hintOf(spec.hint, pulseOf(list[right]), {
    replay: say,
    outline: () => { list[right].classList.add('outline'); },
  });
}
