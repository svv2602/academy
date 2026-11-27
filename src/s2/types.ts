/**
 * The contract of Season 2, step 2 (idea/proposal/season2-step2-plan-2026-11-27, part A): the types and the empty entry
 * points the parts of the later waves write against, so that they go side by side instead of one after the other.
 * - the subjects the planner alternates (`Subject`, the parents' shares of them);
 * - the voice of English (`EnVoice`): silent here, the real one is set by part B (`setEnVoice`);
 * - Pip's state in the save (`PipState`);
 * - the words of the step's book (`WORDS`, the wordbook's first 40).
 * The fields of the save they live in: src/core/save.ts, version 5.
 */

/** The four subjects (PROPOSAL §5, layout §4): every kind of task belongs to one of them. */
export const SUBJECTS = ['math', 'logic', 'en', 'read'] as const;
export type Subject = (typeof SUBJECTS)[number];
export const isSubject = (x: unknown): x is Subject => (SUBJECTS as readonly unknown[]).includes(x);

/** The parent's choice for a subject (layout §4.4): less, as it is, more - x0.5, x1, x1.5 of its share, then normalised. */
export const SHARE_STEPS = [0.5, 1, 1.5] as const;
export type Share = (typeof SHARE_STEPS)[number];
export const isShare = (x: unknown): x is Share => (SHARE_STEPS as readonly unknown[]).includes(x);

/** How many of the last tasks' subjects the save keeps (`save.recent`, layout §4.3: the shares over the last 20). */
export const RECENT_KEPT = 20;

/** The colours of Pip's cap: the daughter chose purple (decision 2026-11-26); the only one there is. */
export const PIP_CAPS = ['purple'] as const;
export type PipCap = (typeof PIP_CAPS)[number];

/**
 * Pip in the save (`save.pip`): whether she has met him, the pieces of his map she has found (their numbers, each once)
 * and the colour of his cap.
 */
export interface PipState { met: boolean; pieces: number[]; cap: PipCap }

/**
 * The words of the talking book (idea/proposal/season2-wordbook-2026-11-26/wordbook.md §1), by world: the hub 5, the
 * fairies 10, the forest 9 (step 2: 24 words), the sea 6, the Sweet Land 5, the sky 5 (step 3). The id is the word
 * itself, a space as `_`. A word lies in the book (`save.words`) once she has met it at Pip's.
 */
export const WORDS = [
  'hello', 'goodbye', 'cat', 'bird', 'tree',
  'flower', 'butterfly', 'bee', 'house', 'red', 'yellow', 'pink', 'one', 'two', 'three',
  'owl', 'fox', 'hedgehog', 'rabbit', 'frog', 'mushroom', 'green', 'four', 'five',
  'fish', 'crab', 'shell', 'boat', 'blue', 'sun',
  'cake', 'sweet', 'ice_cream', 'biscuit', 'apple',
  'cloud', 'rainbow', 'star', 'balloon', 'sheep',
] as const;
export type WordId = (typeof WORDS)[number];
export const isWord = (x: unknown): x is WordId => (WORDS as readonly unknown[]).includes(x);

/**
 * The voice of English (part B: Zephyr for Pip, the book's Isabella; lazily loaded clips). `say` plays the clip of `id`
 * and resolves when it ends (at once when there is none); `has` - whether that clip exists.
 */
export interface EnVoice { say(id: string): Promise<void>; has(id: string): boolean }

/** The voice before part B sets one: silent, it has no clip. */
const SILENT: EnVoice = { say: () => Promise.resolve(), has: () => false };
let current: EnVoice = SILENT;
/** Sets the voice of English (part B); null gives back the silent one. */
export function setEnVoice(v: EnVoice | null): void { current = v ?? SILENT; }
/** The voice of English now: the silent one until part B sets its own. */
export const enVoice = (): EnVoice => current;
