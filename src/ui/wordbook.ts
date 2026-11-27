/**
 * The talking book's pages (idea/proposal/season2-wordbook-2026-11-26/wordbook.md §1-§3, Season 2 step 2, part H): the
 * words she has met, a page a world, and the two small pages of the step - the map of Pip and the notes (R05, R16).
 * - A word lies in the book once it is in `save.words` (`meetWord`: part G puts it there at Pip's). A new word is a mark
 *   on the button of the book and Isabella's "A new word!"; the book does not open by itself (wordbook §2.1).
 * - A tap on a picture: Isabella says the word, 0.4 s, its phrase; the same picture again - the word only. "Hello" is
 *   followed by one of its four phrases, never the one of last time (R24, src/core/voice-en.ts).
 * - Under a picture the English word large and its Ukrainian (or Russian, with the Russian interface) small; the
 *   Ukrainian is text only, the cat says nothing here (R20).
 * - A page with three words or more has the book's three games (src/ui/wordbook-games.ts): no star, no skill (R21).
 * - The map of Pip: five places, a piece of `save.pip.pieces` lit. The notes: the eight of step 2, a found one lit, a tap
 *   shows its text (src/s2/strings-book.ts `NOTE_TEXTS`).
 * Everything is drawn from the save at each call; nothing here writes the save but `meetWord`.
 */
import type { Save } from '../core/save';
import { isWord, WORDS, type WordId } from '../s2/types';
import { EN } from '../s2/strings-en';
import { NOTE_IDS, NOTE_TEXTS } from '../s2/strings-book';
import { wordIcon } from './finds';
import { GAMES, hush, sayWord, speak, startGame, stopGame, gameState, type GameKind } from './wordbook-games';
import { lang, t, tf, type Key } from './strings';
import './wordbook.css';

/** A page of the book: a world (`hub` - the Great Tree) and its words, in the order of WORDS (wordbook §1). */
export interface WordPage { world: string; icon: string; words: readonly WordId[] }
const cut = (from: WordId, to: WordId) => WORDS.slice(WORDS.indexOf(from), WORDS.indexOf(to) + 1);
export const PAGES: readonly WordPage[] = [
  { world: 'hub', icon: '🌳', words: cut('hello', 'tree') },
  { world: 'fairy', icon: '🧚', words: cut('flower', 'three') },
  { world: 'forest', icon: '🌲', words: cut('owl', 'five') },
  { world: 'sea', icon: '🌊', words: cut('fish', 'sun') },
  { world: 'sweet', icon: '🍭', words: cut('cake', 'apple') },
  { world: 'sky', icon: '☁️', words: cut('cloud', 'sheep') },
];
/** A page opens its games with this many words met on it (wordbook §3). */
export const GAME_FROM = 3;
/** The worlds of the map of Pip, a piece each: the first is found in the fairies' world (layout §2). */
export const MAP_PLACES = ['fairy', 'forest', 'sea', 'sweet', 'sky'] as const;

/** The words of the book she has met, as the save has them (an id of a later version is kept there, not shown). */
export const metWords = (save: Save): WordId[] => WORDS.filter((w) => save.words.includes(w));
/** The pages with a word met on them. */
export const openPages = (save: Save) => PAGES.filter((p) => p.words.some((w) => save.words.includes(w)));
/** The page of Pip (the map and the notes, after the pages of words): once she has met him, or found a piece or a note. */
export const PIP_PAGE = 'pip';
export const pipOpen = (save: Save) => save.pip.met || save.pip.pieces.length > 0 || save.notes.length > 0;
/** The words of the games of `page`: those met on it and on the pages before it. */
export function gamePool(save: Save, page: WordPage): WordId[] {
  const upTo = PAGES.slice(0, PAGES.indexOf(page) + 1).flatMap((p) => p.words);
  return upTo.filter((w) => save.words.includes(w));
}

/** What the book's pages keep for this launch (and what the walkthrough reads): nothing of it is in the save. */
export const wordbookState = {
  /** The words met since the page of words was last looked at: the mark on the button of the book. */
  fresh: new Set<WordId>(),
  /** The page of words shown, the picture tapped last, the pictures heard on the page this opening. */
  page: 'hub', last: null as WordId | null, heard: new Set<WordId>(),
  /** Isabella has said hello (the first look at the words this launch), "turn the page" on these pages. */
  greeted: false, turned: new Set<string>(),
  /** The note shown (its text open), -1 none; the place of the map picked. */
  note: -1, place: -1,
};

const $ = (id: string) => document.getElementById(id);
const say = (k: Key) => t(k);
/** A frame of the book in the language of the game: its English is the clip, this the line under the pictures. */
const frame = (id: string) => { const l = EN.get(id); return l ? (lang === 'ru' ? l.ru : l.uk) : ''; };

/** The mark of new words on the button of the book (and on the tab of words, src/ui/book.ts). */
function mark() { $('btnBook')?.classList.toggle('fresh', wordbookState.fresh.size > 0); }

/**
 * She has met the word `id` (part G, at Pip's): it lies in the book from now on - `save.words`, in the order met - and,
 * new, it marks the button of the book and Isabella says "A new word!" (`quiet`: the mark only, for several words at
 * once the caller says it itself). The caller stores the save. False: not a word of the book, or met before.
 */
export function meetWord(save: Save, id: string, quiet = false): boolean {
  if (!isWord(id) || save.words.includes(id)) return false;
  save.words.push(id);
  wordbookState.fresh.add(id);
  mark();
  if (!quiet) void speak('wb_new');
  return true;
}

/** A tap on the picture of `id`: the word and its phrase, the same picture again - the word only; all heard - "turn the page". */
export async function tapWord(save: Save, id: WordId) {
  const again = wordbookState.last === id;
  wordbookState.last = id;
  wordbookState.heard.add(id);
  const page = PAGES.find((p) => p.words.includes(id));
  await sayWord(id, again);
  if (again || !page || wordbookState.last !== id || wordbookState.turned.has(page.world)) return;
  const met = page.words.filter((w) => save.words.includes(w));
  if (openPages(save).length > 1 && met.every((w) => wordbookState.heard.has(w))) {
    wordbookState.turned.add(page.world);
    void speak('wb_page');
  }
}

const button = (cls: string, html: string, on: () => void) => {
  const b = document.createElement('button');
  b.className = cls; b.innerHTML = html; b.addEventListener('click', on);
  return b;
};

/**
 * Draws the talking book's tab: the row of its pages - the worlds met, then the page of Pip - and the page open: a world's
 * pictures (a silhouette for a word not met yet) and its games, or Pip's map and notes (the panes #bookMap, #bookNotes).
 * `seen`: the tab is open, so the new words of the page in view are not new any more, and Pip's panes may show.
 */
export function renderWords(save: Save, seen = true) {
  const pagesBox = $('wordPages'), box = $('words'), games = $('wordGames'), line = $('wordsSay'), game = $('wordGame');
  if (!pagesBox || !box || !games || !line || !game) return;
  const pages = openPages(save), pip = pipOpen(save);
  const ids = [...pages.map((p) => p.world), ...(pip ? [PIP_PAGE] : [])];
  if (!ids.includes(wordbookState.page)) wordbookState.page = ids[0] ?? 'hub';
  const onPip = wordbookState.page === PIP_PAGE;
  $('bookWords')?.classList.toggle('pip', onPip);
  $('bookMap')?.classList.toggle('hidden', !(seen && onPip));
  $('bookNotes')?.classList.toggle('hidden', !(seen && onPip));
  const playing = gameState.kind !== null && !gameState.done && game.childElementCount > 0;
  for (const el of [pagesBox, box, games]) el.classList.toggle('hidden', playing);
  for (const el of [box, line]) el.classList.toggle('hidden', playing || onPip);
  game.classList.toggle('hidden', !playing);
  pagesBox.innerHTML = ''; box.innerHTML = ''; games.innerHTML = '';
  for (const id of ids) {
    const p = PAGES.find((x) => x.world === id);
    const b = button('wpage' + (id === wordbookState.page ? ' sel' : ''), p ? p.icon : '🗺️', () => {
      if (wordbookState.page === id) return;
      wordbookState.page = id; wordbookState.last = null; renderWords(save); refreshTab();
    });
    b.dataset.page = id; b.setAttribute('aria-label', say(p ? `book_page_${id}` as Key : 'book_pip_t')); b.title = b.getAttribute('aria-label')!;
    pagesBox.appendChild(b);
  }
  if (onPip) { mark(); return; }
  if (!pages.length) { line.textContent = say('book_words_none'); mark(); return; }
  const page = PAGES.find((p) => p.world === wordbookState.page)!;
  for (const w of page.words) {
    const met = save.words.includes(w);
    const tile = button('word' + (met ? '' : ' sil') + (wordbookState.fresh.has(w) ? ' new' : ''),
      `<span class="pic">${wordIcon(w)}</span>` + (met ? `<span class="en">${EN.get(`wb_w_${w}`)?.text.replace(/[.!…]+$/, '') ?? w.replace('_', ' ')}</span><span class="tr">${say(`book_w_${w}`)}</span>` : ''),
      () => { if (met) void tapWord(save, w); });
    tile.dataset.word = w; tile.dataset.state = met ? 'met' : 'sil';
    if (!met) tile.disabled = true;
    box.appendChild(tile);
  }
  const pool = gamePool(save, page);
  if (page.words.filter((w) => save.words.includes(w)).length >= GAME_FROM) {
    for (const g of GAMES) {
      const b = button('wgame', g.icon, () => play(save, g.id, pool));
      b.dataset.game = g.id; b.setAttribute('aria-label', say(`book_g_${g.id}` as Key)); b.title = b.getAttribute('aria-label')!;
      games.appendChild(b);
    }
  }
  line.textContent = frame('wb_touch');
  // the page has been looked at: its new words are not new any more
  if (seen) for (const w of page.words) wordbookState.fresh.delete(w);
  mark();
}

/** The mark of the tab of words follows the new words left (src/ui/book.ts draws the tab). */
function refreshTab() { document.querySelector('#bookTabs [data-tab=words]')?.classList.toggle('fresh', wordbookState.fresh.size > 0); }

function play(save: Save, kind: GameKind, pool: WordId[]) {
  const game = $('wordGame');
  if (!game) return;
  startGame(kind, pool, { box: game, back: () => { game.innerHTML = ''; renderWords(save); } });
  renderWords(save);
  $('wordsSay')!.textContent = frame(kind === 'yesno' ? 'wb_yesno' : kind === 'listen' ? 'wb_find' : 'wb_touch');
}

/** The page of words is opened: on the first look of this launch Isabella says hello and how the book works. */
export function wordsOpened(save: Save) {
  renderWords(save);
  refreshTab();
  if (!wordbookState.greeted && metWords(save).length) { wordbookState.greeted = true; void speak(['wb_hello', 'wb_touch']); }
}

/** The map of Pip (R16, minimal): five places, the piece of each lit once found (`save.pip.pieces`). */
export function renderMap(save: Save) {
  const box = $('pipMap'), line = $('mapSay');
  if (!box || !line) return;
  box.innerHTML = '';
  const got = (n: number) => save.pip.pieces.includes(n);
  MAP_PLACES.forEach((w, i) => {
    const n = i + 1, page = PAGES.find((p) => p.world === w)!;
    const b = button('mpiece' + (got(n) ? ' got' : ' sil') + (wordbookState.place === i ? ' sel' : ''), `<span class="ic">${page.icon}</span><span class="cap">${n}</span>`,
      () => { wordbookState.place = i; renderMap(save); });
    b.dataset.piece = String(n); b.dataset.state = got(n) ? 'got' : 'sil'; b.setAttribute('aria-label', say(`book_page_${w}` as Key));
    box.appendChild(b);
  });
  // the count of the pieces is on the line of the notes (one line for the page): this one names the place picked
  const i = wordbookState.place;
  line.classList.toggle('hidden', i < 0);
  line.innerHTML = i < 0 ? '' : `<b>${say(`book_page_${MAP_PLACES[i]}` as Key)}</b>` + (got(i + 1) ? '' : ` · ${say('book_map_wait')}`);
}

/** The notes (R16, minimal): the eight of step 2, a found one lit; a tap on it shows its text, Ukrainian (R08). */
export function renderNotes(save: Save) {
  const box = $('notes'), text = $('noteText'), line = $('notesSay');
  if (!box || !text || !line) return;
  box.innerHTML = '';
  const found = (id: string) => save.notes.includes(id);
  NOTE_IDS.forEach((id, i) => {
    const b = button('tile note' + (found(id) ? ' got' : ' sil') + (wordbookState.note === i ? ' sel' : ''),
      `<span class="ic">🔖</span><span class="cap">${i + 1}</span>`, () => { wordbookState.note = i; renderNotes(save); });
    b.dataset.note = id; b.dataset.state = found(id) ? 'got' : 'sil'; b.setAttribute('aria-label', tf('book_note_n', { n: i + 1 }));
    box.appendChild(b);
  });
  const i = wordbookState.note, id = NOTE_IDS[i];
  text.classList.toggle('hidden', !(id && found(id)));
  text.innerHTML = id && found(id) ? `<span class="uk">${NOTE_TEXTS[id].uk}</span>` + (lang === 'ru' ? `<span class="ru">${NOTE_TEXTS[id].ru}</span>` : '') : '';
  // a note open: its text instead of the line (the page of Pip fits 844x390 without scrolling)
  line.classList.toggle('hidden', !!(id && found(id)));
  const pieces = MAP_PLACES.filter((_, k) => save.pip.pieces.includes(k + 1)).length;
  line.textContent = id && !found(id) ? say('book_note_wait')
    : `${tf('book_map', { n: pieces, of: MAP_PLACES.length })} · ${tf('book_notes', { n: NOTE_IDS.filter(found).length, of: NOTE_IDS.length })}`;
}

/** The book opens (true): a fresh look at its pages. Closes (false): the game ends; after one, Isabella says goodbye. */
export function wordbookView(open: boolean) {
  if (open) {
    Object.assign(wordbookState, { last: null, note: -1, place: -1 });
    wordbookState.heard.clear(); wordbookState.turned.clear();
    gameState.played = 0;
    return;
  }
  const after = gameState.played > 0;
  stopGame();
  const game = $('wordGame');
  if (game) game.innerHTML = '';
  if (after) void speak('wb_bye'); else hush();
  gameState.played = 0;
}

/** Leaving the page of words for another tab: the game there ends, nothing more is said. */
export function wordsLeft() {
  stopGame();
  const game = $('wordGame');
  if (game) game.innerHTML = '';
  hush();
}
