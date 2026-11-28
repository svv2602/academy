/**
 * The texts of Pip in the hub and the worlds 1-2 (his meeting, his requests, the pieces of his map) - Season 2, step 2, part G (idea/proposal/season2-step2-plan-2026-11-27).
 * Empty until that part writes them; src/main.ts adds them to the shared table (`addStrings`).
 *
 * Only `import type` and `declare module` here, like a world's strings.ts (tools/sync_phrases.mjs loads those in Node).
 * Its keys start with `pip_`: a key the shared strings or another table already have is an error (`addStrings`).
 * Every line has both texts, Ukrainian and Russian (R31): `ru` has exactly the keys of `uk`.
 */
import type { PartStrings, VoiceStyle } from '../ui/strings';

// The cat's lines of Pip's story (lines §3), said in Ukrainian by the cat (Puck), and his translation at the first
// meeting only; her command of a place said again on rung 2 of en_go; the cap (R19). Pip's own lines are English
// (src/s2/strings-en.ts, Zephyr).
const uk = {
  pip_cat_who: 'Це Піп. Він прилетів з-за моря і говорить англійською.',
  pip_cat_hello: '«Hello» — це «привіт». Помахай йому!',
  pip_cat_lost: 'Піп загубився. Його дім далеко-далеко.',
  pip_cat_map: 'Вітер розніс його карту по світах. Допоможемо зібрати?',
  pip_cat_learn: 'Піп говоритиме англійською, а я підкажу, якщо треба.',
  pip_cat_piece: 'Ще один шматочок — і Піп ближче до дому.',
  pip_cat_cap: 'Дивись, у Піпа нова шапочка! Йому дуже личить.',
  pip_cat_star: 'Золоті зірки — це прохання Піпа. Їх щодня нові!',
  pip_cat_en_off: 'Піп полетів у гості до друзів.',
  pip_cat_go_free: 'Іди сама, доріжки іскорок не буде. Слухай Піпа!',
  pip_cat_go_flower: 'Піп просить: знайди червону квітку!',
  pip_cat_go_house: 'Піп просить: іди до маленького будиночка!',
  pip_cat_go_mushroom: 'Піп просить: знайди великий гриб!',
} satisfies Record<string, string>;

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = {
  pip_cat_who: 'Это Пип. Он прилетел из-за моря и говорит по-английски.',
  pip_cat_hello: '«Hello» — это «привет». Помаши ему!',
  pip_cat_lost: 'Пип потерялся. Его дом далеко-далеко.',
  pip_cat_map: 'Ветер разнёс его карту по мирам. Поможем собрать?',
  pip_cat_learn: 'Пип будет говорить по-английски, а я подскажу, если нужно.',
  pip_cat_piece: 'Ещё кусочек — и Пип ближе к дому.',
  pip_cat_cap: 'Смотри, у Пипа новая шапочка! Ему очень идёт.',
  pip_cat_star: 'Золотые звёзды — это просьбы Пипа. Каждый день новые!',
  pip_cat_en_off: 'Пип полетел в гости к друзьям.',
  pip_cat_go_free: 'Иди сама, дорожки искорок не будет. Слушай Пипа!',
  pip_cat_go_flower: 'Пип просит: найди красный цветок!',
  pip_cat_go_house: 'Пип просит: иди к маленькому домику!',
  pip_cat_go_mushroom: 'Пип просит: найди большой гриб!',
};

const spoken = {
  pip_cat_who: 'warm', pip_cat_hello: 'joy', pip_cat_lost: 'calm', pip_cat_map: 'warm', pip_cat_learn: 'warm',
  pip_cat_piece: 'joy', pip_cat_cap: 'joy', pip_cat_star: 'joy', pip_cat_en_off: 'calm', pip_cat_go_free: 'warm',
  pip_cat_go_flower: 'warm', pip_cat_go_house: 'warm', pip_cat_go_mushroom: 'warm',
} as const satisfies Record<keyof typeof uk, VoiceStyle>;

export const strings = { id: 's2-pip', table: { uk, ru }, spoken } satisfies PartStrings;

declare module '../ui/strings' {
  interface WorldTables { 's2-pip': typeof strings }
}
