/** UI and subtitle text. Voice is Ukrainian only; Russian is text-only for now. */
export type Lang = 'uk' | 'ru';
/** Keys of every member of a union (plain `keyof` would keep only the keys they all share). */
type KeysOf<T> = T extends unknown ? keyof T : never;
/**
 * Compile-time parity guard: every language block must have exactly the keys of every other block.
 * A missing translation fails `tsc` right at the incomplete block ("Property 'x' is missing…"); a key that
 * exists in one block only is reported the same way, at every block that lacks it. Either way the build
 * breaks instead of the game showing `undefined`.
 * Any block added to the table (a third language) is covered automatically.
 */
const sameKeys = <const T extends Record<Lang, Record<string, string>>>(
  table: T & { [L in keyof T]: Record<KeysOf<T[keyof T]>, string> },
): T => table;
const S = sameKeys({
  uk: {
    title: 'Академія чарівних світів', play: 'Грати', cont: 'Продовжити', again: 'Почати спочатку',
    dress: 'Сукня', name: 'Як тебе звати?', namePh: 'Імʼя', hair: 'Волосся', loading: 'Чари завантажуються…', jump: 'Стриб', talk: 'Привіт!', take: 'Взяти', open: 'Відкрити',
    welcome_back: 'З поверненням{, name}! Продовжимо нашу пригоду?',
    found: 'Знайдено!', ok: 'Далі',
    // --- the shared conversation (a world's own lines are in src/worlds/<id>/strings.ts)
    npc_next: 'Чудово! А ось іще одне завдання.',
    npc_again: 'Пограємо ще разок?',
    go_next: 'Біжи за іскорками до нового друга!',
    t_count: 'Скільки їх тут? Торкайся і рахуй.', t_add: 'Скільки буде разом?', t_sub: 'Дехто втік. Скільки залишилось?',
    t_compare_more: 'Де більше?', t_compare_less: 'Де менше?', t_pattern: 'Що буде далі?', t_odd: 'Що тут зайве?',
    t_pairs: 'Знайди однакові картки.', t_order: 'Натискай числа від найменшого.', t_sort: 'Поклади кристал у кошик такого ж кольору.',
    t_simon_watch: 'Дивись і запамʼятовуй!', t_simon_repeat: 'Тепер повтори!',
    h_count: 'Порахуймо разом!', h_left: 'Порахуймо тих, хто залишився.', h_compare: 'Порахуй тут і тут.', h_pattern: 'Подивись, що повторюється.',
    h_odd: 'Хто не схожий на інших?', h_order: 'Яке число найменше?', h_sort: 'Якого кольору кристал?', h_simon: 'Подивись іще раз.',
    place: 'Скласти',
    // --- collection & parents
    col_title: 'Мої скарби', col_stars: 'Зірочки', parents: 'Для батьків', close: 'Закрити',
    gate_q: 'Розділ для дорослих. Скільки буде {a} × {b}?', p_title: 'Батьківський розділ', p_version: 'Версія',
    sk_count: 'Лічба', sk_add: 'Додавання', sk_sub: 'Віднімання', sk_compare: 'Порівняння', sk_logic: 'Логіка',
    p_skill: 'Навичка', p_level: 'Рівень', p_tasks: 'Завдань', p_first: 'З першої спроби', p_errors: 'Помилок',
    p_diff: 'Складність', d0: 'Авто', d1: 'Легко', d2: 'Середньо', d3: 'Складно',
    p_quality: 'Якість графіки', q0: 'Проста', q1: 'Середня', q2: 'Висока',
    p_music: 'Музика', p_sfx: 'Звуки', p_voice: 'Голос', p_reset: 'Скинути прогрес', p_reset_sure: 'Точно скинути? Натисни ще раз.',
    // --- the device cannot run the game / the game could not load (TECH-07, TECH-08): for the grown-ups, text only
    no_webgl: 'Цей браузер не вміє показувати тривимірний світ гри. Оновіть браузер до нової версії або відкрийте гру в іншому браузері.',
    load_failed: 'Не вдалося завантажити гру. Перевірте інтернет і спробуйте ще раз.', retry: 'Спробувати ще раз',
  },
  ru: {
    title: 'Академия волшебных миров', play: 'Играть', cont: 'Продолжить', again: 'Начать сначала',
    dress: 'Платье', name: 'Как тебя зовут?', namePh: 'Имя', hair: 'Волосы', loading: 'Волшебство загружается…', jump: 'Прыг', talk: 'Привет!', take: 'Взять', open: 'Открыть',
    welcome_back: 'С возвращением{, name}! Продолжим наше приключение?',
    found: 'Найдено!', ok: 'Дальше',
    npc_next: 'Отлично! А вот ещё одно задание.',
    npc_again: 'Сыграем ещё разок?',
    go_next: 'Беги за искорками к новому другу!',
    t_count: 'Сколько их здесь? Касайся и считай.', t_add: 'Сколько будет вместе?', t_sub: 'Кое-кто убежал. Сколько осталось?',
    t_compare_more: 'Где больше?', t_compare_less: 'Где меньше?', t_pattern: 'Что будет дальше?', t_odd: 'Что здесь лишнее?',
    t_pairs: 'Найди одинаковые карточки.', t_order: 'Нажимай числа от самого маленького.', t_sort: 'Положи кристалл в корзину такого же цвета.',
    t_simon_watch: 'Смотри и запоминай!', t_simon_repeat: 'Теперь повтори!',
    h_count: 'Посчитаем вместе!', h_left: 'Посчитаем тех, кто остался.', h_compare: 'Посчитай здесь и здесь.', h_pattern: 'Посмотри, что повторяется.',
    h_odd: 'Кто не похож на остальных?', h_order: 'Какое число самое маленькое?', h_sort: 'Какого цвета кристалл?', h_simon: 'Посмотри ещё раз.',
    place: 'Собрать',
    col_title: 'Мои сокровища', col_stars: 'Звёздочки', parents: 'Для родителей', close: 'Закрыть',
    gate_q: 'Раздел для взрослых. Сколько будет {a} × {b}?', p_title: 'Родительский раздел', p_version: 'Версия',
    sk_count: 'Счёт', sk_add: 'Сложение', sk_sub: 'Вычитание', sk_compare: 'Сравнение', sk_logic: 'Логика',
    p_skill: 'Навык', p_level: 'Уровень', p_tasks: 'Заданий', p_first: 'С первой попытки', p_errors: 'Ошибок',
    p_diff: 'Сложность', d0: 'Авто', d1: 'Легко', d2: 'Средне', d3: 'Сложно',
    p_quality: 'Качество графики', q0: 'Простое', q1: 'Среднее', q2: 'Высокое',
    p_music: 'Музыка', p_sfx: 'Звуки', p_voice: 'Голос', p_reset: 'Сбросить прогресс', p_reset_sure: 'Точно сбросить? Нажми ещё раз.',
    no_webgl: 'Этот браузер не умеет показывать трёхмерный мир игры. Обновите браузер до новой версии или откройте игру в другом браузере.',
    load_failed: 'Не удалось загрузить игру. Проверьте интернет и попробуйте ещё раз.', retry: 'Попробовать ещё раз',
  },
});
/** The shared table, exported for the parity unit test only; game code goes through `t` / `tf` / `voiceText`. */
export { S as STRINGS };
/** Intonations the recording pipeline knows; tools/gen_voice.py passes the name on as it is. */
export const VOICE_STYLES = ['warm', 'joy', 'calm'] as const;
export type VoiceStyle = (typeof VOICE_STYLES)[number];

/**
 * The keys every world's table has: the world's own text for a place of the shared screens (the start screen's
 * subtitle is the name of the world). Each world has its own; only the world played adds them (`addStrings`), so
 * they are not "one key in two tables". Never spoken.
 */
export const WORLD_OWN = ['subtitle'] as const;
type WorldOwnKey = (typeof WORLD_OWN)[number];
const own = (k: string) => (WORLD_OWN as readonly string[]).includes(k);
type WorldTable = Record<string, string> & Record<WorldOwnKey, string>;
/**
 * The texts of one world (ARCH-12), in src/worlds/<id>/strings.ts: its table in both languages (with every key of
 * `WORLD_OWN`) and its spoken lines.
 * Such a file holds only `import type` and `declare module` (tools/sync_phrases.mjs loads it in Node).
 */
export interface WorldStrings { id: string; table: { uk: WorldTable; ru: WorldTable }; spoken: Record<string, VoiceStyle> }
/** Each world's strings.ts adds itself: `declare module '../../ui/strings' { interface WorldTables { <id>: typeof strings } }`. */
export interface WorldTables {}
type WorldKey = { [W in keyof WorldTables]: keyof WorldTables[W]['table']['uk'] }[keyof WorldTables];
type WorldSpokenKey = { [W in keyof WorldTables]: keyof WorldTables[W]['spoken'] }[keyof WorldTables];
/** A key of the shared table or of any world's table. */
export type Key = keyof typeof S.uk | WorldOwnKey | WorldKey;
/**
 * Every shared line the game speaks, with the intonation of its recording: joy for praise and the finale, warm for
 * requests and questions, calm for "watch closely". Interface-only strings are not listed; a world lists its own
 * lines in the `spoken` of its strings.ts.
 * These tables are the only source of voice/phrases.json (`npm run voice:sync`), and `SpokenKey` is the only key type
 * `voiceText` and the speaking code accept, so a line cannot be spoken without being listed for recording.
 * To make a string spoken, add `key: 'style'` here (or to the world's `spoken`) and run `npm run voice:sync`.
 */
const SPOKEN = {
  welcome_back: 'joy',
  npc_next: 'joy', npc_again: 'warm', go_next: 'warm',
  t_count: 'warm', t_add: 'warm', t_sub: 'warm', t_compare_more: 'warm', t_compare_less: 'warm', t_pattern: 'warm', t_odd: 'warm',
  t_pairs: 'warm', t_order: 'warm', t_sort: 'warm', t_simon_watch: 'calm', t_simon_repeat: 'warm',
  h_count: 'warm', h_left: 'warm', h_compare: 'warm', h_pattern: 'warm', h_odd: 'warm', h_order: 'warm', h_sort: 'warm', h_simon: 'warm',
} as const satisfies Partial<Record<keyof typeof S.uk, VoiceStyle>>;
/** A spoken line of the shared table or of any world. */
export type SpokenKey = keyof typeof SPOKEN | WorldSpokenKey;
export { SPOKEN };

/** The shared table with every world's table added (`addStrings`): what `t`, `tf` and `voiceText` read. */
const TABLE: Record<Lang, Record<string, string>> = { uk: { ...S.uk }, ru: { ...S.ru } };
/**
 * Adds a world's texts (src/main.ts, for each world of the registry, before the start screen). A key that already
 * exists is an error: one key, one clip. The keys of `WORLD_OWN` come only from the world `played`, and only one
 * world is played.
 */
export function addStrings(w: WorldStrings, played: boolean): void {
  const langs = Object.keys(TABLE) as Lang[];
  const taken = langs.flatMap((l) => Object.keys(w.table[l]))
    .filter((k) => (played || !own(k)) && (Object.hasOwn(TABLE.uk, k) || Object.hasOwn(TABLE.ru, k)));
  if (taken.length) throw new Error(`world "${w.id}": these strings already exist (one key, one clip): ${[...new Set(taken)].join(', ')}`);
  for (const l of langs) Object.assign(TABLE[l], Object.fromEntries(Object.entries(w.table[l]).filter(([k]) => played || !own(k))));
}
/**
 * A line as it is recorded: the name placeholder is cut out, so neither a clip nor a request to the voice service
 * ever carries a name. Any other placeholder cannot be recorded as one fixed clip and is an error.
 */
export function recordable(key: string, text: string): string {
  const out = text.replace(/\{, name\}/g, '');
  if (/[{}]/.test(out)) throw new Error(`spoken line "${key}" still has a placeholder after the name is cut out: ${out}`);
  return out;
}
/**
 * What is sent for recording: every spoken line in Ukrainian with its intonation, the shared ones in the order of
 * `SPOKEN`, then each world's in the order given and of its `spoken`. A key two tables share is an error.
 */
export function recordingList(worlds: readonly WorldStrings[]): Record<string, [text: string, style: VoiceStyle]> {
  const list: Record<string, [text: string, style: VoiceStyle]> = {};
  const keys = new Set(Object.keys(S.uk));
  const add = (owner: string, uk: Record<string, string>, spoken: Record<string, VoiceStyle>) => {
    for (const [k, style] of Object.entries(spoken)) {
      if (own(k)) throw new Error(`"${k}" of ${owner} is the world's own text of a shared screen (WORLD_OWN): never spoken`);
      if (typeof uk[k] !== 'string') throw new Error(`spoken line "${k}" of ${owner} has no Ukrainian text`);
      list[k] = [recordable(k, uk[k]), style];
    }
  };
  add('the shared strings', S.uk, SPOKEN);
  for (const w of worlds) {
    const twice = Object.keys(w.table.uk).filter((k) => !own(k) && keys.has(k));
    if (twice.length) throw new Error(`world "${w.id}": these strings already exist (one key, one clip): ${twice.join(', ')}`);
    for (const k of Object.keys(w.table.uk)) if (!own(k)) keys.add(k);
    add(`world "${w.id}"`, w.table.uk, w.spoken);
  }
  return list;
}
/** Saved language; falls back to Ukrainian when storage is missing, blocked or holds an unknown value. */
function savedLang(): Lang {
  try {
    const v = localStorage.getItem('amw-lang');
    return v !== null && Object.hasOwn(S, v) ? (v as Lang) : 'uk';
  } catch { return 'uk'; }
}
export let lang: Lang = savedLang();
export function setLang(l: Lang) { lang = l; try { localStorage.setItem('amw-lang', l); } catch { /* ignore */ } }
/** The child's name as she is addressed ("Оленко", "Софійко"); empty = lines simply drop it. Stored only in the local save. */
let childName = '';
export function setChildName(n: string) { childName = n.trim().slice(0, 20); }
const fill = (s: string) => s.replace(/\{, name\}/g, childName ? `, ${childName}` : '');
export const t = (k: Key) => fill(TABLE[lang][k]);
/** Voice lines are always spoken in Ukrainian. Only lines marked in `SPOKEN` (or a world's `spoken`) can be spoken. */
export const voiceText = (k: SpokenKey) => fill(TABLE.uk[k]);
/** Text with {n}-style variables. */
export const tf = (k: Key, vars: Record<string, string | number>) => t(k).replace(/\{(\w+)\}/g, (_, v) => String(vars[v] ?? ''));
