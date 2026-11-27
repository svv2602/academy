/**
 * The texts of the talking book (its pages of words, its games, the map of Pip, the notes) - Season 2, step 2, part H
 * (idea/proposal/season2-step2-plan-2026-11-27); src/main.ts adds them to the shared table (`addStrings`).
 *
 * Only `import type` and `declare module` here, like a world's strings.ts (tools/sync_phrases.mjs loads those in Node).
 * Its keys start with `book_`: a key the shared strings or another table already have is an error (`addStrings`).
 * Every line has both texts, Ukrainian and Russian (R31): `ru` has exactly the keys of `uk`.
 * Nothing here is spoken in Ukrainian: in the book Ukrainian is text only, the cat says nothing (R20); the English is
 * Isabella's clips (src/s2/strings-en.ts).
 */
import type { PartStrings } from '../ui/strings';
import type { WordId } from './types';

/**
 * The Ukrainian word of each word of the book, cut into its syllables (`-`): the game "read and match" lights them one
 * by one as its first hint (wordbook §3.3). Without the cuts it is the word's Ukrainian caption (`book_w_<id>`).
 */
export const SYLLABLES = {
  hello: 'при-віт', goodbye: 'бу-вай', cat: 'кіт', bird: 'птах', tree: 'де-ре-во',
  flower: 'квіт-ка', butterfly: 'ме-те-лик', bee: 'бджо-ла', house: 'бу-ди-но-чок', red: 'чер-во-ний', yellow: 'жов-тий',
  pink: 'ро-же-вий', one: 'о-дин', two: 'два', three: 'три',
  owl: 'со-ва', fox: 'ли-си-ця', hedgehog: 'ї-жак', rabbit: 'кро-лик', frog: 'жа-ба', mushroom: 'гриб', green: 'зе-ле-ний',
  four: 'чо-ти-ри', five: 'пʼять',
  fish: 'ри-ба', crab: 'краб', shell: 'муш-ля', boat: 'ко-раб-лик', blue: 'си-ній', sun: 'сон-це',
  cake: 'торт', sweet: 'цу-кер-ка', ice_cream: 'мо-ро-зи-во', biscuit: 'пе-чи-во', apple: 'яб-лу-ко',
  cloud: 'хма-рин-ка', rainbow: 'ве-сел-ка', star: 'зір-ка', balloon: 'по-віт-ря-на куль-ка', sheep: 'вів-ця',
} as const satisfies Record<WordId, string>;

/** The notes for reading of step 2 (layout §3): their ids in `save.notes`, numbered as in the layout. */
export const NOTE_IDS = ['note_1', 'note_2', 'note_3', 'note_4', 'note_5', 'note_6', 'note_7', 'note_8'] as const;
export type NoteId = (typeof NOTE_IDS)[number];
/**
 * The text of each note (layout §3): she reads it in Ukrainian whatever the language of the game (R08); with the Russian
 * interface its Russian is a small caption under it. No numbers in figures (they are words, like the spoken lines) and no
 * name of the child. The one source of these texts: the task `note` (part D2) reads them from here.
 */
export const NOTE_TEXTS: Record<NoteId, { uk: string; ru: string }> = {
  note_1: { uk: 'Привіт! Я Піп. Я загубив карту.', ru: 'Привет! Я Пип. Я потерял карту.' },
  note_2: { uk: 'Шукай під грибом біля будиночка.', ru: 'Ищи под грибом у домика.' },
  note_3: { uk: 'Тут живуть рибки. Порахуй рожеві камінчики на березі!', ru: 'Тут живут рыбки. Посчитай розовые камешки на берегу!' },
  note_4: { uk: 'Скарб там, де вода. Шукай біля ставка, під кущиком.', ru: 'Клад там, где вода. Ищи у пруда, под кустиком.' },
  note_5: { uk: 'Ліс великий. Іди туди, де червоні грибочки.', ru: 'Лес большой. Иди туда, где красные грибочки.' },
  note_6: { uk: 'Я біжу і дзюркочу, а спати не хочу. Хто я?', ru: 'Я бегу и журчу, а спать не хочу. Кто я?' },
  note_7: { uk: 'Сова не любить шуму. Підійди тихенько і подивися вгору.', ru: 'Сова не любит шума. Подойди тихонько и посмотри вверх.' },
  note_8: { uk: 'Білочка сховала горішки. Три — під кущем, один — на пеньку. Скільки всього?', ru: 'Белочка спрятала орешки. Три — под кустом, один — на пеньке. Сколько всего?' },
};

/** A text a note may carry: no digit (numbers are words) and no placeholder (the name of the child is never in a note). */
export const noteTextOk = (s: string) => s.trim().length > 0 && !/[0-9{}]/.test(s);

const uk = {
  book_words_t: 'Мої слова', book_pip_t: 'Карта Піпа і записки',
  book_words_none: 'Слова зʼявляться в книжці, коли ти їх зустрінеш.',
  book_page_hub: 'Велике Дерево', book_page_fairy: 'Світ фей', book_page_forest: 'Зачарований ліс',
  book_page_sea: 'Підводне королівство', book_page_sweet: 'Солодка країна', book_page_sky: 'Небесні острови',
  book_g_listen: 'Послухай і знайди', book_g_yesno: 'Так чи ні?', book_g_read: 'Прочитай і зʼєднай',
  book_g_step: 'Питання {n} з {of}', book_g_done: 'Пʼять питань позаду. Чудова гра!', book_g_back: 'До сторінки',
  book_map: 'Шматочки карти Піпа: {n} з {of}', book_map_wait: 'Цей шматочок ще чекає на тебе.',
  book_notes: 'Записки: {n} з {of}', book_note_wait: 'Цю записку ще не знайдено.', book_note_n: 'Записка {n}',
  book_w_hello: 'привіт', book_w_goodbye: 'бувай', book_w_cat: 'кіт', book_w_bird: 'птах', book_w_tree: 'дерево',
  book_w_flower: 'квітка', book_w_butterfly: 'метелик', book_w_bee: 'бджола', book_w_house: 'будиночок', book_w_red: 'червоний',
  book_w_yellow: 'жовтий', book_w_pink: 'рожевий', book_w_one: 'один', book_w_two: 'два', book_w_three: 'три',
  book_w_owl: 'сова', book_w_fox: 'лисиця', book_w_hedgehog: 'їжак', book_w_rabbit: 'кролик', book_w_frog: 'жаба',
  book_w_mushroom: 'гриб', book_w_green: 'зелений', book_w_four: 'чотири', book_w_five: 'пʼять',
  book_w_fish: 'риба', book_w_crab: 'краб', book_w_shell: 'мушля', book_w_boat: 'кораблик', book_w_blue: 'синій', book_w_sun: 'сонце',
  book_w_cake: 'торт', book_w_sweet: 'цукерка', book_w_ice_cream: 'морозиво', book_w_biscuit: 'печиво', book_w_apple: 'яблуко',
  book_w_cloud: 'хмаринка', book_w_rainbow: 'веселка', book_w_star: 'зірка', book_w_balloon: 'повітряна кулька', book_w_sheep: 'вівця',
} satisfies Record<string, string>;

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = {
  book_words_t: 'Мои слова', book_pip_t: 'Карта Пипа и записки',
  book_words_none: 'Слова появятся в книжке, когда ты их встретишь.',
  book_page_hub: 'Великое Древо', book_page_fairy: 'Мир фей', book_page_forest: 'Зачарованный лес',
  book_page_sea: 'Подводное королевство', book_page_sweet: 'Сладкая страна', book_page_sky: 'Небесные острова',
  book_g_listen: 'Послушай и найди', book_g_yesno: 'Да или нет?', book_g_read: 'Прочитай и соедини',
  book_g_step: 'Вопрос {n} из {of}', book_g_done: 'Пять вопросов позади. Отличная игра!', book_g_back: 'К странице',
  book_map: 'Кусочки карты Пипа: {n} из {of}', book_map_wait: 'Этот кусочек ещё ждёт тебя.',
  book_notes: 'Записки: {n} из {of}', book_note_wait: 'Эту записку ещё не нашли.', book_note_n: 'Записка {n}',
  book_w_hello: 'привет', book_w_goodbye: 'пока', book_w_cat: 'кот', book_w_bird: 'птица', book_w_tree: 'дерево',
  book_w_flower: 'цветок', book_w_butterfly: 'бабочка', book_w_bee: 'пчела', book_w_house: 'домик', book_w_red: 'красный',
  book_w_yellow: 'жёлтый', book_w_pink: 'розовый', book_w_one: 'один', book_w_two: 'два', book_w_three: 'три',
  book_w_owl: 'сова', book_w_fox: 'лиса', book_w_hedgehog: 'ёжик', book_w_rabbit: 'кролик', book_w_frog: 'лягушка',
  book_w_mushroom: 'гриб', book_w_green: 'зелёный', book_w_four: 'четыре', book_w_five: 'пять',
  book_w_fish: 'рыба', book_w_crab: 'краб', book_w_shell: 'ракушка', book_w_boat: 'кораблик', book_w_blue: 'синий', book_w_sun: 'солнце',
  book_w_cake: 'торт', book_w_sweet: 'конфета', book_w_ice_cream: 'мороженое', book_w_biscuit: 'печенье', book_w_apple: 'яблоко',
  book_w_cloud: 'облачко', book_w_rainbow: 'радуга', book_w_star: 'звезда', book_w_balloon: 'воздушный шарик', book_w_sheep: 'овечка',
};

export const strings = { id: 's2-book', table: { uk, ru }, spoken: {} } satisfies PartStrings;

declare module '../ui/strings' {
  interface WorldTables { 's2-book': typeof strings }
}
