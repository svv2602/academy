/**
 * What each note for reading asks on the panel (Season 2, step 2, part D2: the task `note`, src/game/tasks/note.ts; its
 * texts are src/s2/strings-book.ts `NOTE_TEXTS`, layout §3). The lead's decision of 2026-11-27 (Q2):
 * - a picture to what is read: №1 (the bird and its map), and the notes that send her looking in the world (№2, 4, 5,
 *   7 - the looking itself is part G): the picture of that place. A wrong picture keeps one half of the right one (the
 *   mushroom by the sea, the flower by the house): only reading both words finds it;
 * - №3: how many pink pebbles among the others (3-5 pink); the count of all of them is among the answers;
 * - №6: the riddle - the brook, the mushroom or the owl;
 * - №8: three nuts and one - how many (read and add, layout §4.2: the level moves for reading only).
 * `level`: the level of `read` the note is for (layout §3); `key`: the words of the text lit on rung 2 of the hint.
 * Here with the step's own words, not in the shared code (a world's character may have the name of a thing here).
 */
import type { NoteId } from './strings-book';

export type NoteAsk =
  | { ask: 'picture'; right: string; wrong: readonly string[] }
  | { ask: 'pebbles' }
  | { ask: 'number'; right: number; wrong: readonly number[]; also: 'add' };

export interface NoteDef { level: number; key: readonly string[]; q: NoteAsk }

export const NOTES: Readonly<Record<NoteId, NoteDef>> = {
  note_1: { level: 1, key: ['Піп', 'карту'], q: { ask: 'picture', right: '🐦🗺️', wrong: ['🐟🎈', '🐞🌸', '🐱🍰'] } },
  note_2: { level: 2, key: ['грибом', 'будиночка'], q: { ask: 'picture', right: '🍄🏠', wrong: ['🌸🏠', '🍄🌊', '🌳⭐'] } },
  note_3: { level: 3, key: ['Порахуй', 'рожеві'], q: { ask: 'pebbles' } },
  note_4: { level: 4, key: ['ставка', 'кущиком'], q: { ask: 'picture', right: '🌊🌿', wrong: ['🌊🍄', '🏠🌿', '🌳🍄'] } },
  note_5: { level: 3, key: ['червоні', 'грибочки'], q: { ask: 'picture', right: '🍄🍄', wrong: ['🌹🌹', '🌲🌲', '🍓🍓'] } },
  note_6: { level: 5, key: ['біжу', 'дзюркочу'], q: { ask: 'picture', right: '🏞️', wrong: ['🍄', '🦉'] } },
  note_7: { level: 4, key: ['Сова', 'вгору'], q: { ask: 'picture', right: '🦉⬆️', wrong: ['🦉⬇️', '🦔⬆️', '🦔⬇️'] } },
  note_8: { level: 5, key: ['Три', 'один', 'всього'], q: { ask: 'number', right: 4, wrong: [1, 3, 5], also: 'add' } },
};

/** The colour of a pink pebble of №3, and of the others (none of them pink). */
export const PINK = '#ff8fc8';
export const OTHER_PEBBLES = ['#9aa3ad', '#6fa8dc', '#c9b28f'] as const;
