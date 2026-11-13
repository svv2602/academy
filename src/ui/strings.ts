/** UI and subtitle text. Voice is Ukrainian only; Russian is text-only for now. */
export type Lang = 'uk' | 'ru';
const S = {
  uk: {
    title: 'Академія чарівних світів', subtitle: 'Королівство фей', play: 'Грати', cont: 'Продовжити', again: 'Почати спочатку',
    dress: 'Сукня', name: 'Як тебе звати?', namePh: 'Імʼя', hair: 'Волосся', style: 'Зачіска', style_long: 'Каре', style_buns: 'Гульки', style_simpleparted: 'Коротка', loading: 'Чари завантажуються…', jump: 'Стриб', talk: 'Привіт!', take: 'Взяти', open: 'Відкрити',
    intro: 'Привіт{, name}! Ми в Королівстві фей. Чарівний кристал зник! Допоможеш його знайти?',
    go_unicorn: 'Ходімо до єдинорога! Біжи за іскорками.',
    uni_ask: 'Єдиноріг загубив своїх метеликів. Порахуй, скільки метеликів літає над квітами!',
    count_hint: 'Торкайся кожного метелика, і ми порахуємо разом.',
    pick_number: 'Скільки метеликів? Обери число.',
    reward: 'Ура! Єдиноріг дарує тобі чарівний кристал! Підійди і забери його.',
    got_crystal: 'Ти знайшла Кристал світла! Королівство знову сяє!',
    welcome_back: 'З поверненням{, name}! Продовжимо нашу пригоду?',
    chest: 'Ого, таємна скриня! У ній зірочки!', crystal_name: 'Кристал світла', found: 'Знайдено!', ok: 'Далі',
    free: 'Гуляй королівством! Тут ще багато таємниць.',
  },
  ru: {
    title: 'Академия волшебных миров', subtitle: 'Королевство фей', play: 'Играть', cont: 'Продолжить', again: 'Начать сначала',
    dress: 'Платье', name: 'Как тебя зовут?', namePh: 'Имя', hair: 'Волосы', style: 'Причёска', style_long: 'Каре', style_buns: 'Пучки', style_simpleparted: 'Короткая', loading: 'Волшебство загружается…', jump: 'Прыг', talk: 'Привет!', take: 'Взять', open: 'Открыть',
    intro: 'Привет{, name}! Мы в Королевстве фей. Волшебный кристалл исчез! Поможешь его найти?',
    go_unicorn: 'Пойдём к единорогу! Беги за искорками.',
    uni_ask: 'Единорог потерял своих бабочек. Посчитай, сколько бабочек летает над цветами!',
    count_hint: 'Касайся каждой бабочки, и мы посчитаем вместе.',
    pick_number: 'Сколько бабочек? Выбери число.',
    reward: 'Ура! Единорог дарит тебе волшебный кристалл! Подойди и забери его.',
    got_crystal: 'Ты нашла Кристалл света! Королевство снова сияет!',
    welcome_back: 'С возвращением{, name}! Продолжим наше приключение?',
    chest: 'Ого, тайный сундук! В нём звёздочки!', crystal_name: 'Кристалл света', found: 'Найдено!', ok: 'Дальше',
    free: 'Гуляй по королевству! Здесь ещё много тайн.',
  },
} as const;
export type Key = keyof typeof S.uk;
export let lang: Lang = (localStorage.getItem('amw-lang') as Lang) || 'uk';
export function setLang(l: Lang) { lang = l; try { localStorage.setItem('amw-lang', l); } catch { /* ignore */ } }
/** The child's name as she is addressed ("Оленко", "Софійко"); empty = lines simply drop it. Stored only in the local save. */
let childName = '';
export function setChildName(n: string) { childName = n.trim().slice(0, 20); }
const fill = (s: string) => s.replace(/\{, name\}/g, childName ? `, ${childName}` : '');
export const t = (k: Key) => fill(S[lang][k]);
/** Voice lines are always spoken in Ukrainian. */
export const voiceText = (k: Key) => fill(S.uk[k]);
