/**
 * The words of the book that a picture can show, by kind, and their pictures (Season 2, step 2, part D1: "listen and
 * touch", src/game/tasks/en_tap.ts). The words of step 2 - the hub's, the fairies', the forest's (wordbook §1); "hello"
 * and "goodbye" have no picture. A kind has at least 4 words: the most pictures of a task (PROPOSAL §11: one kind).
 * Here with the words of the book, not in the shared code: a word may be a character's name in a world.
 */
import type { WordId } from './types';

export const EN_KINDS = {
  animal: ['cat', 'bird', 'butterfly', 'bee', 'owl', 'fox', 'hedgehog', 'rabbit', 'frog'],
  thing: ['tree', 'flower', 'house', 'mushroom'],
  colour: ['red', 'yellow', 'pink', 'green'],
  number: ['one', 'two', 'three', 'four', 'five'],
} as const satisfies Record<string, readonly WordId[]>;
export type EnKind = keyof typeof EN_KINDS;

/** What a picture of a word shows: an animal or a thing as its emoji, a colour as a spot of it, a number as its digit. */
export type Picture = { emoji: string } | { colour: string } | { digit: number };
export const PICTURE: Readonly<Record<(typeof EN_KINDS)[EnKind][number], Picture>> = {
  cat: { emoji: '🐱' }, bird: { emoji: '🐦' }, butterfly: { emoji: '🦋' }, bee: { emoji: '🐝' }, owl: { emoji: '🦉' },
  fox: { emoji: '🦊' }, hedgehog: { emoji: '🦔' }, rabbit: { emoji: '🐰' }, frog: { emoji: '🐸' },
  tree: { emoji: '🌳' }, flower: { emoji: '🌸' }, house: { emoji: '🏠' }, mushroom: { emoji: '🍄' },
  red: { colour: '#e8413c' }, yellow: { colour: '#ffd23f' }, pink: { colour: '#ff8fc8' }, green: { colour: '#4cba5a' },
  one: { digit: 1 }, two: { digit: 2 }, three: { digit: 3 }, four: { digit: 4 }, five: { digit: 5 },
};
