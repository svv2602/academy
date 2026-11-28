/**
 * The texts of the new kinds of tasks (en_tap, en_count, note; their questions and hints) - Season 2, step 2, parts D1
 * and D2 (idea/proposal/season2-step2-plan-2026-11-27).
 * Empty until that part writes them; src/main.ts adds them to the shared table (`addStrings`).
 *
 * Only `import type` and `declare module` here, like a world's strings.ts (tools/sync_phrases.mjs loads those in Node).
 * Its keys name its kinds (`t_en_tap`, `h1_note`, ...): a key the shared strings or another table already have is an error (`addStrings`).
 * Every line has both texts, Ukrainian and Russian (R31): `ru` has exactly the keys of `uk`.
 */
import type { PartStrings, VoiceStyle } from '../ui/strings';

const uk = {
  // the question of "listen and touch" (en_tap) in the bubble: never said - the English voice asks it (`ScreenAsk`)
  q_en_tap: 'Послухай і знайди картинку',
  // the note (part D2): its question and rung 2 of its hint, said by the cat once recorded (the set (а) of Pip's voice,
  // 2026-11-27); rung 3 - the cat reads the note (its text as src/s2/strings-book.ts NOTE_TEXTS has it, held by a test)
  q_note: 'Прочитай записку Піпа',
  h2_note: 'Прочитай ще раз, повільно. Дивись на ці слова.',
  h3_note_1: 'Привіт! Я Піп. Я загубив карту.',
  h3_note_2: 'Шукай під грибом біля будиночка.',
  h3_note_3: 'Тут живуть рибки. Порахуй рожеві камінчики на березі!',
  h3_note_4: 'Скарб там, де вода. Шукай біля ставка, під кущиком.',
  h3_note_5: 'Ліс великий. Іди туди, де червоні грибочки.',
  h3_note_6: 'Я біжу і дзюркочу, а спати не хочу. Хто я?',
  h3_note_7: 'Сова не любить шуму. Підійди тихенько і подивися вгору.',
  h3_note_8: 'Білочка сховала горішки. Три — під кущем, один — на пеньку. Скільки всього?',
} satisfies Record<string, string>;

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = {
  q_en_tap: 'Послушай и найди картинку',
  q_note: 'Прочитай записку Пипа',
  h2_note: 'Прочитай ещё раз, медленно. Смотри на эти слова.',
  h3_note_1: 'Привет! Я Пип. Я потерял карту.',
  h3_note_2: 'Ищи под грибом у домика.',
  h3_note_3: 'Тут живут рыбки. Посчитай розовые камешки на берегу!',
  h3_note_4: 'Клад там, где вода. Ищи у пруда, под кустиком.',
  h3_note_5: 'Лес большой. Иди туда, где красные грибочки.',
  h3_note_6: 'Я бегу и журчу, а спать не хочу. Кто я?',
  h3_note_7: 'Сова не любит шума. Подойди тихонько и посмотри вверх.',
  h3_note_8: 'Белочка спрятала орешки. Три — под кустом, один — на пеньке. Сколько всего?',
};

const spoken = {
  q_note: 'warm', h2_note: 'warm',
  h3_note_1: 'warm',
  h3_note_2: 'warm',
  h3_note_3: 'warm',
  h3_note_4: 'warm',
  h3_note_5: 'warm',
  h3_note_6: 'warm',
  h3_note_7: 'warm',
  h3_note_8: 'warm',
} as const satisfies Partial<Record<keyof typeof uk, VoiceStyle>>;

export const strings = { id: 's2-tasks', table: { uk, ru }, spoken } satisfies PartStrings;

declare module '../ui/strings' {
  interface WorldTables { 's2-tasks': typeof strings }
}
