/**
 * "Read the note" (Season 2, step 2, part D2; layout §3): a note of Pip lies on the panel in Ukrainian - she reads it
 * herself, whatever the language of the game (R08; with the Russian one its translation is a small caption under it) -
 * and answers what it asks (src/s2/notes.ts): a picture to it, how many pink pebbles, the riddle, the sum of the nuts.
 * Which note: one of those for the level of `read` or below it (layout §3), a fresh one by the planner.
 *
 * Nothing of it is said (the lead's decision 2026-11-27, Q1 (а): Ukrainian as text, the child reads herself): the
 * question is on the screen only, rung 1 lights the words one by one, rung 2 shows "read slowly" and lights the key
 * words, rung 3 is the recorded "look at what glows" with the answer pulsing - the cat reading the note waits for her
 * clips `note_<n>` (R25).
 * A note answered on the panel is not "found" (save.notes): it is found in the world, with Pip (part G; Q4).
 */
import { pick, randInt, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import { NOTE_IDS, NOTE_TEXTS, type NoteId } from '../../s2/strings-book';
import { NOTES, OTHER_PEBBLES, PINK } from '../../s2/notes';
import type { EnSpec, Hint, TaskModel } from './types';

/** How many pictures to choose from on `level` of `read` (as many as the note has, at most). */
export const choicesAt = (level: number) => (level <= 1 ? 2 : level === 2 ? 3 : 4);
/**
 * The notes for `level` of `read`: those of it and below (layout §3). Level 1 has one note of its own: it shares those
 * of level 2, so that no note comes twice in a row (LEARN-13; reading starts on level 3, levels 1-2 are a way down).
 */
export const notesFor = (level: number): NoteId[] => NOTE_IDS.filter((id) => NOTES[id].level <= Math.max(2, level));

export interface NoteBody {
  id: NoteId;
  /** The text read, Ukrainian, and its Russian caption. */
  uk: string; ru: string;
  /** The words of the text lit on rung 2. */
  key: readonly string[];
  /** The answers in their order on the panel: pictures, or numbers in order. */
  options: (string | number)[];
  answer: number;
  /** №3: the colours of the pebbles, in their order. */
  pebbles?: string[];
  /** №8: the skill the answer is noted for as well (the parents' report), its level not moved. */
  also?: 'add';
}
export type NoteSpec = EnSpec<'note', NoteBody>;

const HINT: Hint = { rungs: [
  { key: null, steps: [{ do: 'readAlong' }] },
  { key: null, steps: [{ do: 'slowly' }] },
  { key: 'h3_show', steps: [{ do: 'pulseAnswer' }] },
] };

/** The task of the note `id` on `level`: the other answers, their order and the pebbles from `rng`. */
export function noteExample(level: number, id: NoteId, rng: Rng): NoteSpec {
  const def = NOTES[id], q = def.q;
  let options: (string | number)[], right: string | number, pebbles: string[] | undefined;
  if (q.ask === 'picture') {
    right = q.right;
    options = shuffle([q.right, ...shuffle([...q.wrong], rng).slice(0, choicesAt(level) - 1)], rng);
  } else if (q.ask === 'pebbles') {
    const pink = randInt(3, 5, rng), other = randInt(2, 4, rng);
    pebbles = shuffle([...Array(pink).fill(PINK), ...Array.from({ length: other }, () => pick(OTHER_PEBBLES, rng))], rng);
    right = pink;
    // the count of all the pebbles is among the answers: the note asks for the pink ones only
    options = [...new Set([3, 4, 5, pink + other])].sort((a, b) => a - b);
  } else {
    right = q.right;
    options = [q.right, ...q.wrong].sort((a, b) => a - b);
  }
  return {
    type: 'note', level, prompt: null, screen: { key: 'q_note', en: [] }, hint: HINT,
    body: {
      id, uk: NOTE_TEXTS[id].uk, ru: NOTE_TEXTS[id].ru, key: def.key, options, answer: options.indexOf(right),
      ...(pebbles ? { pebbles } : {}), ...(q.ask === 'number' ? { also: q.also } : {}),
    },
  };
}

export function generate(level: number, rng: Rng): NoteSpec {
  return noteExample(level, pick(notesFor(level), rng), rng);
}

export const note: TaskModel<NoteSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, i) => (i === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
