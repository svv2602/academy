// @vitest-environment happy-dom
/**
 * The games of the talking book (Season 2, step 2, part H; src/ui/wordbook-games.ts, wordbook §3): five questions a round
 * over the words met; "yes or no?" half right, never three the same answers in a row; a mistake is "Let's look again.",
 * never "wrong" or "no" (R26); the second mistake lights the right answer; only for the fun of it - no star, no skill (R21).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { setEnVoice, type EnVoice, type WordId } from '../s2/types';
import { EN } from '../s2/strings-en';
import { strings as bookStrings } from '../s2/strings-book';

// a game that would count as a task would go through these: none of them may be called
const recordTask = vi.hoisted(() => vi.fn());
vi.mock('../game/skills', async (orig) => ({ ...(await orig<typeof import('../game/skills')>()), recordTask }));
// the game the book is opened in (src/ui/achieve.ts): its save and its stars are within reach of the book, and stay untouched
const game = vi.hoisted(() => ({ save: null as unknown, world: null, ws: null, addStars: vi.fn(), persist: vi.fn() }));
vi.mock('./achieve', async (orig) => ({ ...(await orig<typeof import('./achieve')>()), achGame: game }));

const fsModule = 'node:fs';
let games: typeof import('./wordbook-games');
let book: typeof import('./book');
let strings: typeof import('./strings');
const q = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel)!;

let said: string[][] = [];
const fake: EnVoice = { say: (ids) => { said.push([ids].flat()); return Promise.resolve(); }, has: () => true };
const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const tap = async (el: Element) => { (el as HTMLElement).click(); await tick(1000); };

beforeAll(async () => {
  const { readFileSync } = await import(/* @vite-ignore */ fsModule) as { readFileSync: (p: string, e: 'utf8') => string };
  const page = readFileSync('index.html', 'utf8');
  document.body.innerHTML = /<body>([\s\S]*)<\/body>/.exec(page)![1].replace(/<script[\s\S]*?<\/script>/g, '');
  strings = await import('./strings');
  strings.addStrings(bookStrings, false);
  games = await import('./wordbook-games');
  book = await import('./book');
});
beforeEach(() => { vi.useFakeTimers(); said = []; recordTask.mockClear(); setEnVoice(fake); strings.setLang('uk'); });
afterEach(() => { games.stopGame(); vi.useRealTimers(); setEnVoice(null); });

const POOL: WordId[] = ['owl', 'fox', 'hedgehog', 'rabbit', 'frog'];
/** A seeded random source: the same rounds each run. */
function seeded(seed: number) { let x = seed; return () => { x = (x * 1103515245 + 12345) % 2147483648; return x / 2147483648; }; }

describe('a round (wordbook §3)', () => {
  it('five questions; three different pictures each, the right one among them, all of the pool; never the same word twice in a row', () => {
    for (let seed = 1; seed <= 200; seed++) for (const kind of ['listen', 'read'] as const) {
      const pool = POOL.slice(0, 3 + (seed % 3));
      const r = games.makeRound(kind, pool, seeded(seed));
      expect(r.length).toBe(games.ROUND);
      r.forEach((x, i) => {
        if (x.kind === 'yesno') throw new Error('a question of another game');
        expect(new Set(x.options).size).toBe(3);
        expect(x.options).toContain(x.answer);
        for (const o of x.options) expect(pool).toContain(o);
        if (i) expect(x.answer, `seed ${seed}, question ${i + 1}`).not.toBe((r[i - 1] as typeof x).answer);
      });
      // five words or more in the pool: each asked once
      if (pool.length >= 5) expect(new Set(r.map((x) => (x as { answer: WordId }).answer)).size).toBe(5);
    }
  });

  it('fewer than three words: no game', () => {
    expect(() => games.makeRound('listen', ['owl', 'fox'])).toThrow();
  });

  it('"yes or no?": two or three "yes" of five, never three the same answers in a row - 1000 rounds, and with a random source stuck at its ends', () => {
    const rands = [Math.random, () => 0, () => 0.9999, seeded(7)];
    for (const rand of rands) for (let i = 0; i < 1000; i++) {
      const a = games.yesNoAnswers(games.ROUND, rand);
      expect(a.length).toBe(5);
      expect([2, 3]).toContain(a.filter(Boolean).length);
      for (let k = 2; k < a.length; k++) expect(a[k] === a[k - 1] && a[k] === a[k - 2], a.join(' ')).toBe(false);
    }
  });

  it('"yes or no?": the word said is the picture\'s exactly when the answer is "yes"', () => {
    for (let seed = 1; seed <= 200; seed++) {
      for (const x of games.makeRound('yesno', POOL, seeded(seed))) {
        if (x.kind !== 'yesno') throw new Error('a question of another game');
        expect(x.said === x.picture).toBe(x.yes);
        expect(POOL).toContain(x.said);
      }
    }
  });
});

/** Plays `kind` in a box of its own; `back` counts the returns to the page. */
function play(kind: 'listen' | 'yesno' | 'read', seed = 3) {
  const box = document.createElement('div');
  document.body.appendChild(box);
  const back = vi.fn();
  const round = games.startGame(kind, POOL, { box, back }, seeded(seed));
  return { box, back, round };
}
const right = (box: HTMLElement, x: import('./wordbook-games').Question) => (x.kind === 'yesno'
  ? box.querySelector(`[data-yes="${x.yes}"]`)! : box.querySelector(`.wg-opt[data-word="${x.answer}"]`)!);
const wrongOne = (box: HTMLElement, x: import('./wordbook-games').Question) => (x.kind === 'yesno'
  ? box.querySelector(`[data-yes="${!x.yes}"]`)! : box.querySelector(`.wg-opt:not([data-word="${x.answer}"])`)!);

describe('playing (R26: no "wrong", no "no")', () => {
  it('"listen and find": "Find…" and the word; a mistake - "Let\'s look again." and the word again; the second lights the right picture', async () => {
    const { box, round } = play('listen');
    const x = round[0] as import('./wordbook-games').PickQ;
    await tick(0);
    expect(said).toEqual([['wb_find', `wb_w_${x.answer}`]]);
    said = [];
    await tap(wrongOne(box, x));
    expect(said).toEqual([['wb_again', `wb_w_${x.answer}`]]);
    expect(box.querySelector('.hint'), 'one mistake: no light yet').toBeNull();
    await tap(wrongOne(box, x));
    expect(box.querySelector('.hint')?.getAttribute('data-word')).toBe(x.answer);
    expect(games.gameState.hinted).toBe(true);
    said = [];
    await tap(right(box, x));
    expect(said[0]).toEqual(['wb_yes']);
    expect(said[1], 'the next word follows').toEqual([`wb_w_${(round[1] as typeof x).answer}`]);
    expect(games.gameState.question).toBe(2);
  });

  it('a whole round: praise in turn, five questions, the end and back to the page; nothing said is "wrong" or "no"', async () => {
    for (const kind of ['listen', 'yesno', 'read'] as const) {
      said = [];
      const { box, back, round } = play(kind);
      await tick(0);
      for (const [i, x] of round.entries()) {
        if (i % 2) await tap(wrongOne(box, x));
        await tap(right(box, x));
      }
      expect(games.gameState.done, kind).toBe(true);
      const praise = said.flat().filter((s) => s === 'wb_yes' || s === 'wb_great');
      expect(praise, kind).toEqual(['wb_yes', 'wb_great', 'wb_yes', 'wb_great', 'wb_yes']);
      // the frame of the game asks "Yes or no?"; nothing else says either word
      for (const id of said.flat().filter((x) => x !== 'wb_yesno')) {
        const text = EN.get(id)?.text ?? EN.get(`${id}_1`)?.text ?? '';
        expect(id.startsWith('wb_'), id).toBe(true);
        expect(text, id).not.toMatch(/\b(wrong|no)\b/i);
      }
      expect(box.querySelector('.wg-done')).not.toBeNull();
      await tap(box.querySelector('button.wg-back')!);
      expect(back, kind).toHaveBeenCalledTimes(1);
    }
  });

  it('"yes or no?": "Yes or no?" and the word said first, then the word alone; the second mistake lights the right thumb', async () => {
    const { box, round } = play('yesno');
    const x = round[0] as import('./wordbook-games').YesNoQ;
    await tick(0);
    expect(said).toEqual([['wb_yesno', `wb_w_${x.said}`]]);
    expect(box.querySelector('.wg-pic')?.getAttribute('data-word')).toBe(x.picture);
    await tap(wrongOne(box, x));
    await tap(wrongOne(box, x));
    expect(box.querySelector('.hint')?.getAttribute('data-yes')).toBe(String(x.yes));
  });

  it('"read and match": the Ukrainian word to read, in Ukrainian with the Russian interface too; its syllables, then its first letter and the picture light; the right one - the word, its phrase, the praise', async () => {
    strings.setLang('ru');
    const { box, round } = play('read');
    const x = round[0] as import('./wordbook-games').PickQ;
    await tick(0);
    expect(said, 'she reads it herself: nothing said first').toEqual([]);
    expect(q('.wg-uk').textContent).toBe(games.ukWord(x.answer));
    expect(box.querySelector('.wg-ru')?.textContent).toBe(bookStrings.table.ru[`book_w_${x.answer}`]);
    await tap(wrongOne(box, x));
    expect(said.at(-1)).toEqual(['wb_again']);
    expect(box.querySelector('.wg-card')!.classList.contains('syllables')).toBe(true);
    expect(box.querySelector('.hint')).toBeNull();
    await tap(wrongOne(box, x));
    expect(box.querySelector('.wg-card')!.classList.contains('first')).toBe(true);
    expect(box.querySelector('.hint')?.getAttribute('data-word')).toBe(x.answer);
    said = [];
    (right(box, x) as HTMLElement).click();
    await tick(0);
    expect(said).toEqual([[`wb_w_${x.answer}`]]);
    await tick(games.WORD_PAUSE_MS);
    expect(said.slice(0, 3)).toEqual([[`wb_w_${x.answer}`], [x.answer === 'hello' ? 'wb_p_hello' : `wb_p_${x.answer}`], ['wb_yes']]);
  });
});

describe('only for the fun of it (R21)', () => {
  it('a whole round of each game from the page of words: no star, no skill - the save as it was, nothing recorded', async () => {
    const s: Save = defaultSave();
    s.words = ['hello', 'goodbye', 'cat', 'bird', 'tree'];
    s.shelfSeen = true;
    game.save = s; game.addStars.mockClear();
    const before = JSON.stringify(s);
    for (const kind of ['listen', 'yesno', 'read'] as const) {
      book.bookView(true, s);
      await tap(q('#bookTabs [data-tab=words]'));
      await tap(q(`#wordGames [data-game=${kind}]`));
      expect(games.gameState.kind).toBe(kind);
      const box = q('#wordGame');
      expect(box.classList.contains('hidden')).toBe(false);
      for (let i = 0; i < games.ROUND; i++) {
        const opts = [...box.querySelectorAll<HTMLElement>('.wg-opt, .wg-yn')];
        // every option tried until the right one: mistakes, hints and praise all played
        for (const o of opts) { if (games.gameState.question !== i + 1 || games.gameState.done) break; await tap(o); }
      }
      expect(games.gameState.done, kind).toBe(true);
      book.bookView(false, s);
    }
    expect(JSON.stringify(s)).toBe(before);
    expect(recordTask).not.toHaveBeenCalled();
    expect(game.addStars).not.toHaveBeenCalled();
  });
});
