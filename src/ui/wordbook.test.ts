// @vitest-environment happy-dom
/**
 * The talking book's pages (Season 2, step 2, part H; src/ui/wordbook.ts, src/ui/book.ts): the words met, a page a world,
 * a tap - Isabella's word, 0.4 s, its phrase, the same picture again the word only (wordbook §2.1); "hello" and one of its
 * four phrases, never the one of last time (R24); Ukrainian as text only, the cat silent (R20); the map of Pip and the
 * notes (R05, R16). On the page's own markup (index.html).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { setEnVoice, WORDS, type EnVoice, type WordId } from '../s2/types';
import { EN, VARIANTS } from '../s2/strings-en';
import { NOTE_IDS, NOTE_TEXTS, SYLLABLES, noteTextOk, strings as bookStrings } from '../s2/strings-book';

// the cat's voice: never heard in the talking book (R20)
const catSay = vi.hoisted(() => vi.fn(() => Promise.resolve()));
vi.mock('../core/audio', async (orig) => ({ ...(await orig<typeof import('../core/audio')>()), say: catSay }));

const fsModule = 'node:fs';
let wb: typeof import('./wordbook');
let book: typeof import('./book');
let strings: typeof import('./strings');
let finds: typeof import('./finds');
const $ = (id: string) => document.getElementById(id)!;
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

/** What Isabella was asked to say, a call a row. */
let said: string[][] = [];
const fake: EnVoice = { say: (ids) => { said.push([ids].flat()); return Promise.resolve(); }, has: () => true };
const flat = () => said.flat();

beforeAll(async () => {
  const { readFileSync } = await import(/* @vite-ignore */ fsModule) as { readFileSync: (p: string, e: 'utf8') => string };
  const page = readFileSync('index.html', 'utf8');
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(page)![1].replace(/<script[\s\S]*?<\/script>/g, '');
  strings = await import('./strings');
  strings.addStrings(bookStrings, false);
  wb = await import('./wordbook');
  book = await import('./book');
  finds = await import('./finds');
});

function save(words: WordId[] = [], o: Partial<Save> = {}): Save {
  const s = defaultSave();
  s.words = [...words];
  return Object.assign(s, o);
}
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const tap = async (sel: string) => { q(sel).click(); await tick(0); };
const tabs = () => [...document.querySelectorAll<HTMLElement>('#bookTabs button')].map((b) => b.dataset.tab);

beforeEach(() => {
  vi.useFakeTimers();
  said = [];
  catSay.mockClear();
  setEnVoice(fake);
  strings.setLang('uk');
  wb.wordbookState.fresh.clear();
  wb.wordbookState.greeted = false;
  wb.wordbookState.page = 'hub';
  $('btnBook').classList.remove('fresh');
});
afterEach(() => { book.bookView(false, save()); vi.useRealTimers(); setEnVoice(null); });

const HUB: WordId[] = ['hello', 'goodbye', 'cat', 'bird', 'tree'];
const open = async (s: Save, tab?: string) => { book.bookView(true, s); if (tab) await tap(`#bookTabs [data-tab=${tab}]`); said = []; };
const openPip = async (s: Save) => { await open(s, 'words'); await tap('#wordPages [data-page=pip]'); said = []; };

describe('the words of the book (wordbook §1, R22)', () => {
  it('six pages, a world each, the forty words once each in their order: the hub 5, the fairies 10, the forest 9, then 6, 5, 5', () => {
    expect(wb.PAGES.flatMap((p) => p.words)).toEqual([...WORDS]);
    expect(wb.PAGES.map((p) => [p.world, p.words.length])).toEqual([['hub', 5], ['fairy', 10], ['forest', 9], ['sea', 6], ['sweet', 5], ['sky', 5]]);
  });

  it('every word has its picture, its clip and its phrase, and its caption in both languages', () => {
    const table = bookStrings.table;
    for (const w of WORDS) {
      expect(finds.wordIcon(w), w).not.toContain('❔');
      expect(EN.has(`wb_w_${w}`), `the clip of ${w}`).toBe(true);
      expect(EN.has(`wb_p_${w}`) || VARIANTS.has(`wb_p_${w}`), `the phrase of ${w}`).toBe(true);
      const k = `book_w_${w}` as keyof typeof table.uk;
      expect(table.uk[k], w).toBeTruthy();
      expect(table.ru[k], w).toBeTruthy();
      // the syllables of "read and match" are the Ukrainian caption cut
      expect(SYLLABLES[w].replace(/-/g, ''), w).toBe(table.uk[k]);
    }
    // the apple is drawn (wordbook §5 ☐: the one word with no picture in the game)
    expect(finds.wordIcon('apple')).toContain('<svg');
  });
});

describe('a word met lies in the book (wordbook §2.1)', () => {
  it('meetWord: into save.words, a mark on the button of the book, Isabella\'s "A new word!"; the book does not open', () => {
    const s = save();
    expect(wb.meetWord(s, 'owl')).toBe(true);
    expect(s.words).toEqual(['owl']);
    expect($('btnBook').classList.contains('fresh')).toBe(true);
    expect(said).toEqual([['wb_new']]);
    expect($('book').classList.contains('hidden')).toBe(true);
    // met before, or not a word of the book: nothing
    said = [];
    expect(wb.meetWord(s, 'owl')).toBe(false);
    expect(wb.meetWord(s, 'dragon')).toBe(false);
    expect(s.words).toEqual(['owl']);
    expect(said).toEqual([]);
    // quiet: the mark only
    expect(wb.meetWord(s, 'fox', true)).toBe(true);
    expect(said).toEqual([]);
  });

  it('the tab of words comes with the first word; the mark goes once the page is looked at, not while another tab is open', async () => {
    const s = save();
    book.bookView(true, s);
    expect(tabs()).not.toContain('words');
    book.bookView(false, s);
    for (const w of HUB) wb.meetWord(s, w, true);
    await open(s);
    expect(tabs()).toContain('words');
    expect(q('#bookTabs [data-tab=words]').classList.contains('fresh')).toBe(true);
    expect($('btnBook').classList.contains('fresh'), 'the shelf open: the words not seen yet').toBe(true);
    await tap('#bookTabs [data-tab=words]');
    expect($('btnBook').classList.contains('fresh')).toBe(false);
    expect(q('#bookTabs [data-tab=words]').classList.contains('fresh')).toBe(false);
  });
});

describe('the page of words', () => {
  it('the pages met only; on a page its words met in colour with the English large and the Ukrainian small, the others silhouettes', async () => {
    const s = save(['hello', 'cat', 'owl']);
    await open(s, 'words');
    expect([...document.querySelectorAll<HTMLElement>('#wordPages [data-page]')].map((b) => b.dataset.page)).toEqual(['hub', 'forest']);
    const tiles = [...document.querySelectorAll<HTMLElement>('#words [data-word]')];
    expect(tiles.map((b) => [b.dataset.word, b.dataset.state])).toEqual([['hello', 'met'], ['goodbye', 'sil'], ['cat', 'met'], ['bird', 'sil'], ['tree', 'sil']]);
    expect(q('#words [data-word=cat] .en').textContent).toBe('Cat');
    expect(q('#words [data-word=cat] .tr').textContent).toBe('кіт');
    expect(q('#words [data-word=bird] .en')).toBeNull();
    // the Russian interface: the caption in Russian, the English the same
    strings.setLang('ru');
    book.renderProfile(s);
    expect(q('#words [data-word=cat] .tr').textContent).toBe('кот');
    expect(q('#words [data-word=cat] .en').textContent).toBe('Cat');
  });

  it('the first look of the launch: Isabella says hello and "Touch a picture!", its Ukrainian under the pictures; not again', async () => {
    const s = save(HUB);
    book.bookView(true, s);
    said = [];
    await tap('#bookTabs [data-tab=words]');
    expect(said).toEqual([['wb_hello', 'wb_touch']]);
    expect($('wordsSay').textContent).toBe(EN.get('wb_touch')!.uk);
    said = [];
    await tap('#bookTabs [data-tab=shelf]');
    await tap('#bookTabs [data-tab=words]');
    expect(flat()).not.toContain('wb_hello');
  });

  it('a tap: the word, 0.4 s, its phrase; the same picture again - the word only; another picture between - the phrase again', async () => {
    const s = save(['owl', 'fox', 'hedgehog']);
    await open(s, 'words');
    said = [];
    await tap('#words [data-word=owl]');
    expect(said).toEqual([['wb_w_owl']]);
    await tick(399);
    expect(said).toEqual([['wb_w_owl']]);
    await tick(1);
    expect(said).toEqual([['wb_w_owl'], ['wb_p_owl']]);
    said = [];
    await tap('#words [data-word=owl]');
    await tick(1000);
    expect(said, 'the second tap of the same picture').toEqual([['wb_w_owl']]);
    said = [];
    await tap('#words [data-word=fox]');
    await tick(1000);
    await tap('#words [data-word=owl]');
    await tick(1000);
    expect(said).toEqual([['wb_w_fox'], ['wb_p_fox'], ['wb_w_owl'], ['wb_p_owl']]);
  });

  it('a tap on another picture before the phrase cuts it: only the new word and its phrase follow', async () => {
    const s = save(['owl', 'fox', 'hedgehog']);
    await open(s, 'words');
    await tap('#words [data-word=owl]');
    await tick(200);
    await tap('#words [data-word=fox]');
    await tick(1000);
    expect(said).toEqual([['wb_w_owl'], ['wb_w_fox'], ['wb_p_fox']]);
  });

  it('"hello" is followed by its set of phrases (R24): the voice picks one of the four, never the one of last time', async () => {
    const s = save(HUB);
    await open(s, 'words');
    await tap('#words [data-word=hello]');
    await tick(400);
    expect(said).toEqual([['wb_w_hello'], ['wb_p_hello']]);
    expect(VARIANTS.get('wb_p_hello')).toEqual(['wb_p_hello_1', 'wb_p_hello_2', 'wb_p_hello_3', 'wb_p_hello_4']);
  });

  it('"hello" with the real voice of English: twenty times over, never the same phrase twice in a row (R24)', async () => {
    class Clip { static made: Clip[] = []; volume = 1; error = null; onplaying: (() => void) | null = null; onended: (() => void) | null = null; onerror: (() => void) | null = null;
      constructor(public src: string) { Clip.made.push(this); }
      play() { this.onplaying?.(); queueMicrotask(() => this.onended?.()); return Promise.resolve(); } pause() {} }
    vi.stubGlobal('Audio', Clip);
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve({ ok: true })));
    const en = await import('../core/voice-en');
    en.installEnVoice({ volume: () => 1, debug: false });
    try {
      const s = save(HUB);
      await open(s, 'words');
      for (let i = 0; i < 20; i++) {
        await tap('#words [data-word=hello]'); await tick(1000);
        await tap('#words [data-word=cat]'); await tick(1000);
      }
      const phrases = Clip.made.map((c) => /en\/(wb_p_hello_\d)\.mp3$/.exec(c.src)?.[1]).filter(Boolean);
      expect(phrases.length).toBe(20);
      for (let i = 1; i < phrases.length; i++) expect(phrases[i], `hello ${i}`).not.toBe(phrases[i - 1]);
    } finally { vi.unstubAllGlobals(); setEnVoice(fake); }
  });

  it('every picture of the page heard: "Turn the page!", once - when there is another page to turn to', async () => {
    const s = save(['hello', 'cat', 'owl']);
    await open(s, 'words');
    await tap('#words [data-word=hello]'); await tick(500);
    expect(flat()).not.toContain('wb_page');
    await tap('#words [data-word=cat]'); await tick(500);
    expect(said.at(-1)).toEqual(['wb_page']);
    said = [];
    await tap('#words [data-word=hello]'); await tick(500);
    expect(flat()).not.toContain('wb_page');
    // one page only: nowhere to turn
    const one = save(['hello', 'cat']);
    book.bookView(false, one);
    await open(one, 'words');
    await tap('#words [data-word=hello]'); await tick(500);
    await tap('#words [data-word=cat]'); await tick(500);
    expect(flat()).not.toContain('wb_page');
  });

  it('the games of the page come with its third word', async () => {
    const s = save(['hello', 'cat']);
    await open(s, 'words');
    expect(document.querySelectorAll('#wordGames [data-game]').length).toBe(0);
    s.words.push('tree');
    book.renderProfile(s);
    expect([...document.querySelectorAll<HTMLElement>('#wordGames [data-game]')].map((b) => b.dataset.game)).toEqual(['listen', 'yesno', 'read']);
  });

  it('the games of a page are over its words and those of the pages before it', () => {
    const s = save(['hello', 'cat', 'tree', 'owl', 'fox', 'frog', 'fish']);
    const forest = wb.PAGES.find((p) => p.world === 'forest')!;
    expect(wb.gamePool(s, forest)).toEqual(['hello', 'cat', 'tree', 'owl', 'fox', 'frog']);
  });

  it('the cat says nothing in the talking book: Ukrainian is text only (R20)', async () => {
    const s = save(HUB, { shelfSeen: true });
    await open(s, 'words');
    await tap('#words [data-word=cat]'); await tick(500);
    await tap('#wordGames [data-game=listen]');
    expect(catSay).not.toHaveBeenCalled();
  });

  it('the book closed after a game: "See you soon!"; closed without one: silence', async () => {
    const s = save(HUB);
    await open(s, 'words');
    book.bookView(false, s);
    expect(flat()).not.toContain('wb_bye');
    await open(s, 'words');
    await tap('#wordGames [data-game=yesno]');
    said = [];
    book.bookView(false, s);
    expect(said.at(-1)).toEqual(['wb_bye']);
  });
});

describe('the tabs of the book', () => {
  it('without Season 2 the six of before; the talking book\'s tab comes with a word or with Pip: seven fit a row', () => {
    book.bookView(true, save());
    expect(tabs()).toEqual(['shelf', 'secrets', 'collect', 'picture', 'pets', 'ach']);
    expect($('bookTabs').classList.contains('many')).toBe(false);
    book.bookView(false, save());
    const s = save(HUB, { pip: { met: true, pieces: [], cap: 'purple' } });
    book.bookView(true, s);
    expect(tabs()).toEqual(['shelf', 'secrets', 'collect', 'picture', 'pets', 'ach', 'words']);
    expect($('bookTabs').classList.contains('many')).toBe(true);
    book.bookView(false, s);
    // Pip met, no word yet: the tab is there for his page
    book.bookView(true, save([], { pip: { met: true, pieces: [], cap: 'purple' } }));
    expect(tabs()).toContain('words');
  });

  it('each tab opens its own pane; the page of Pip, after the pages of words, opens the map and the notes', async () => {
    const s = save(HUB, { pip: { met: true, pieces: [1], cap: 'purple' }, notes: ['note_1'] });
    await open(s);
    const shown = () => [...document.querySelectorAll('#book .book-pane')].filter((p) => !p.classList.contains('hidden')).map((p) => p.id);
    await tap('#bookTabs [data-tab=words]');
    expect(shown()).toEqual(['bookWords']);
    // the tab of the talking book hides the stars and the scenes of the shelf (CSS on the tab of the book)
    expect($('book').dataset.tab).toBe('words');
    expect([...document.querySelectorAll<HTMLElement>('#wordPages [data-page]')].map((b) => b.dataset.page)).toEqual(['hub', 'pip']);
    await tap('#wordPages [data-page=pip]');
    expect(shown()).toEqual(['bookWords', 'bookMap', 'bookNotes']);
    expect($('words').classList.contains('hidden')).toBe(true);
    expect($('wordsSay').classList.contains('hidden')).toBe(true);
    await tap('#bookTabs [data-tab=shelf]');
    expect(shown()).toEqual(['bookShelf']);
    expect($('book').dataset.tab).toBe('shelf');
    // back on the tab: the page of Pip again, the words hidden
    await tap('#bookTabs [data-tab=words]');
    expect(shown()).toEqual(['bookWords', 'bookMap', 'bookNotes']);
    await tap('#wordPages [data-page=hub]');
    expect(shown()).toEqual(['bookWords']);
    expect($('words').classList.contains('hidden')).toBe(false);
  });
});

describe('the map of Pip and the notes (R05, R16: minimal)', () => {
  it('the map: five places, the pieces found lit', async () => {
    const s = save(HUB, { pip: { met: true, pieces: [1, 2], cap: 'purple' } });
    await openPip(s);
    expect([...document.querySelectorAll<HTMLElement>('#pipMap [data-piece]')].map((b) => b.dataset.state)).toEqual(['got', 'got', 'sil', 'sil', 'sil']);
    expect($('notesSay').textContent).toBe('Шматочки карти Піпа: 2 з 5 · Записки: 0 з 8');
    expect($('mapSay').classList.contains('hidden'), 'no place picked: one line for the page').toBe(true);
    await tap('#pipMap [data-piece="3"]');
    expect($('mapSay').textContent).toBe('Підводне королівство · Цей шматочок ще чекає на тебе.');
    // the pieces the save has, whichever they are
    s.pip.pieces = [2];
    book.renderProfile(s);
    expect([...document.querySelectorAll<HTMLElement>('#pipMap [data-piece]')].map((b) => b.dataset.state)).toEqual(['sil', 'got', 'sil', 'sil', 'sil']);
  });

  it('the notes: eight, a found one lit; a tap shows its text in Ukrainian, its Russian small with the Russian interface', async () => {
    const s = save(HUB, { pip: { met: true, pieces: [], cap: 'purple' }, notes: ['note_2', 'note_9'] });
    await openPip(s);
    expect([...document.querySelectorAll<HTMLElement>('#notes [data-note]')].map((b) => b.dataset.state))
      .toEqual(['sil', 'got', 'sil', 'sil', 'sil', 'sil', 'sil', 'sil']);
    expect($('notesSay').textContent).toBe('Шматочки карти Піпа: 0 з 5 · Записки: 1 з 8');
    expect($('noteText').classList.contains('hidden')).toBe(true);
    await tap('#notes [data-note=note_2]');
    expect($('noteText').classList.contains('hidden')).toBe(false);
    expect($('noteText').textContent).toBe(NOTE_TEXTS.note_2.uk);
    expect($('notesSay').classList.contains('hidden'), 'the text of the note instead of the line').toBe(true);
    strings.setLang('ru');
    book.renderProfile(s);
    expect(q('#noteText .uk').textContent, 'the note stays Ukrainian (R08)').toBe(NOTE_TEXTS.note_2.uk);
    expect(q('#noteText .ru').textContent).toBe(NOTE_TEXTS.note_2.ru);
    // one not found: no text, the line says so
    await tap('#notes [data-note=note_3]');
    expect($('noteText').classList.contains('hidden')).toBe(true);
    expect($('notesSay').textContent).toBe(bookStrings.table.ru.book_note_wait);
  });

  it('the texts of the notes: the eight of the layout, both languages, numbers as words, no placeholder', () => {
    expect(Object.keys(NOTE_TEXTS)).toEqual([...NOTE_IDS]);
    for (const id of NOTE_IDS) for (const l of ['uk', 'ru'] as const) expect(noteTextOk(NOTE_TEXTS[id][l]), `${id} ${l}`).toBe(true);
    expect(noteTextOk('Три — під кущем, 1 — на пеньку.')).toBe(false);
    expect(noteTextOk('Привіт, {name}!')).toBe(false);
    expect(noteTextOk(' ')).toBe(false);
  });
});

describe('opening the book changes nothing in the save', () => {
  it('the pages of words, the map, the notes: drawn and tapped, the save is as it was', async () => {
    const s = save(HUB, { pip: { met: true, pieces: [1], cap: 'purple' }, notes: ['note_1'], shelfSeen: true });
    const before = JSON.stringify(s);
    await open(s, 'words');
    await tap('#words [data-word=cat]'); await tick(500);
    await tap('#wordPages [data-page=pip]');
    await tap('#pipMap [data-piece="1"]');
    await tap('#notes [data-note=note_1]');
    expect(JSON.stringify(s)).toBe(before);
  });
});
