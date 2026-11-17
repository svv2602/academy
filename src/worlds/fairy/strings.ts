/**
 * The texts of the first world, the Fairy Kingdom (ARCH-12): its story, its counters and its part of the book.
 * The texts every world shares are in src/ui/strings.ts; src/main.ts adds these with `addStrings` before the start screen.
 *
 * Only `import type` and `declare module` here: tools/sync_phrases.mjs loads this file in Node, which strips the types
 * but cannot resolve a value import without its extension. Keys are never renamed: a clip is named after its key.
 */
import type { VoiceStyle, WorldStrings } from '../../ui/strings';

const uk = {
  // --- the start screen's subtitle: the name of this world (a key every world has, WORLD_OWN in src/ui/strings.ts)
  subtitle: 'Королівство фей',
  intro: 'Привіт{, name}! Ми в Королівстві фей. Кристал світла розбився на пʼять уламків! Допоможеш їх зібрати?',
  // --- the tour of the world on the first entry (WORLD-11): the cat's one line while the camera flies
  tour: 'Подивись, яке гарне Королівство фей! Тут ставок, замок і чарівні галявини. Ходімо гуляти!',
  count_hint: 'Торкайся кожного метелика, і ми порахуємо разом.',
  pick_number: 'Скільки метеликів? Обери число.',
  chest: 'Ого, таємна скриня! У ній зірочки!', crystal_name: 'Кристал світла',
  free: 'Гуляй королівством! Тут ще багато таємниць.',
  // --- the story
  unicorn_hi: 'Мої метелики розлетілися! Допоможи їх порахувати.',
  fox_hi: 'Привіт! Я лисичка. Розгадаєш мої хитрі загадки?',
  mushking_hi: 'Я Грибний Король. Допоможи навести лад у моєму лісі!',
  deer_hi: 'Мої зірочки сховалися в траві. Знайдеш їх?',
  queen_hi: 'Вітаю, Хранителько! Останній уламок у мене. Пройди три випробування.',
  npc_done: 'Дякую тобі! Тримай уламок Кристала світла!',
  t_stars: 'Знайди пʼять зірочок, що сховалися поруч!', t_stars_back: 'Усі зірочки знайдено! Повертаймося до оленя.',
  shard_title: 'Уламок кристала!', shard_text: '{n} з 5', all_shards: 'Усі уламки в нас! Віднесімо їх до альтанки біля ставка.',
  final_title: 'Кристал світла сяє!', final_text: 'Ти повернула магію Королівству фей!',
  // --- the book
  col_shards: 'Уламки кристала', col_chest: 'Таємна скриня',
};

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = {
  subtitle: 'Королевство фей',
  intro: 'Привет{, name}! Мы в Королевстве фей. Кристалл света разбился на пять осколков! Поможешь их собрать?',
  tour: 'Посмотри, какое красивое Королевство фей! Здесь пруд, замок и волшебные поляны. Пойдём гулять!',
  count_hint: 'Касайся каждой бабочки, и мы посчитаем вместе.',
  pick_number: 'Сколько бабочек? Выбери число.',
  chest: 'Ого, тайный сундук! В нём звёздочки!', crystal_name: 'Кристалл света',
  free: 'Гуляй по королевству! Здесь ещё много тайн.',
  unicorn_hi: 'Мои бабочки разлетелись! Помоги их посчитать.',
  fox_hi: 'Привет! Я лисичка. Разгадаешь мои хитрые загадки?',
  mushking_hi: 'Я Грибной Король. Помоги навести порядок в моём лесу!',
  deer_hi: 'Мои звёздочки спрятались в траве. Найдёшь их?',
  queen_hi: 'Здравствуй, Хранительница! Последний осколок у меня. Пройди три испытания.',
  npc_done: 'Спасибо тебе! Держи осколок Кристалла света!',
  t_stars: 'Найди пять звёздочек, которые спрятались рядом!', t_stars_back: 'Все звёздочки найдены! Возвращаемся к оленю.',
  shard_title: 'Осколок кристалла!', shard_text: '{n} из 5', all_shards: 'Все осколки у нас! Отнесём их в беседку у пруда.',
  final_title: 'Кристалл света сияет!', final_text: 'Ты вернула магию Королевству фей!',
  col_shards: 'Осколки кристалла', col_chest: 'Тайный сундук',
};

/** The lines of this world the game speaks, with the intonation of their recording (as `SPOKEN` in src/ui/strings.ts). */
const spoken = {
  intro: 'joy', tour: 'joy', chest: 'joy', free: 'warm',
  unicorn_hi: 'warm', fox_hi: 'warm', mushking_hi: 'warm', deer_hi: 'warm', queen_hi: 'warm',
  npc_done: 'joy', t_stars: 'warm', t_stars_back: 'joy', all_shards: 'joy', final_text: 'joy',
} as const satisfies Partial<Record<keyof typeof uk, VoiceStyle>>;

export const strings = { id: 'fairy', table: { uk, ru }, spoken } satisfies WorldStrings;

declare module '../../ui/strings' {
  interface WorldTables { fairy: typeof strings }
}
