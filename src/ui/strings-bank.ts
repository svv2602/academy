/**
 * The texts of the bank of the old game's clips (VOICE-07): public/bank/<key>.mp3, imported by tools/import_old_voice.py.
 * The old game built these lines from templates, so they are built here the same way, from the key and its numbers,
 * in both languages from one table of numerals. The Ukrainian text is what the clip says: it must equal, letter for
 * letter, the text of its check record in voice/qa.json (src/ui/strings.test.ts) - the old game's spelling is kept,
 * the plain apostrophe included. These lines go to voice/phrases.json (`npm run voice:sync`), not to the table of
 * `t` / `voiceText`: the game plays a clip of the bank only through `sayBank` (src/core/voice.ts) - addition, take away
 * and counting ask their own example by it - and falls back to the task's common question without it.
 * Plain data and functions only (tools/sync_phrases.mjs loads this file in Node): nothing but `import type`.
 */
import type { Lang, SpokenTable, VoiceStyle } from './strings';

const NUM: Record<Lang, readonly string[]> = {
  uk: ['нуль', 'один', 'два', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім', "дев'ять", 'десять', 'одинадцять', 'дванадцять',
    'тринадцять', 'чотирнадцять', "п'ятнадцять", 'шістнадцять', 'сімнадцять', 'вісімнадцять', "дев'ятнадцять", 'двадцять'],
  ru: ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять', 'десять', 'одиннадцать', 'двенадцать',
    'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать', 'двадцать'],
};
/** "How many ... are here?": the counted things, in the genitive plural. */
const ITEMS: Record<string, Record<Lang, string>> = {
  apple: { uk: 'яблук', ru: 'яблок' }, strawberry: { uk: 'полуниць', ru: 'клубничек' }, candy: { uk: 'цукерок', ru: 'конфет' },
  balloon: { uk: 'кульок', ru: 'шариков' }, car: { uk: 'машинок', ru: 'машинок' }, flower: { uk: 'квіточок', ru: 'цветочков' },
  star: { uk: 'зірочок', ru: 'звёздочек' }, fish: { uk: 'рибок', ru: 'рыбок' }, butterfly: { uk: 'метеликів', ru: 'бабочек' },
  ladybug: { uk: 'сонечок', ru: 'божьих коровок' },
};
const W: Record<Lang, Record<string, string>> = {
  uk: { add: 'Скільки буде {a} плюс {b}?', sub: 'Скільки буде {a} мінус {b}?', before: 'Яке число стоїть перед числом {a}?',
    after: 'Яке число стоїть після числа {a}?', ans: 'Правильна відповідь: {a}.', count: 'Скільки тут {a}?',
    together: 'Давай порахуємо разом!', head: '{a} плюс {b}.', swap: 'Переставимо: {a} плюс {b}.', ten: '{a} плюс {b} — десять, і ще {c} — {s}.' },
  ru: { add: 'Сколько будет {a} плюс {b}?', sub: 'Сколько будет {a} минус {b}?', before: 'Какое число стоит перед числом {a}?',
    after: 'Какое число стоит после числа {a}?', ans: 'Правильный ответ: {a}.', count: 'Сколько здесь {a}?',
    together: 'Давай посчитаем вместе!', head: '{a} плюс {b}.', swap: 'Переставим: {a} плюс {b}.', ten: '{a} плюс {b} — десять, и ещё {c} — {s}.' },
};
const fill = (s: string, v: Record<string, string>) => s.replace(/\{(\w)\}/g, (_, k: string) => v[k]);
const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Bridging ten (cross_a_n, a + n > 10): from the larger addend, fill up to ten, then add the rest. */
function cross(l: Lang, a: number, n: number): string {
  const w = W[l], num = NUM[l], big = Math.max(a, n), small = Math.min(a, n), need = 10 - big;
  const head = fill(w.head, { a: cap(num[a]), b: num[n] }) + (a < n ? ` ${fill(w.swap, { a: num[big], b: num[small] })}` : '');
  return `${w.together} ${head} ${fill(w.ten, { a: cap(num[big]), b: num[need], c: num[small - need], s: num[a + n] })}`;
}

/** Every key of the bank with its text in one language: the questions the old game asked, up to 20. */
function lines(l: Lang): Record<string, string> {
  const w = W[l], num = NUM[l], out: Record<string, string> = {};
  const add = (k: string, t: string, v: Record<string, string>) => { out[k] = fill(t, v); };
  // Additions: sums up to 10 in full; above 10, the first addend 1-15 and the second at most 9.
  for (let s = 2; s <= 20; s++) {
    for (let a = s <= 10 ? 1 : Math.max(1, s - 9); a <= (s <= 10 ? s - 1 : Math.min(s - 1, 15)); a++) add(`q_add_${a}_${s - a}`, w.add, { a: num[a], b: num[s - a] });
  }
  for (let a = 2; a <= 20; a++) for (let b = 1; b <= (a <= 10 ? a - 1 : 9); b++) add(`q_sub_${a}_${b}`, w.sub, { a: num[a], b: num[b] });
  for (let n = 2; n <= 19; n++) add(`q_before_${n}`, w.before, { a: num[n] });
  for (let n = 2; n <= 19; n++) add(`q_after_${n}`, w.after, { a: num[n] });
  for (let a = 1; a <= 9; a++) for (let n = 1; n <= 9; n++) if (a + n > 10) out[`cross_${a}_${n}`] = cross(l, a, n);
  for (let n = 0; n <= 20; n++) add(`ans_${n}`, w.ans, { a: num[n] });
  for (const [k, v] of Object.entries(ITEMS)) add(`q_count_${k}`, w.count, { a: v[l] });
  return out;
}

const table: Record<Lang, Record<string, string>> = { uk: lines('uk'), ru: lines('ru') };
/** Every line of the bank was recorded warm by the old game. */
const spoken: Record<string, VoiceStyle> = Object.fromEntries(Object.keys(table.uk).map((k) => [k, 'warm' as const]));
export const bank: SpokenTable = { table, spoken };
