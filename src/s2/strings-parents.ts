/**
 * The texts of the parents' section of Season 2 (the shares of the subjects, English on or off) - Season 2, step 2, part P (idea/proposal/season2-step2-plan-2026-11-27).
 * Empty until that part writes them; src/main.ts adds them to the shared table (`addStrings`).
 *
 * Only `import type` and `declare module` here, like a world's strings.ts (tools/sync_phrases.mjs loads those in Node).
 * Its keys start with `p2_`: a key the shared strings or another table already have is an error (`addStrings`).
 * Every line has both texts, Ukrainian and Russian (R31): `ru` has exactly the keys of `uk`.
 */
import type { PartStrings } from '../ui/strings';

const uk = {
  p2_subj: 'Предмети', p2_subject: 'Предмет', p2_share: 'Частка', p2_target: 'Мета', p2_now: 'Зараз',
  p2_math: 'Математика', p2_logic: 'Логіка і памʼять', p2_en: 'Англійська', p2_read: 'Читання',
  p2_less: 'менше', p2_same: 'як є', p2_more: 'більше',
  p2_english: 'Англійська в грі', p2_on: 'увімкнена', p2_off: 'вимкнена',
  // the explorer's key (PLAY-36): in the view of the controls (src/ui/ui.ts renderControls)
  p2_free: 'Вільний перехід між світами', p2_free_on: 'увімкнений', p2_free_off: 'вимкнений',
  p2_note: 'Як часто предмет зʼявляється в повторах, загадкових зірках і проханнях Піпа. «Зараз» — за останні 20 завдань.',
} satisfies Record<string, string>;

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = {
  p2_subj: 'Предметы', p2_subject: 'Предмет', p2_share: 'Доля', p2_target: 'Цель', p2_now: 'Сейчас',
  p2_math: 'Математика', p2_logic: 'Логика и память', p2_en: 'Английский', p2_read: 'Чтение',
  p2_less: 'меньше', p2_same: 'как есть', p2_more: 'больше',
  p2_english: 'Английский в игре', p2_on: 'включён', p2_off: 'выключен',
  p2_free: 'Свободный переход между мирами', p2_free_on: 'включён', p2_free_off: 'выключен',
  p2_note: 'Как часто предмет появляется в повторах, загадочных звёздах и просьбах Пипа. «Сейчас» — за последние 20 заданий.',
};

export const strings = { id: 's2-parents', table: { uk, ru }, spoken: {} } satisfies PartStrings;

declare module '../ui/strings' {
  interface WorldTables { 's2-parents': typeof strings }
}
