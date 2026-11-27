/**
 * "Listen and touch" (Season 2, step 2, part D1; PROPOSAL §3): the voice of English says a word of the book - the frame
 * "Find…", then the word apart (R17) - and 2-4 pictures of one kind lie on the panel (three animals, never an animal, a
 * colour and a number: PROPOSAL §11). The words are the book's of step 2 that a picture can show: the hub's, the
 * fairies' and the forest's (wordbook §1; "hello" and "goodbye" have none). How many pictures - by the level of
 * `en_words`: 2 on level 1, 3 on level 2, 4 from level 3.
 *
 * The hint (LEARN-10) has no line of the cat yet (her clips wait for Pip's recording, R25; the lead's decision
 * 2026-11-27): rung 1 says the word again, rung 2 outlines the right picture and says it once more, rung 3 is the
 * recorded "look at what glows" with the picture pulsing.
 */
import { pick, shuffle } from '../../core/util';
import type { Rng } from '../../core/rng';
import type { WordId } from '../../s2/types';
import { EN_KINDS, type EnKind } from '../../s2/pictures';
import type { EnSpec, Hint, TaskModel } from './types';

export { EN_KINDS, type EnKind } from '../../s2/pictures';
/** Every word "listen and touch" asks, in the order of the kinds. */
export const EN_TAP_WORDS: readonly WordId[] = Object.values(EN_KINDS).flat();
export const kindOf = (w: WordId): EnKind | null => (Object.keys(EN_KINDS) as EnKind[]).find((k) => (EN_KINDS[k] as readonly WordId[]).includes(w)) ?? null;

/** How many pictures on `level` of `en_words`. */
export const picturesAt = (level: number) => (level <= 1 ? 2 : level === 2 ? 3 : 4);

export interface EnTapBody {
  /** The word said; its picture is `options[answer]`. */
  word: WordId;
  kind: EnKind;
  /** The words of the pictures, in their order on the panel; all of `kind`. */
  options: WordId[];
  answer: number;
}
export type EnTapSpec = EnSpec<'en_tap', EnTapBody>;

/** The clips that say the word: the frame, then the word apart. */
export const findClips = (w: WordId): string[] => ['wb_find', `wb_w_${w}`];

const HINT: Hint = { rungs: [
  { key: null, steps: [{ do: 'replay' }] },
  { key: null, steps: [{ do: 'outline' }, { do: 'replay' }] },
  { key: 'h3_show', steps: [{ do: 'pulseAnswer' }] },
] };

/** The task of the word `word` on `level`: the other pictures and their order from `rng`. */
export function enTapExample(level: number, word: WordId, rng: Rng): EnTapSpec {
  const kind = kindOf(word);
  if (!kind) throw new Error(`"${word}" is no word a picture shows`);
  const others = shuffle((EN_KINDS[kind] as readonly WordId[]).filter((w) => w !== word), rng).slice(0, picturesAt(level) - 1);
  const options = shuffle([word, ...others], rng);
  return {
    type: 'en_tap', level, prompt: null, screen: { key: 'q_en_tap', en: findClips(word) }, hint: HINT,
    body: { word, kind, options, answer: options.indexOf(word) },
  };
}

export function generate(level: number, rng: Rng): EnTapSpec {
  return enTapExample(level, pick(EN_TAP_WORDS, rng), rng);
}

export const en_tap: TaskModel<EnTapSpec, null, number> = {
  generate,
  start: () => null,
  answer: (s, _st, i) => (i === s.body.answer ? 'right' : 'wrong'),
  solution: (s) => [s.body.answer],
};
