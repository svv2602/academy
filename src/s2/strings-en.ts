/**
 * The list of the English lines (idea/proposal/season2-step2-plan-2026-11-27, part B): every line said in English, with
 * its clip `en/<id>.mp3` (public/en/, the lazy bank of src/core/voice-en.ts). The Ukrainian list is src/ui/strings.ts
 * (`recordingList`, voice/phrases.json); this one is apart: its voices are not the game's five, and an English line is
 * never handed to the device's synthesizer (it speaks Ukrainian).
 * - `text`: what the clip says, British English (the customer, R11);
 * - `uk`, `ru`: its translation, the small caption under it;
 * - `voice`: Isabella - the talking book (Kokoro, recorded free, idea/proposal/season2-wordbook-2026-11-26/record.py);
 *   Zephyr - Pip, the sixth voice of the game (R12), recorded by tools/gen_voice.py `--en` on the customer's word only;
 * - `world`: where it is met - a world of src/worlds/, or `book` for the book's own frames, met everywhere;
 * - `variant_of`: the lines that are variants of one (`wb_p_hello_1..4` of `wb_p_hello`): saying the one plays one of
 *   them at random, never the same twice in a row.
 * `npm run voice:sync` writes voice/phrases-en.json from it; src/core/clips-en.json lists the recorded clips, and a
 * line without its clip (or a clip without its line) fails `npm test` (tools/sync_phrases.test.mjs).
 * Ids: `wb_w_<word>` the word, `wb_p_<word>` its phrase, `wb_<frame>` a frame of the book (wordbook §1, §2.1).
 */
export type EnVoiceName = 'Isabella' | 'Zephyr';
export interface EnLine { id: string; text: string; uk: string; ru: string; voice: EnVoiceName; world: string; variant_of?: string }

export const EN_LINES = [
  { id: 'wb_hello', text: "Hello! I'm your word book.", uk: "Привіт! Я — книжка-словничок.", ru: "Привет! Я — книжка-словарик.", voice: 'Isabella', world: 'book' },
  { id: 'wb_touch', text: "Touch a picture!", uk: "Торкнися картинки — я скажу слово.", ru: "Коснись картинки — я скажу слово.", voice: 'Isabella', world: 'book' },
  { id: 'wb_new', text: "A new word!", uk: "Нове слово!", ru: "Новое слово!", voice: 'Isabella', world: 'book' },
  { id: 'wb_listen', text: "Listen…", uk: "Послухай…", ru: "Послушай…", voice: 'Isabella', world: 'book' },
  { id: 'wb_find', text: "Find…", uk: "Знайди…", ru: "Найди…", voice: 'Isabella', world: 'book' },
  { id: 'wb_yesno', text: "Yes or no?", uk: "Так чи ні?", ru: "Да или нет?", voice: 'Isabella', world: 'book' },
  { id: 'wb_letter', text: "What letter?", uk: "Яка перша літера?", ru: "Какая первая буква?", voice: 'Isabella', world: 'book' },
  { id: 'wb_yes', text: "Yes! Well done!", uk: "Так! Молодчина!", ru: "Да! Молодец!", voice: 'Isabella', world: 'book' },
  { id: 'wb_great', text: "Great!", uk: "Чудово!", ru: "Отлично!", voice: 'Isabella', world: 'book' },
  { id: 'wb_again', text: "Let's look again.", uk: "Подивімося ще раз.", ru: "Посмотрим ещё раз.", voice: 'Isabella', world: 'book' },
  { id: 'wb_page', text: "Turn the page!", uk: "Гортай далі!", ru: "Листай дальше!", voice: 'Isabella', world: 'book' },
  { id: 'wb_bye', text: "See you soon!", uk: "До зустрічі!", ru: "До встречи!", voice: 'Isabella', world: 'book' },
  { id: 'wb_w_hello', text: "Hello!", uk: "привіт", ru: "привет", voice: 'Isabella', world: 'hub' },
  { id: 'wb_p_hello_1', text: "Hello!", uk: "Привіт!", ru: "Привет!", voice: 'Isabella', world: 'hub', variant_of: 'wb_p_hello' },
  { id: 'wb_p_hello_2', text: "Hello.", uk: "Привіт.", ru: "Привет.", voice: 'Isabella', world: 'hub', variant_of: 'wb_p_hello' },
  { id: 'wb_p_hello_3', text: "Hello there!", uk: "Ну привіт!", ru: "Ну привет!", voice: 'Isabella', world: 'hub', variant_of: 'wb_p_hello' },
  { id: 'wb_p_hello_4', text: "Hi! Hello!", uk: "Привіт! Вітаю!", ru: "Привет! Здравствуй!", voice: 'Isabella', world: 'hub', variant_of: 'wb_p_hello' },
  { id: 'wb_w_goodbye', text: "Goodbye.", uk: "бувай", ru: "пока", voice: 'Isabella', world: 'hub' },
  { id: 'wb_p_goodbye', text: "Goodbye.", uk: "Бувай.", ru: "Пока.", voice: 'Isabella', world: 'hub' },
  { id: 'wb_w_cat', text: "Cat.", uk: "кіт", ru: "кот", voice: 'Isabella', world: 'hub' },
  { id: 'wb_p_cat', text: "A cat.", uk: "Кіт.", ru: "Кот.", voice: 'Isabella', world: 'hub' },
  { id: 'wb_w_bird', text: "Bird.", uk: "птах", ru: "птица", voice: 'Isabella', world: 'hub' },
  { id: 'wb_p_bird', text: "A little bird.", uk: "Маленька пташка.", ru: "Маленькая птичка.", voice: 'Isabella', world: 'hub' },
  { id: 'wb_w_tree', text: "Tree.", uk: "дерево", ru: "дерево", voice: 'Isabella', world: 'hub' },
  { id: 'wb_p_tree', text: "A big tree.", uk: "Велике дерево.", ru: "Большое дерево.", voice: 'Isabella', world: 'hub' },
  { id: 'wb_w_flower', text: "Flower!", uk: "квітка", ru: "цветок", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_p_flower', text: "A red flower.", uk: "Червона квітка.", ru: "Красный цветок.", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_w_butterfly', text: "Butterfly.", uk: "метелик", ru: "бабочка", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_p_butterfly', text: "A butterfly.", uk: "Метелик.", ru: "Бабочка.", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_w_bee', text: "Bee.", uk: "бджола", ru: "пчела", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_p_bee', text: "A little bee.", uk: "Маленька бджілка.", ru: "Маленькая пчёлка.", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_w_house', text: "House.", uk: "будиночок", ru: "домик", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_p_house', text: "A little house.", uk: "Маленький будиночок.", ru: "Маленький домик.", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_w_red', text: "Red.", uk: "червоний", ru: "красный", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_p_red', text: "Red!", uk: "Червоний!", ru: "Красный!", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_w_yellow', text: "Yellow.", uk: "жовтий", ru: "жёлтый", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_p_yellow', text: "Yellow!", uk: "Жовтий!", ru: "Жёлтый!", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_w_pink', text: "Pink.", uk: "рожевий", ru: "розовый", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_p_pink', text: "Pink!", uk: "Рожевий!", ru: "Розовый!", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_w_one', text: "One.", uk: "один", ru: "один", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_p_one', text: "One.", uk: "Один.", ru: "Один.", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_w_two', text: "Two.", uk: "два", ru: "два", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_p_two', text: "Two.", uk: "Два.", ru: "Два.", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_w_three', text: "Three.", uk: "три", ru: "три", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_p_three', text: "Three.", uk: "Три.", ru: "Три.", voice: 'Isabella', world: 'fairy' },
  { id: 'wb_w_owl', text: "Owl.", uk: "сова", ru: "сова", voice: 'Isabella', world: 'forest' },
  { id: 'wb_p_owl', text: "An owl.", uk: "Сова.", ru: "Сова.", voice: 'Isabella', world: 'forest' },
  { id: 'wb_w_fox', text: "Fox.", uk: "лисиця", ru: "лиса", voice: 'Isabella', world: 'forest' },
  { id: 'wb_p_fox', text: "A fox.", uk: "Лисиця.", ru: "Лиса.", voice: 'Isabella', world: 'forest' },
  { id: 'wb_w_hedgehog', text: "Hedgehog.", uk: "їжак", ru: "ёжик", voice: 'Isabella', world: 'forest' },
  { id: 'wb_p_hedgehog', text: "A hedgehog.", uk: "Їжак.", ru: "Ёжик.", voice: 'Isabella', world: 'forest' },
  { id: 'wb_w_rabbit', text: "Rabbit.", uk: "кролик", ru: "кролик", voice: 'Isabella', world: 'forest' },
  { id: 'wb_p_rabbit', text: "A rabbit.", uk: "Кролик.", ru: "Кролик.", voice: 'Isabella', world: 'forest' },
  { id: 'wb_w_frog', text: "Frog.", uk: "жаба", ru: "лягушка", voice: 'Isabella', world: 'forest' },
  { id: 'wb_p_frog', text: "A green frog.", uk: "Зелена жаба.", ru: "Зелёная лягушка.", voice: 'Isabella', world: 'forest' },
  { id: 'wb_w_mushroom', text: "Mushroom.", uk: "гриб", ru: "гриб", voice: 'Isabella', world: 'forest' },
  { id: 'wb_p_mushroom', text: "A big mushroom.", uk: "Великий гриб.", ru: "Большой гриб.", voice: 'Isabella', world: 'forest' },
  { id: 'wb_w_green', text: "Green.", uk: "зелений", ru: "зелёный", voice: 'Isabella', world: 'forest' },
  { id: 'wb_p_green', text: "Green.", uk: "Зелений!", ru: "Зелёный!", voice: 'Isabella', world: 'forest' },
  { id: 'wb_w_four', text: "Four!", uk: "чотири", ru: "четыре", voice: 'Isabella', world: 'forest' },
  { id: 'wb_p_four', text: "Four!", uk: "Чотири.", ru: "Четыре.", voice: 'Isabella', world: 'forest' },
  { id: 'wb_w_five', text: "Five.", uk: "пʼять", ru: "пять", voice: 'Isabella', world: 'forest' },
  { id: 'wb_p_five', text: "Five.", uk: "Пʼять.", ru: "Пять.", voice: 'Isabella', world: 'forest' },
  { id: 'wb_w_fish', text: "Fish.", uk: "риба", ru: "рыба", voice: 'Isabella', world: 'sea' },
  { id: 'wb_p_fish', text: "A fish.", uk: "Риба.", ru: "Рыба.", voice: 'Isabella', world: 'sea' },
  { id: 'wb_w_crab', text: "Crab.", uk: "краб", ru: "краб", voice: 'Isabella', world: 'sea' },
  { id: 'wb_p_crab', text: "A crab.", uk: "Краб.", ru: "Краб.", voice: 'Isabella', world: 'sea' },
  { id: 'wb_w_shell', text: "Shell.", uk: "мушля", ru: "ракушка", voice: 'Isabella', world: 'sea' },
  { id: 'wb_p_shell', text: "A shell.", uk: "Мушля.", ru: "Ракушка.", voice: 'Isabella', world: 'sea' },
  { id: 'wb_w_boat', text: "Boat.", uk: "кораблик", ru: "кораблик", voice: 'Isabella', world: 'sea' },
  { id: 'wb_p_boat', text: "A little boat!", uk: "Маленький кораблик.", ru: "Маленький кораблик.", voice: 'Isabella', world: 'sea' },
  { id: 'wb_w_blue', text: "Blue.", uk: "синій", ru: "синий", voice: 'Isabella', world: 'sea' },
  { id: 'wb_p_blue', text: "Blue!", uk: "Синій!", ru: "Синий!", voice: 'Isabella', world: 'sea' },
  { id: 'wb_w_sun', text: "Sun.", uk: "сонце", ru: "солнце", voice: 'Isabella', world: 'sea' },
  { id: 'wb_p_sun', text: "The sun.", uk: "Сонце.", ru: "Солнце.", voice: 'Isabella', world: 'sea' },
  { id: 'wb_w_cake', text: "Cake.", uk: "торт", ru: "торт", voice: 'Isabella', world: 'sweet' },
  { id: 'wb_p_cake', text: "A cake.", uk: "Торт.", ru: "Торт.", voice: 'Isabella', world: 'sweet' },
  { id: 'wb_w_sweet', text: "Sweet.", uk: "цукерка", ru: "конфета", voice: 'Isabella', world: 'sweet' },
  { id: 'wb_p_sweet', text: "A sweet.", uk: "Цукерка.", ru: "Конфета.", voice: 'Isabella', world: 'sweet' },
  { id: 'wb_w_ice_cream', text: "Ice cream.", uk: "морозиво", ru: "мороженое", voice: 'Isabella', world: 'sweet' },
  { id: 'wb_p_ice_cream', text: "Ice cream!", uk: "Морозиво!", ru: "Мороженое!", voice: 'Isabella', world: 'sweet' },
  { id: 'wb_w_biscuit', text: "Biscuit.", uk: "печиво", ru: "печенье", voice: 'Isabella', world: 'sweet' },
  { id: 'wb_p_biscuit', text: "A biscuit.", uk: "Печиво.", ru: "Печенье.", voice: 'Isabella', world: 'sweet' },
  { id: 'wb_w_apple', text: "Apple.", uk: "яблуко", ru: "яблоко", voice: 'Isabella', world: 'sweet' },
  { id: 'wb_p_apple', text: "A red apple.", uk: "Червоне яблуко.", ru: "Красное яблоко.", voice: 'Isabella', world: 'sweet' },
  { id: 'wb_w_cloud', text: "Cloud.", uk: "хмаринка", ru: "облачко", voice: 'Isabella', world: 'sky' },
  { id: 'wb_p_cloud', text: "A cloud.", uk: "Хмаринка.", ru: "Облачко.", voice: 'Isabella', world: 'sky' },
  { id: 'wb_w_rainbow', text: "Rainbow!", uk: "веселка", ru: "радуга", voice: 'Isabella', world: 'sky' },
  { id: 'wb_p_rainbow', text: "A rainbow!", uk: "Веселка.", ru: "Радуга.", voice: 'Isabella', world: 'sky' },
  { id: 'wb_w_star', text: "Star.", uk: "зірка", ru: "звезда", voice: 'Isabella', world: 'sky' },
  { id: 'wb_p_star', text: "A star.", uk: "Зірка.", ru: "Звезда.", voice: 'Isabella', world: 'sky' },
  { id: 'wb_w_balloon', text: "Balloon.", uk: "повітряна кулька", ru: "воздушный шарик", voice: 'Isabella', world: 'sky' },
  { id: 'wb_p_balloon', text: "A balloon.", uk: "Повітряна кулька.", ru: "Воздушный шарик.", voice: 'Isabella', world: 'sky' },
  { id: 'wb_w_sheep', text: "Sheep.", uk: "вівця", ru: "овечка", voice: 'Isabella', world: 'sky' },
  { id: 'wb_p_sheep', text: "A sheep.", uk: "Вівця.", ru: "Овечка.", voice: 'Isabella', world: 'sky' },
] as const satisfies readonly EnLine[];

/** The id of a line of the list. */
export type EnId = (typeof EN_LINES)[number]['id'];
/** What can be said: a line, or the name a set of variants shares (`variant_of`). */
export type EnKey = EnId | NonNullable<Extract<(typeof EN_LINES)[number], { variant_of: string }>['variant_of']>;

/** The lines by id. */
export const EN: ReadonlyMap<string, EnLine> = new Map(EN_LINES.map((l) => [l.id, l]));
/** The variants of each set, by the name it shares, in the order of the list. */
export const VARIANTS: ReadonlyMap<string, readonly string[]> = (() => {
  const out = new Map<string, string[]>();
  for (const l of EN_LINES as readonly EnLine[]) if (l.variant_of) out.set(l.variant_of, [...(out.get(l.variant_of) ?? []), l.id]);
  return out;
})();

/** A row of voice/phrases-en.json, what is recorded: the text, its intonation (always `en`), the voice, the world. */
export type EnRow = [text: string, style: 'en', voice: EnVoiceName, world: string];
/**
 * What is sent for recording (`npm run voice:sync` writes it to voice/phrases-en.json; tools/gen_voice.py `--en` records
 * the Zephyr rows, the Isabella ones are Kokoro's). Throws on a list that cannot be recorded: an id twice, an empty
 * text or translation, a placeholder (an English clip never carries the child's name), a voice that is neither of the
 * two, a set of variants named as a line, or a set of one.
 */
export function englishRows(lines: readonly EnLine[] = EN_LINES): Record<string, EnRow> {
  const out: Record<string, EnRow> = {};
  const ids = new Set(lines.map((l) => l.id));
  const sets = new Map<string, number>();
  for (const l of lines) {
    if (Object.hasOwn(out, l.id)) throw new Error(`English line "${l.id}" is listed twice (one id, one clip)`);
    if (!/^[a-z][a-z0-9_]*$/.test(l.id)) throw new Error(`English line "${l.id}": an id is lower case letters, digits and _`);
    for (const f of ['text', 'uk', 'ru'] as const) if (!l[f].trim()) throw new Error(`English line "${l.id}" has no ${f}`);
    if (/[{}]/.test(l.text)) throw new Error(`English line "${l.id}" has a placeholder: ${l.text}`);
    if (l.voice !== 'Isabella' && l.voice !== 'Zephyr') throw new Error(`English line "${l.id}": the voice ${String(l.voice)} is neither Isabella nor Zephyr`);
    if (l.variant_of !== undefined) {
      if (ids.has(l.variant_of)) throw new Error(`English line "${l.id}": its set "${l.variant_of}" is the id of a line`);
      sets.set(l.variant_of, (sets.get(l.variant_of) ?? 0) + 1);
    }
    out[l.id] = [l.text, 'en', l.voice, l.world];
  }
  for (const [set, n] of sets) if (n < 2) throw new Error(`the variants of "${set}": a set of ${n} is no choice`);
  return out;
}
