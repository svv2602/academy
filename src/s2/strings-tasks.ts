/**
 * The texts of the new kinds of tasks (en_tap, en_count, note; their questions and hints) - Season 2, step 2, parts D1
 * and D2 (idea/proposal/season2-step2-plan-2026-11-27).
 * Empty until that part writes them; src/main.ts adds them to the shared table (`addStrings`).
 *
 * Only `import type` and `declare module` here, like a world's strings.ts (tools/sync_phrases.mjs loads those in Node).
 * Its keys name its kinds (`t_en_tap`, `h1_note`, ...): a key the shared strings or another table already have is an error (`addStrings`).
 * Every line has both texts, Ukrainian and Russian (R31): `ru` has exactly the keys of `uk`.
 */
import type { PartStrings } from '../ui/strings';

const uk = {
  // the question of "listen and touch" (en_tap) in the bubble: never said - the English voice asks it (`ScreenAsk`)
  q_en_tap: 'Послухай і знайди картинку',
  // the note (part D2): its question and rung 2 of its hint in the bubble, never said - she reads them herself
  q_note: 'Прочитай записку Піпа',
  h2_note: 'Прочитай ще раз, повільно. Дивись на ці слова.',
} satisfies Record<string, string>;

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = {
  q_en_tap: 'Послушай и найди картинку',
  q_note: 'Прочитай записку Пипа',
  h2_note: 'Прочитай ещё раз, медленно. Смотри на эти слова.',
};

export const strings = { id: 's2-tasks', table: { uk, ru }, spoken: {} } satisfies PartStrings;

declare module '../ui/strings' {
  interface WorldTables { 's2-tasks': typeof strings }
}
