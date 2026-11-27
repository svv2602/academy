/**
 * The panel show of "read the note" (../tasks/note.ts, Season 2): the note on a slip of paper, in Ukrainian whatever the
 * language of the game (R08) - with the Russian one its translation is a small caption under it - then what it asks:
 * pictures to choose from, or numbers (with the pebbles of №3 over them). Nothing here is said.
 * The hint: rung 1 lights the words of the note one by one; rung 2 shows "read slowly" in the bubble (never said) and
 * lights the key words; rung 3 is the pulse of the answer after the recorded "look at what glows".
 */
import { note, type NoteSpec } from '../tasks/note';
import { lang } from '../../ui/strings';
import { el, options, pulseOf, tap, wait, type PanelCtx } from './panel';
import { hintOf } from './flow';
import './note.css';

/** ms each word of the note stays lit on rung 1. */
export const WORD_MS = 450;
/** A word of the text as the key words name it: without the marks around it. */
const bare = (w: string) => w.replace(/^[^\p{L}ʼ']+|[^\p{L}ʼ']+$/gu, '');

export function noteView(spec: NoteSpec, c: PanelCtx) {
  const st = note.start(spec), b = spec.body;
  const paper = el('div', 'note-paper');
  paper.dataset.note = b.id;
  const text = el('p', 'note-read');
  text.lang = 'uk';
  const words = b.uk.split(' ').map((w, i) => {
    if (i) text.appendChild(document.createTextNode(' '));
    const s = el('span', 'note-w', w);
    text.appendChild(s);
    return s;
  });
  paper.appendChild(text);
  if (lang === 'ru') paper.appendChild(el('small', 'note-ru', b.ru));
  c.stage.appendChild(paper);

  let right: HTMLElement;
  if (b.pebbles) {
    const row = el('div', 'note-pebbles');
    for (const colour of b.pebbles) { const p = el('span', 'note-pebble'); p.style.background = colour; row.appendChild(p); }
    c.stage.appendChild(row);
  }
  if (typeof b.options[0] === 'number') {
    right = options(c, b.options as number[], (v) => note.answer(spec, st, b.options.indexOf(v)) === 'right');
  } else {
    const row = el('div', 'note-row');
    const list = b.options.map((o, i) => {
      const p = el('button', 'it big note-pic', String(o));
      tap(p, () => {
        if (note.answer(spec, st, i) !== 'right') { p.classList.add('no'); c.wrong(p); return; }
        if (!c.alive) return;
        p.classList.add('yes');
        c.right();
      });
      row.appendChild(p);
      return p;
    });
    c.stage.appendChild(row);
    right = list[b.answer];
    c.cheat = () => right.dispatchEvent(new PointerEvent('pointerdown'));
  }

  c.hint = hintOf(spec.hint, pulseOf(right), {
    readAlong: () => {
      const round = c.wrongs;
      void (async () => {
        for (const w of words) {
          if (!c.alive || c.wrongs !== round) break;
          w.classList.add('lit');
          await wait(WORD_MS);
          w.classList.remove('lit');
        }
      })();
    },
    slowly: () => {
      c.hooks.screen?.({ key: 'h2_note', en: [] });
      for (const w of words) if (b.key.includes(bare(w.textContent ?? ''))) w.classList.add('key');
    },
  });
}
