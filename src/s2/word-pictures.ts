/**
 * The pictures of the words of the talking book (Season 2, part H; drawn by src/ui/finds.ts `wordIcon`). Here, in src/s2,
 * and not in src/ui: they name the animals of the worlds' pages, which the shared code never does (src/game/shared-code.test.ts).
 */
import type { WordId } from './types';

/**
 * The pictures of the words (src/ui/wordbook.ts, wordbook §1): the thing itself; a colour is a patch
 * of it, a number its pebbles (one to three, as the fairies' pebbles) or its cones (four and five, as the forest's).
 */
export const WORD_EMOJI: Partial<Record<WordId, string>> = {
  hello: '👋', goodbye: '🕊️', cat: '🐱', bird: '🐦', tree: '🌳',
  flower: '🌷', butterfly: '🦋', bee: '🐝', house: '🏡',
  owl: '🦉', fox: '🦊', hedgehog: '🦔', rabbit: '🐰', frog: '🐸', mushroom: '🍄',
  fish: '🐟', crab: '🦀', shell: '🐚', boat: '⛵', sun: '☀️',
  cake: '🎂', sweet: '🍬', ice_cream: '🍦', biscuit: '🍪',
  cloud: '☁️', rainbow: '🌈', star: '⭐', balloon: '🎈', sheep: '🐑',
};
export const WORD_COLOUR: Partial<Record<WordId, string>> = { red: '#e8413a', yellow: '#ffd23f', pink: '#ff8fc8', green: '#4cbf5a', blue: '#3f8cff' };
export const WORD_COUNT: Partial<Record<WordId, number>> = { one: 1, two: 2, three: 3, four: 4, five: 5 };
/** A pebble of a number (one to three). */
export const PEBBLE = '<svg viewBox="0 0 10 10" width="0.46em" height="0.46em" aria-hidden="true"><ellipse cx="5" cy="5.5" rx="4.6" ry="3.8" fill="#f3a6c8"/></svg>';

