/**
 * The games of the talking book (idea/proposal/season2-wordbook-2026-11-26/wordbook.md §3, Season 2 step 2, part H):
 * "listen and find", "yes or no?" and "read and match". Five questions a round, over the words she has met on this page
 * and the pages before it. They are only for the fun of it (R21): no star, no skill - this module has no save to write
 * to and never sees one. A mistake is "Let's look again." (`wb_again`), never "wrong" or "no" (R26); after the second
 * mistake of a question the right answer lights up. "First letter" waits for later (R23).
 *
 * The English is Isabella's clips through the voice of src/s2/types.ts (`enVoice`): a word, 0.4 s, its phrase.
 */
import { enVoice } from '../s2/types';
import { SYLLABLES } from '../s2/strings-book';
import type { WordId } from '../s2/types';
import { wordIcon } from './finds';
import { lang, t, tf } from './strings';
import './wordbook.css';

/** Questions in a round (wordbook §3). */
export const ROUND = 5;
/** The pause between a word and its phrase (wordbook §2.1: "Owl." ... "An owl."). */
export const WORD_PAUSE_MS = 400;

export type GameKind = 'listen' | 'yesno' | 'read';
export const GAMES: readonly { id: GameKind; icon: string }[] = [
  { id: 'listen', icon: '🎧' }, { id: 'yesno', icon: '👍' }, { id: 'read', icon: '📖' },
];
/** "Listen and find" and "read and match": the right word among three pictures. */
export interface PickQ { kind: 'listen' | 'read'; answer: WordId; options: WordId[] }
/** "Yes or no?": a picture and a word said; `yes` - the word is the picture's. */
export interface YesNoQ { kind: 'yesno'; picture: WordId; said: WordId; yes: boolean }
export type Question = PickQ | YesNoQ;

/** The clip of a word, and of its phrase: "hello" has four, said by the name they share (R24). */
export const wordClip = (id: WordId) => `wb_w_${id}`;
export const phraseClip = (id: WordId) => (id === 'hello' ? 'wb_p_hello' : `wb_p_${id}`);

let said = 0;
/** Says `ids` in English and cuts off whatever the book says now, the phrase still waiting after its word too. */
export function speak(ids: string | readonly string[]): Promise<void> {
  said++;
  return enVoice().say(ids);
}
/** Cuts off what the book says: its clip and a phrase still waiting. */
export function hush() { said++; void enVoice().say([]); }
/** A word, 0.4 s, its phrase (`wordOnly`: the word alone); a later line of the book cuts both. */
export async function sayWord(id: WordId, wordOnly = false): Promise<void> {
  const mine = ++said;
  await enVoice().say(wordClip(id));
  if (wordOnly || mine !== said) return;
  await new Promise<void>((resolve) => { setTimeout(resolve, WORD_PAUSE_MS); });
  if (mine !== said) return;
  await enVoice().say(phraseClip(id));
}

/** A random index below `n`. */
const below = (n: number, rand: () => number) => Math.min(n - 1, Math.floor(rand() * n));
function shuffled<T>(xs: readonly T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) { const j = below(i + 1, rand); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** Can `yes` answers "yes" and `no` answers "no" still follow, with no three the same in a row (the last `run` were `last`)? */
function canFinish(yes: number, no: number, last: boolean | null, run: number): boolean {
  if (!yes && !no) return true;
  return (yes > 0 && !(last === true && run >= 2) && canFinish(yes - 1, no, true, last === true ? run + 1 : 1))
    || (no > 0 && !(last === false && run >= 2) && canFinish(yes, no - 1, false, last === false ? run + 1 : 1));
}
/** The answers of a round of "yes or no?": half of them "yes" (of five: two or three), never three the same in a row. */
export function yesNoAnswers(n: number, rand: () => number = Math.random): boolean[] {
  let yes = n % 2 ? Math.floor(n / 2) + below(2, rand) : n / 2, no = n - yes;
  const out: boolean[] = [];
  let last: boolean | null = null, run = 0;
  while (yes + no > 0) {
    const ok = [true, false].filter((v) => (v ? yes : no) > 0 && !(last === v && run >= 2)
      && canFinish(yes - (v ? 1 : 0), no - (v ? 0 : 1), v, last === v ? run + 1 : 1));
    const v = ok[below(ok.length, rand)];
    out.push(v);
    if (v) yes--; else no--;
    run = last === v ? run + 1 : 1; last = v;
  }
  return out;
}

/** The words asked in a round: each once while there are enough of them, never the same twice in a row. */
function answers(pool: readonly WordId[], rand: () => number): WordId[] {
  const out: WordId[] = [];
  while (out.length < ROUND) {
    const next = shuffled(pool, rand).filter((w, i) => i > 0 || w !== out.at(-1));
    out.push(...next.slice(0, ROUND - out.length));
  }
  return out;
}

/**
 * A round of the game `kind` over `pool` (the words she has met on the page and before it, three at least): five
 * questions; three pictures each - the right one and two others of the pool, in a random order.
 */
export function makeRound(kind: GameKind, pool: readonly WordId[], rand: () => number = Math.random): Question[] {
  if (new Set(pool).size < 3) throw new Error(`a game of the book needs three words at least, not ${pool.length}`);
  const asked = answers([...new Set(pool)], rand);
  if (kind === 'yesno') {
    const yes = yesNoAnswers(ROUND, rand);
    return asked.map((picture, i) => {
      const others = pool.filter((w) => w !== picture);
      return { kind, picture, said: yes[i] ? picture : others[below(others.length, rand)], yes: yes[i] };
    });
  }
  return asked.map((answer) => {
    const others = shuffled(pool.filter((w) => w !== answer), rand).slice(0, 2);
    return { kind, answer, options: shuffled([answer, ...others], rand) };
  });
}

/** The Ukrainian word she reads in "read and match": always Ukrainian (R08), its syllables apart for the first hint. */
export const ukWord = (id: WordId) => SYLLABLES[id].replace(/-/g, '');

/** What the walkthrough and the tests read of a game. */
export const gameState = { kind: null as GameKind | null, question: 0, wrong: 0, hinted: false, done: false, played: 0 };

export interface GameHost {
  /** Where the game draws itself. */
  box: HTMLElement;
  /** Back to the page (the round over, or the button). */
  back: () => void;
}

let running: { stop(): void } | null = null;
/** Ends the game that is played now, if any (the book closed, the page left). */
export function stopGame() { running?.stop(); running = null; }

/**
 * Plays a round of `kind` over `pool` in `host.box`. Praise is "Yes! Well done!" and "Great!" in turn; a mistake -
 * "Let's look again." and the word again (in "read and match": its syllables light one by one); the second mistake of a
 * question lights the right answer. Nothing is recorded anywhere.
 */
export function startGame(kind: GameKind, pool: readonly WordId[], host: GameHost, rand: () => number = Math.random) {
  stopGame();
  const round = makeRound(kind, pool, rand);
  let alive = true, q = 0, wrong = 0, praised = 0, busy = false;
  Object.assign(gameState, { kind, question: 0, wrong: 0, hinted: false, done: false });
  gameState.played++;
  running = { stop: () => { alive = false; gameState.kind = null; } };

  const btn = (cls: string, html: string, on: () => void) => {
    const b = document.createElement('button');
    b.className = cls; b.innerHTML = html; b.addEventListener('click', on);
    return b;
  };
  /** The words to say for a question: the frame before the first one, then the word. */
  const ask = (x: Question, first: boolean): string[] => {
    const word = wordClip(x.kind === 'yesno' ? x.said : x.answer);
    if (x.kind === 'read') return [];
    return first ? [x.kind === 'yesno' ? 'wb_yesno' : 'wb_find', word] : [word];
  };

  /** Asks the question aloud ("read and match" is read, not heard: nothing is said). */
  function ask1(x: Question, first: boolean) { const ids = ask(x, first); if (ids.length) void speak(ids); }

  function draw() {
    if (!alive) return;
    const x = round[q];
    Object.assign(gameState, { question: q + 1, wrong, hinted: wrong >= 2 });
    const box = host.box;
    box.innerHTML = '';
    box.dataset.game = kind;
    const head = document.createElement('div');
    head.className = 'wg-head';
    head.innerHTML = `<span class="wg-step">${tf('book_g_step', { n: q + 1, of: ROUND })}</span>`;
    if (x.kind !== 'read') head.appendChild(btn('wg-again', '🔊', () => { if (!busy) void speak(ask(x, false)); }));
    head.appendChild(btn('wg-back', '↩', () => { stopGame(); host.back(); }));
    head.lastElementChild!.setAttribute('aria-label', t('book_g_back'));
    box.appendChild(head);
    if (x.kind === 'read') {
      const card = document.createElement('div');
      card.className = 'wg-card';
      const syl = SYLLABLES[x.answer].split(/(-| )/).filter((s) => s && s !== '-');
      card.innerHTML = `<span class="wg-uk">${syl.map((s, i) => (s === ' ' ? ' ' : `<span class="syl" style="--i:${i}">${s}</span>`)).join('')}</span>`
        + (lang === 'ru' ? `<span class="wg-ru">${t(`book_w_${x.answer}`)}</span>` : '');
      card.classList.toggle('syllables', wrong >= 1);
      card.classList.toggle('first', wrong >= 2);
      box.appendChild(card);
    }
    if (x.kind === 'yesno') {
      const pic = document.createElement('div');
      pic.className = 'wg-pic'; pic.dataset.word = x.picture; pic.innerHTML = wordIcon(x.picture);
      box.appendChild(pic);
      const row = document.createElement('div');
      row.className = 'wg-row';
      for (const v of [true, false]) {
        const b = btn('wg-yn' + (wrong >= 2 && v === x.yes ? ' hint' : ''), v ? '👍' : '👎', () => answer(v === x.yes, b));
        b.dataset.yes = String(v);
        row.appendChild(b);
      }
      box.appendChild(row);
    } else {
      const row = document.createElement('div');
      row.className = 'wg-row';
      for (const w of x.options) {
        const b = btn('wg-opt' + (wrong >= 2 && w === x.answer ? ' hint' : ''), wordIcon(w), () => answer(w === x.answer, b));
        b.dataset.word = w;
        row.appendChild(b);
      }
      box.appendChild(row);
    }
  }

  async function answer(right: boolean, b: HTMLElement) {
    if (!alive || busy) return;
    const x = round[q];
    if (!right) {
      wrong++;
      b.classList.add('wrong');
      draw();
      void speak(['wb_again', ...ask(x, false)]);
      return;
    }
    busy = true;
    b.classList.add('right');
    const praise = praised++ % 2 ? 'wb_great' : 'wb_yes';
    // "read and match": after the right picture the English word is her reward - the word, then its phrase
    if (x.kind === 'read') { await sayWord(x.answer); if (alive) await speak(praise); } else await speak(praise);
    busy = false;
    if (!alive) return;
    q++; wrong = 0;
    if (q < ROUND) { draw(); ask1(round[q], false); return; }
    gameState.done = true;
    host.box.innerHTML = `<p class="wg-done">${t('book_g_done')}</p>`;
    host.box.appendChild(btn('wg-back big small', t('book_g_back'), () => { stopGame(); host.back(); }));
  }

  draw();
  ask1(round[0], true);
  return round;
}
