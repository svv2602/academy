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
    // TECH-09: the cat at the portal of a world that is not downloaded, without the network (src/game/gate.ts)
    need_net: 'Щоб відкрити цей портал, потрібен інтернет. Попроси дорослих увімкнути його.',
    t_count: 'Скільки їх тут? Торкайся і рахуй.', t_add: 'Скільки буде разом?', t_sub: 'Дехто втік. Скільки залишилось?',
    t_compare_more: 'Де більше?', t_compare_less: 'Де менше?', t_pattern: 'Що буде далі?', t_odd: 'Що тут зайве?',
    t_pairs: 'Знайди однакові картки.', t_order: 'Натискай числа від найменшого.', t_sort: 'Поклади кристал у кошик такого ж кольору.',
    t_simon_watch: 'Дивись і запамʼятовуй!', t_simon_repeat: 'Тепер повтори!',
    h_count: 'Порахуймо разом!', h_left: 'Порахуймо тих, хто залишився.', h_compare: 'Порахуй тут і тут.', h_pattern: 'Подивись, що повторюється.',
    h_odd: 'Хто не схожий на інших?', h_order: 'Яке число найменше?', h_sort: 'Якого кольору кристал?', h_simon: 'Подивись іще раз.',
    // --- the kinds and variants of LEARN-06…09 and R38: their questions
    t_missing: 'Скільки не вистачає до потрібного числа?', t_house: 'Яке число сховалося в будиночку?',
    t_before: 'Яке число стоїть перед цим числом?', t_after: 'Яке число стоїть після цього числа?',
    t_signs: 'Порівняй числа. Який знак поставимо: більше, менше чи дорівнює?',
    t_sort_two: 'Поклади кожну фігурку в кошик за кольором і формою.',
    // --- the hint in three steps (LEARN-10, HINTS.md of the run): h1_ - the way, said only; h2_ - solved together; h3_ - the answer glows.
    // The older h_ lines keep their keys (a clip is named by its key) and stand at the step HINTS.md gives them.
    h1_count: 'Торкайся кожного по одному, щоб нікого не пропустити.', h1_ten: 'Повна рамка — це десять. Далі рахуй від десяти.',
    h2_ten: 'Тут уже десять. Рахуймо далі разом!', h1_add: 'Запамʼятай, скільки в першій групі, і рахуй далі по одному.',
    h1_add_cross: 'Спочатку доповни до десяти, а потім додай те, що залишилось.', h2_add_cross: 'Рахуймо разом: спершу до десяти, а потім ще трохи.',
    h1_sub: 'Тих, хто втік, не рахуй. Рахуй тільки тих, хто залишився.',
    h1_sub_cross: 'Спочатку забери стільки, щоб лишилося десять, а потім забери решту.', h2_sub_cross: 'Рахуймо разом: спершу забираємо до десяти, а потім ще.',
    h2_compare: 'Порахуймо разом кожну групу.', h1_compare_num: 'Коли рахуєш, більше число звучить пізніше.',
    h2_compare_num: 'Покладемо обидва числа предметами і порівняємо разом.',
    h1_signs: 'Знак відкриває ротик до більшого числа. Для однакових чисел — знак дорівнює.',
    h2_signs: 'Покладемо обидва числа предметами. Складемо їх парами і подивимось, де більше.',
    h2_order: 'Рахуймо разом від одного. Яке число зустрінемо першим?',
    h1_neighbors: 'Порахуй по доріжці від початку і дійди до пропуску.', h2_neighbors: 'Рахуймо разом по доріжці, клітинка за клітинкою.',
    h1_missing: 'Почни з числа, яке вже є, і рахуй далі до потрібного.', h1_missing_ten: 'Спочатку дорахуй до десяти, а потім далі до потрібного.',
    h2_missing: 'Рахуймо далі разом і подивимось, скільки додали.',
    h1_house: 'Число на даху — це дві частини разом. Скільки бракує до нього?', h2_house: 'Рахуймо разом від числа у віконці до числа на даху.',
    h2_pattern: 'Дивись, ось що повторюється. Продовжимо разом!', h1_pattern_grow: 'Порахуй, скільки в кожній групі. Як росте ряд?',
    h2_pattern_grow: 'Рахуймо разом, скільки предметів у кожній групі.',
    h1_pattern_two: 'Тут змінюються і колір, і предмет. Подивись на кожне окремо.', h2_pattern_two: 'Спочатку знайдемо, як іде колір, а потім — предмет.',
    h1_simon: 'Коли кнопка засвітиться, тихенько назви її колір.', h1_simon_long: 'Запамʼятовуй кольори по два разом, так легше.',
    h1_odd_shape: 'Колір у всіх однаковий. Подивись на форму і на розмір.', h1_odd_two: 'Подивись і на колір, і на форму. Хто тут інший?',
    h2_odd: 'Знайдемо разом тих, хто схожий між собою.', h2_sort: 'Знайдемо разом кошик такого ж кольору.',
    h1_sort_two: 'Подивись на колір і на форму. Потрібен кошик, де збігається і те, і те.', h2_sort_two: 'Спочатку знайдемо колір, а потім форму.',
    h3_show: 'Подивись, що світиться. Це підказка для тебе.',
    place: 'Скласти',
    // --- collection & parents
    col_title: 'Мої скарби', col_stars: 'Зірочки', parents: 'Для батьків', close: 'Закрити',
    gate_q: 'Розділ для дорослих. Скільки буде {a} × {b}?', p_title: 'Батьківський розділ', p_version: 'Версія',
    sk_count: 'Лічба', sk_add: 'Додавання', sk_sub: 'Віднімання', sk_compare: 'Порівняння', sk_logic: 'Логіка',
    p_skill: 'Навичка', p_level: 'Рівень', p_tasks: 'Завдань', p_first: 'З першої спроби', p_errors: 'Помилок',
    p_diff: 'Складність', d0: 'Авто', d1: 'Легко', d2: 'Середньо', d3: 'Складно',
    // --- the skills after LEARN-03 and R34, the level fixed per skill (LEARN-15), the week and the hard examples (PLAY-15)
    sk_series: 'Числовий ряд', sk_pattern: 'Закономірності', sk_memory: 'Памʼять', sk_classify: 'Класифікація', sk_compose: 'Склад числа',
    p_fix: 'Закріпити рівень', p_fix_note: 'Авто — гра сама підбирає рівень за відповідями дитини.',
    p_time: 'Час гри за 7 днів', p_total: 'Усього', p_min: '{n} хв', p_time_none: 'Цього тижня ще не грали.',
    p_hard: 'Пʼять найважчих прикладів', p_hard_none: 'Поки немає прикладів із помилками.',
    p_wd0: 'Нд', p_wd1: 'Пн', p_wd2: 'Вт', p_wd3: 'Ср', p_wd4: 'Чт', p_wd5: 'Пт', p_wd6: 'Сб',
    p_quality: 'Якість графіки', q0: 'Проста', q1: 'Середня', q2: 'Висока',
    p_music: 'Музика', p_sfx: 'Звуки', p_voice: 'Голос', p_reset: 'Скинути прогрес', p_reset_sure: 'Точно скинути? Натисни ще раз.',
    // --- the save as a code (PLAY-16): read by the grown-ups only, never spoken
    p_code: 'Перенести гру', p_code_note: 'Код — це вся гра дитини без налаштувань пристрою. Скопіюй його тут і встав на іншому пристрої.',
    p_code_copy: 'Скопіювати код', p_code_copied: 'Код скопійовано.', p_code_select: 'Виділи код у полі й скопіюй його.',
    p_code_paste: 'Вставити код', p_code_load: 'Завантажити', p_code_sure: 'Замінити гру на цьому пристрої? Натисни ще раз.', p_code_back: 'Назад',
    p_code_empty: 'Спочатку встав код у поле.', p_code_foreign: 'Це не код цієї гри.', p_code_damaged: 'Код пошкоджено. Скопіюй його ще раз, повністю.',
    p_code_nosave: 'У цьому коді немає збереження гри.', p_code_toolong: 'Це не код цієї гри: він задовгий.', p_code_restore: 'Повернути попередню гру', p_code_restore_sure: 'Повернути гру, що була до коду? Натисни ще раз.',
    p_code_unpack: 'Цей браузер не може прочитати стиснений код. Онови браузер або скопіюй код на старому пристрої в новішому браузері.', p_code_storage: 'Браузер не дав записати гру. Звільни місце й спробуй ще раз.',
    // --- the shop and the fitting room (PLAY-04, PLAY-05): a screen of the book
    shop: 'Лавка', shop_done: 'Готово', shop_buy: 'Купити за {n} ⭐', shop_short: 'ще {n} ⭐',
    shop_find: 'Знайдеш, коли відновиш Кристал Світла', shop_achieve: 'за досягнення',
    shop_hi: 'Це чарівна лавка{, name}! Торкнись речі, і вона одразу на тобі.',
    shop_more: 'Ще трішки зірочок, і ця річ буде твоя!',
    shop_bought: 'Тепер це твоє назавжди!',
    // --- the device cannot run the game / the game could not load (TECH-07, TECH-08): for the grown-ups, text only
    no_webgl: 'Цей браузер не вміє показувати тривимірний світ гри. Оновіть браузер до нової версії або відкрийте гру в іншому браузері.',
    load_failed: 'Не вдалося завантажити гру. Перевірте інтернет і спробуйте ще раз.', retry: 'Спробувати ще раз',
    // --- the clips of the old game (VOICE-07, tools/import_old_voice.py): its text letter for letter, the plain apostrophe kept
    praise_0: 'Молодець!', praise_1: 'Чудово!', praise_3: 'Супер!', praise_4: 'Правильно!', praise_5: 'Ура! Вірно!', praise_6: 'Ти розумниця!',
    praise_7: 'Клас! Ти молодчинка!', try_0: 'Майже! Спробуй ще раз.', try_1: 'Ой, не зовсім. Ще раз!', try_2: 'Подумай ще трішки.',
    tap_1: 'Один', tap_2: 'Два', tap_3: 'Три', tap_4: 'Чотири', tap_5: "П'ять", tap_6: 'Шість', tap_7: 'Сім', tap_8: 'Вісім', tap_9: "Дев'ять", tap_10: 'Десять',
    tap_11: 'Одинадцять', tap_12: 'Дванадцять', tap_13: 'Тринадцять', tap_14: 'Чотирнадцять', tap_15: "П'ятнадцять", tap_16: 'Шістнадцять', tap_17: 'Сімнадцять', tap_18: 'Вісімнадцять', tap_19: "Дев'ятнадцять", tap_20: 'Двадцять',
    // --- the achievements (PLAY-08, e4-texts.md §1): text only, the cat's lines come with their clips
    ach_title: 'Нове досягнення!', ach_book: 'Мої досягнення', ach_locked: 'Ще попереду',
    ach_first_shard_t: 'Перша частинка', ach_first_shard_d: 'Поверни першу частинку скарбу.',
    ach_secret_chest_t: 'Шукачка скарбів', ach_secret_chest_d: 'Відкрий таємну скриню.',
    ach_all_world_stars_t: 'Усі зірочки', ach_all_world_stars_d: 'Збери всі зірочки, що лежать у світі.',
    ach_first_artifact_t: 'Перший скарб', ach_first_artifact_d: 'Збери цілий артефакт.',
    ach_three_secrets_t: 'Хранителька таємниць', ach_three_secrets_d: 'Знайди три таємниці.',
    ach_first_task_t: 'Перший крок', ach_first_task_d: 'Розгадай перше завдання.',
    ach_try_again_t: 'Ще раз — і вийшло!', ach_try_again_d: 'Розгадай завдання після спроби, що не вдалася.',
    ach_all_skills_t: 'Усього потроху', ach_all_skills_d: 'Спробуй завдання кожного виду.',
    ach_fifty_tasks_t: 'Пʼятдесят завдань', ach_fifty_tasks_d: 'Розгадай пʼятдесят завдань.',
    ach_clean_ten_t: 'Десять поспіль', ach_clean_ten_d: 'Розгадай десять завдань поспіль з першої спроби.',
    ach_days_3_t: 'Три дні пригод', ach_days_3_d: 'Грай у три різні дні.',
    ach_days_5_t: 'Пʼять днів пригод', ach_days_5_d: 'Грай у пʼять різних днів.',
    // --- the cat's lines of the achievements' scenes, of the pet found and chosen (PLAY-08, PLAY-09): spoken
    ach_first_shard: 'Перша частинка вдома! Магія вже повертається.',
    ach_secret_chest: 'Ти знайшла таємну скриню! Справжня дослідниця!',
    ach_all_world_stars: 'Усі зірочки цього світу в тебе! Яке гостре око!',
    ach_first_artifact: 'Перший скарб повернувся додому! Ти справжня Хранителька!',
    ach_three_secrets: 'Три таємниці! Ти помічаєш те, чого не бачать інші.',
    ach_first_task: 'Перше завдання розгадано! Пригода починається.',
    ach_try_again: 'Не вийшло одразу, а ти спробувала ще — і вийшло!',
    ach_all_skills: 'Ти спробувала все: і лічбу, і загадки! Молодчинка!',
    ach_fifty_tasks: 'Пʼятдесят завдань позаду! Ось це старання!',
    ach_clean_ten: 'Десять завдань поспіль з першої спроби! Неймовірно!',
    ach_days_3: 'Ми разом уже три дні! Мені з тобою весело.',
    ach_days_5: 'Пʼять днів пригод разом! Ти моя найкраща подружка.',
    pet_found: 'Ой, оленятко! Тепер воно гулятиме з нами.',
    pet_chosen: 'Твій улюбленець іде з нами!',
    // --- the cat's lines of the break and of the welcome of a new day (PLAY-20, PLAY-21): spoken
    break_1: 'Ми сьогодні чудово погралися! Продовжимо завтра?',
    break_2: 'Мої лапки трохи втомилися. Може, відпочинемо до завтра?',
    break_3: 'Усе, що ми знайшли, збережеться. Продовжимо завтра?',
    break_4: 'Яка гарна пригода сьогодні! Час відпочити оченятам.',
    break_5: 'Світ зачекає на нас до завтра. Відпочинемо?',
    break_more_1: 'Гаразд! Ще трішки пограємо разом.',
    break_more_2: 'Добре, я з тобою! Куди підемо?',
    break_more_3: 'Чудово! Біжімо далі за іскорками.',
    break_bye_1: 'До завтра! Я чекатиму тебе тут.',
    break_bye_2: 'Відпочивай! Завтра на нас чекають нові дива.',
    hello_1: 'Привіт! Я так скучав за тобою!',
    hello_2: 'Ура, ти тут! Мур-р, починаємо пригоду!',
    hello_3: 'Вітаю, Хранителько! Світи на тебе чекають.',
    hello_4: 'Ось і ти! Мені стільки треба тобі показати!',
    hello_5: 'Мур! Як добре, що ти повернулася!',
    gift_star_1: 'А це тобі зірочка — подарунок на сьогодні!',
    gift_star_2: 'Мур! Зірочка для тебе — просто так!',
    left_new_world: 'Тут живуть нові друзі. Ходімо познайомимося!',
    left_mid_chain: 'Наш друг чекає на тебе. Біжімо за іскорками!',
    left_between: 'Одному другові ми вже допомогли. Хто наступний?',
    left_before_final: 'Усі частинки вже в нас! Залишилось скласти скарб.',
    left_after_artifact: 'Наш скарб сяє! Великому Дереву вже краще.',
    // --- the profile in the book (PLAY-07, PLAY-09; e4-texts.md §4): the magic shelf, the secrets, the pets. Text only:
    shelf_title: 'Чарівна полиця', shelf_found: 'Сяє на полиці', shelf_parts: '{n} з {of} {parts}',
    shelf_first: 'Це наша чарівна полиця. Тут засяють усі пʼять скарбів!',
    art_1: 'Кристал світла', art_2: 'Смарагд мудрості', art_3: 'Перлина глибин', art_4: 'Рубін радості', art_5: 'Зірка часу',
    parts_1: 'уламків',
    shelf_wait_1: 'Чекає на тебе в Королівстві фей', shelf_wait_2: 'Чекає на тебе в Зачарованому лісі',
    shelf_wait_3: 'Чекає на тебе в Підводному королівстві', shelf_wait_4: 'Чекає на тебе в Солодкій країні',
    shelf_wait_5: 'Чекає на тебе на Небесних островах',
    book_secrets_t: 'Таємниці', book_secrets: 'Таємниці цього світу: {n} з {of}', book_count: '{n} з {of}',
    book_pets: 'Мої улюбленці', book_pet_pick: 'Торкнись улюбленця, і він піде з тобою.', book_pet_none: 'Улюбленці ще чекають на тебе.',
    book_no_pet: 'Без улюбленця', pet_fawn: 'Оленятко',
    // --- the four ready looks of the start screen (PLAY-06, src/game/looks.ts); not spoken
    looks: 'Образ', look_fairy: 'Фея', look_princess: 'Принцеса', look_elf: 'Ельфійка', look_witch: 'Чарівниця',
    // --- the cat's offer of a break (PLAY-20, src/ui/session.ts): its ten lines are spoken (with the batch 2 of the
    // cat's lines above); the buttons and the parents' rows here
    break_yes: 'До завтра 🌙', break_no: 'Ще пограю ▶',
    p_break: 'Перерва в грі', p_break_hint: 'Через цей час кіт запропонує продовжити завтра — після завдання, не посеред нього. Дитина може відмовитися; тоді кіт нагадає не раніше ніж за 10 хвилин.',
    br10: '10 хв', br15: '15 хв', br20: '20 хв', br30: '30 хв', br_off: 'Вимкнено', gift_caption: 'Подарунок дня: +1 ⭐',
  },
  ru: {
    title: 'Академия волшебных миров', play: 'Играть', cont: 'Продолжить', again: 'Начать сначала',
    dress: 'Платье', name: 'Как тебя зовут?', namePh: 'Имя', hair: 'Волосы', loading: 'Волшебство загружается…', jump: 'Прыг', talk: 'Привет!', take: 'Взять', open: 'Открыть',
    welcome_back: 'С возвращением{, name}! Продолжим наше приключение?',
    found: 'Найдено!', ok: 'Дальше',
    npc_next: 'Отлично! А вот ещё одно задание.',
    npc_again: 'Сыграем ещё разок?',
    go_next: 'Беги за искорками к новому другу!',
    need_net: 'Чтобы открыть этот портал, нужен интернет. Попроси взрослых включить его.',
    t_count: 'Сколько их здесь? Касайся и считай.', t_add: 'Сколько будет вместе?', t_sub: 'Кое-кто убежал. Сколько осталось?',
    t_compare_more: 'Где больше?', t_compare_less: 'Где меньше?', t_pattern: 'Что будет дальше?', t_odd: 'Что здесь лишнее?',
    t_pairs: 'Найди одинаковые карточки.', t_order: 'Нажимай числа от самого маленького.', t_sort: 'Положи кристалл в корзину такого же цвета.',
    t_simon_watch: 'Смотри и запоминай!', t_simon_repeat: 'Теперь повтори!',
    h_count: 'Посчитаем вместе!', h_left: 'Посчитаем тех, кто остался.', h_compare: 'Посчитай здесь и здесь.', h_pattern: 'Посмотри, что повторяется.',
    h_odd: 'Кто не похож на остальных?', h_order: 'Какое число самое маленькое?', h_sort: 'Какого цвета кристалл?', h_simon: 'Посмотри ещё раз.',
    t_missing: 'Сколько не хватает до нужного числа?', t_house: 'Какое число спряталось в домике?',
    t_before: 'Какое число стоит перед этим числом?', t_after: 'Какое число стоит после этого числа?',
    t_signs: 'Сравни числа. Какой знак поставим: больше, меньше или равно?',
    t_sort_two: 'Положи каждую фигурку в корзину по цвету и форме.',
    h1_count: 'Касайся каждого по одному, чтобы никого не пропустить.', h1_ten: 'Полная рамка — это десять. Дальше считай от десяти.',
    h2_ten: 'Здесь уже десять. Считаем дальше вместе!', h1_add: 'Запомни, сколько в первой группе, и считай дальше по одному.',
    h1_add_cross: 'Сначала дополни до десяти, а потом прибавь то, что осталось.', h2_add_cross: 'Считаем вместе: сначала до десяти, а потом ещё немного.',
    h1_sub: 'Тех, кто убежал, не считай. Считай только тех, кто остался.',
    h1_sub_cross: 'Сначала убери столько, чтобы осталось десять, а потом убери остальное.', h2_sub_cross: 'Считаем вместе: сначала убираем до десяти, а потом ещё.',
    h2_compare: 'Посчитаем вместе каждую группу.', h1_compare_num: 'Когда считаешь, большее число звучит позже.',
    h2_compare_num: 'Выложим оба числа предметами и сравним вместе.',
    h1_signs: 'Знак открывает ротик к большему числу. Для одинаковых чисел — знак равно.',
    h2_signs: 'Выложим оба числа предметами. Сложим их парами и посмотрим, где больше.',
    h2_order: 'Считаем вместе от одного. Какое число встретим первым?',
    h1_neighbors: 'Посчитай по дорожке с начала и дойди до пропуска.', h2_neighbors: 'Считаем вместе по дорожке, клеточка за клеточкой.',
    h1_missing: 'Начни с числа, которое уже есть, и считай дальше до нужного.', h1_missing_ten: 'Сначала досчитай до десяти, а потом дальше до нужного.',
    h2_missing: 'Считаем дальше вместе и посмотрим, сколько добавили.',
    h1_house: 'Число на крыше — это две части вместе. Сколько не хватает до него?', h2_house: 'Считаем вместе от числа в окошке до числа на крыше.',
    h2_pattern: 'Смотри, вот что повторяется. Продолжим вместе!', h1_pattern_grow: 'Посчитай, сколько в каждой группе. Как растёт ряд?',
    h2_pattern_grow: 'Считаем вместе, сколько предметов в каждой группе.',
    h1_pattern_two: 'Здесь меняются и цвет, и предмет. Посмотри на каждое отдельно.', h2_pattern_two: 'Сначала найдём, как идёт цвет, а потом — предмет.',
    h1_simon: 'Когда кнопка загорится, тихонько назови её цвет.', h1_simon_long: 'Запоминай цвета по два вместе, так легче.',
    h1_odd_shape: 'Цвет у всех одинаковый. Посмотри на форму и на размер.', h1_odd_two: 'Посмотри и на цвет, и на форму. Кто здесь другой?',
    h2_odd: 'Найдём вместе тех, кто похож друг на друга.', h2_sort: 'Найдём вместе корзину такого же цвета.',
    h1_sort_two: 'Посмотри на цвет и на форму. Нужна корзина, где совпадает и то, и другое.', h2_sort_two: 'Сначала найдём цвет, а потом форму.',
    h3_show: 'Посмотри, что светится. Это подсказка для тебя.',
    place: 'Собрать',
    col_title: 'Мои сокровища', col_stars: 'Звёздочки', parents: 'Для родителей', close: 'Закрыть',
    gate_q: 'Раздел для взрослых. Сколько будет {a} × {b}?', p_title: 'Родительский раздел', p_version: 'Версия',
    sk_count: 'Счёт', sk_add: 'Сложение', sk_sub: 'Вычитание', sk_compare: 'Сравнение', sk_logic: 'Логика',
    p_skill: 'Навык', p_level: 'Уровень', p_tasks: 'Заданий', p_first: 'С первой попытки', p_errors: 'Ошибок',
    p_diff: 'Сложность', d0: 'Авто', d1: 'Легко', d2: 'Средне', d3: 'Сложно',
    sk_series: 'Числовой ряд', sk_pattern: 'Закономерности', sk_memory: 'Память', sk_classify: 'Классификация', sk_compose: 'Состав числа',
    p_fix: 'Закрепить уровень', p_fix_note: 'Авто — игра сама подбирает уровень по ответам ребёнка.',
    p_time: 'Время игры за 7 дней', p_total: 'Всего', p_min: '{n} мин', p_time_none: 'На этой неделе ещё не играли.',
    p_hard: 'Пять самых трудных примеров', p_hard_none: 'Пока нет примеров с ошибками.',
    p_wd0: 'Вс', p_wd1: 'Пн', p_wd2: 'Вт', p_wd3: 'Ср', p_wd4: 'Чт', p_wd5: 'Пт', p_wd6: 'Сб',
    p_quality: 'Качество графики', q0: 'Простое', q1: 'Среднее', q2: 'Высокое',
    p_music: 'Музыка', p_sfx: 'Звуки', p_voice: 'Голос', p_reset: 'Сбросить прогресс', p_reset_sure: 'Точно сбросить? Нажми ещё раз.',
    p_code: 'Перенести игру', p_code_note: 'Код — это вся игра ребёнка без настроек устройства. Скопируй его здесь и вставь на другом устройстве.',
    p_code_copy: 'Скопировать код', p_code_copied: 'Код скопирован.', p_code_select: 'Выдели код в поле и скопируй его.',
    p_code_paste: 'Вставить код', p_code_load: 'Загрузить', p_code_sure: 'Заменить игру на этом устройстве? Нажми ещё раз.', p_code_back: 'Назад',
    p_code_empty: 'Сначала вставь код в поле.', p_code_foreign: 'Это не код этой игры.', p_code_damaged: 'Код повреждён. Скопируй его ещё раз, полностью.',
    p_code_nosave: 'В этом коде нет сохранения игры.', p_code_toolong: 'Это не код этой игры: он слишком длинный.', p_code_restore: 'Вернуть прежнюю игру', p_code_restore_sure: 'Вернуть игру, которая была до кода? Нажми ещё раз.',
    p_code_unpack: 'Этот браузер не может прочитать сжатый код. Обнови браузер или скопируй код на старом устройстве в более новом браузере.', p_code_storage: 'Браузер не дал записать игру. Освободи место и попробуй ещё раз.',
    shop: 'Лавка', shop_done: 'Готово', shop_buy: 'Купить за {n} ⭐', shop_short: 'ещё {n} ⭐',
    shop_find: 'Найдёшь, когда восстановишь Кристалл Света', shop_achieve: 'за достижение',
    shop_hi: 'Это волшебная лавка{, name}! Коснись вещи, и она сразу на тебе.',
    shop_more: 'Ещё чуть-чуть звёздочек, и эта вещь будет твоей!',
    shop_bought: 'Теперь это твоё навсегда!',
    no_webgl: 'Этот браузер не умеет показывать трёхмерный мир игры. Обновите браузер до новой версии или откройте игру в другом браузере.',
    load_failed: 'Не удалось загрузить игру. Проверьте интернет и попробуйте ещё раз.', retry: 'Попробовать ещё раз',
    praise_0: 'Молодец!', praise_1: 'Отлично!', praise_3: 'Супер!', praise_4: 'Правильно!', praise_5: 'Ура! Верно!', praise_6: 'Ты умница!',
    praise_7: 'Класс! Ты молодчинка!', try_0: 'Почти! Попробуй ещё раз.', try_1: 'Ой, не совсем. Ещё раз!', try_2: 'Подумай ещё немножко.',
    tap_1: 'Один', tap_2: 'Два', tap_3: 'Три', tap_4: 'Четыре', tap_5: 'Пять', tap_6: 'Шесть', tap_7: 'Семь', tap_8: 'Восемь', tap_9: 'Девять', tap_10: 'Десять',
    tap_11: 'Одиннадцать', tap_12: 'Двенадцать', tap_13: 'Тринадцать', tap_14: 'Четырнадцать', tap_15: 'Пятнадцать', tap_16: 'Шестнадцать', tap_17: 'Семнадцать', tap_18: 'Восемнадцать', tap_19: 'Девятнадцать', tap_20: 'Двадцать',
    ach_title: 'Новое достижение!', ach_book: 'Мои достижения', ach_locked: 'Ещё впереди',
    ach_first_shard_t: 'Первая частичка', ach_first_shard_d: 'Верни первую частичку сокровища.',
    ach_secret_chest_t: 'Искательница сокровищ', ach_secret_chest_d: 'Открой тайный сундук.',
    ach_all_world_stars_t: 'Все звёздочки', ach_all_world_stars_d: 'Собери все звёздочки, которые лежат в мире.',
    ach_first_artifact_t: 'Первое сокровище', ach_first_artifact_d: 'Собери целый артефакт.',
    ach_three_secrets_t: 'Хранительница тайн', ach_three_secrets_d: 'Найди три тайны.',
    ach_first_task_t: 'Первый шаг', ach_first_task_d: 'Разгадай первое задание.',
    ach_try_again_t: 'Ещё раз — и получилось!', ach_try_again_d: 'Разгадай задание после неудачной попытки.',
    ach_all_skills_t: 'Всего понемножку', ach_all_skills_d: 'Попробуй задания каждого вида.',
    ach_fifty_tasks_t: 'Пятьдесят заданий', ach_fifty_tasks_d: 'Разгадай пятьдесят заданий.',
    ach_clean_ten_t: 'Десять подряд', ach_clean_ten_d: 'Разгадай десять заданий подряд с первой попытки.',
    ach_days_3_t: 'Три дня приключений', ach_days_3_d: 'Играй в три разных дня.',
    ach_days_5_t: 'Пять дней приключений', ach_days_5_d: 'Играй в пять разных дней.',
    // --- the cat's lines of the achievements' scenes, of the pet found and chosen (PLAY-08, PLAY-09): spoken
    ach_first_shard: 'Первая частичка дома! Волшебство уже возвращается.',
    ach_secret_chest: 'Ты нашла тайный сундук! Настоящая исследовательница!',
    ach_all_world_stars: 'Все звёздочки этого мира у тебя! Какой зоркий глаз!',
    ach_first_artifact: 'Первое сокровище вернулось домой! Ты настоящая Хранительница!',
    ach_three_secrets: 'Три тайны! Ты замечаешь то, чего не видят другие.',
    ach_first_task: 'Первое задание разгадано! Приключение начинается.',
    ach_try_again: 'Не вышло сразу, а ты попробовала ещё — и получилось!',
    ach_all_skills: 'Ты попробовала всё: и счёт, и загадки! Умничка!',
    ach_fifty_tasks: 'Пятьдесят заданий позади! Вот это старание!',
    ach_clean_ten: 'Десять заданий подряд с первой попытки! Невероятно!',
    ach_days_3: 'Мы вместе уже три дня! Мне с тобой весело.',
    ach_days_5: 'Пять дней приключений вместе! Ты моя лучшая подружка.',
    pet_found: 'Ой, оленёнок! Теперь он будет гулять с нами.',
    pet_chosen: 'Твой питомец идёт с нами!',
    // --- the cat's lines of the break and of the welcome of a new day (PLAY-20, PLAY-21): spoken
    break_1: 'Мы сегодня чудесно поиграли! Продолжим завтра?',
    break_2: 'Мои лапки немного устали. Может, отдохнём до завтра?',
    break_3: 'Всё, что мы нашли, сохранится. Продолжим завтра?',
    break_4: 'Какое хорошее приключение сегодня! Пора отдохнуть глазкам.',
    break_5: 'Мир подождёт нас до завтра. Отдохнём?',
    break_more_1: 'Хорошо! Ещё немножко поиграем вместе.',
    break_more_2: 'Ладно, я с тобой! Куда пойдём?',
    break_more_3: 'Отлично! Побежали дальше за искорками.',
    break_bye_1: 'До завтра! Я буду ждать тебя здесь.',
    break_bye_2: 'Отдыхай! Завтра нас ждут новые чудеса.',
    hello_1: 'Привет! Я так по тебе скучал!',
    hello_2: 'Ура, ты здесь! Мур-р, начинаем приключение!',
    hello_3: 'Здравствуй, Хранительница! Миры тебя ждут.',
    hello_4: 'Вот и ты! Мне столько нужно тебе показать!',
    hello_5: 'Мур! Как хорошо, что ты вернулась!',
    gift_star_1: 'А это тебе звёздочка — подарок на сегодня!',
    gift_star_2: 'Мур! Звёздочка для тебя — просто так!',
    left_new_world: 'Здесь живут новые друзья. Пойдём познакомимся!',
    left_mid_chain: 'Наш друг ждёт тебя. Бежим за искорками!',
    left_between: 'Одному другу мы уже помогли. Кто следующий?',
    left_before_final: 'Все частички уже у нас! Осталось собрать сокровище.',
    left_after_artifact: 'Наше сокровище сияет! Великому Древу уже лучше.',
    shelf_title: 'Волшебная полка', shelf_found: 'Сияет на полке', shelf_parts: '{n} из {of} {parts}',
    shelf_first: 'Это наша волшебная полка. Здесь засияют все пять сокровищ!',
    art_1: 'Кристалл света', art_2: 'Изумруд мудрости', art_3: 'Жемчужина глубин', art_4: 'Рубин радости', art_5: 'Звезда времени',
    parts_1: 'осколков',
    shelf_wait_1: 'Ждёт тебя в Королевстве фей', shelf_wait_2: 'Ждёт тебя в Зачарованном лесу',
    shelf_wait_3: 'Ждёт тебя в Подводном королевстве', shelf_wait_4: 'Ждёт тебя в Сладкой стране',
    shelf_wait_5: 'Ждёт тебя на Небесных островах',
    book_secrets_t: 'Тайны', book_secrets: 'Тайны этого мира: {n} из {of}', book_count: '{n} из {of}',
    book_pets: 'Мои любимцы', book_pet_pick: 'Коснись любимца, и он пойдёт с тобой.', book_pet_none: 'Любимцы ещё ждут тебя.',
    book_no_pet: 'Без любимца', pet_fawn: 'Оленёнок',
    // --- the four ready looks of the start screen (PLAY-06, src/game/looks.ts); not spoken
    looks: 'Образ', look_fairy: 'Фея', look_princess: 'Принцесса', look_elf: 'Эльфийка', look_witch: 'Волшебница',
    // --- the cat's offer of a break (PLAY-20): the buttons and the parents' rows (the lines are with the spoken ones)
    break_yes: 'До завтра 🌙', break_no: 'Ещё поиграю ▶',
    p_break: 'Перерыв в игре', p_break_hint: 'Через это время кот предложит продолжить завтра — после задания, не посреди него. Ребёнок может отказаться; тогда кот напомнит не раньше чем через 10 минут.',
    br10: '10 мин', br15: '15 мин', br20: '20 мин', br30: '30 мин', br_off: 'Выключено', gift_caption: 'Подарок дня: +1 ⭐',
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
/** Spoken lines kept apart from the game's table: the bank of the old game's clips (src/ui/strings-bank.ts, VOICE-07). */
export interface SpokenTable { table: Record<Lang, Record<string, string>>; spoken: Record<string, VoiceStyle> }
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
  // PLAY-08, PLAY-09, PLAY-07: the achievements' scenes, the pet, the shelf (batch 1 of stage 4)
  ach_first_shard: 'joy', ach_secret_chest: 'joy', ach_all_world_stars: 'joy', ach_first_artifact: 'joy', ach_three_secrets: 'joy', ach_first_task: 'joy', ach_try_again: 'joy', ach_all_skills: 'joy', ach_fifty_tasks: 'joy', ach_clean_ten: 'joy', ach_days_3: 'joy', ach_days_5: 'joy',
  pet_found: 'joy', pet_chosen: 'warm', shelf_first: 'warm',
  // PLAY-20, PLAY-21: the break and the welcome of a new day (batch 2 of stage 4)
  break_1: 'warm', break_2: 'calm', break_3: 'warm', break_4: 'calm', break_5: 'warm', break_more_1: 'warm', break_more_2: 'joy', break_more_3: 'joy', break_bye_1: 'warm', break_bye_2: 'warm',
  hello_1: 'joy', hello_2: 'joy', hello_3: 'warm', hello_4: 'joy', hello_5: 'joy', gift_star_1: 'joy', gift_star_2: 'joy', left_new_world: 'warm', left_mid_chain: 'warm', left_between: 'warm', left_before_final: 'joy', left_after_artifact: 'joy',
  npc_next: 'joy', npc_again: 'warm', go_next: 'warm', need_net: 'warm',
  t_count: 'warm', t_add: 'warm', t_sub: 'warm', t_compare_more: 'warm', t_compare_less: 'warm', t_pattern: 'warm', t_odd: 'warm',
  t_pairs: 'warm', t_order: 'warm', t_sort: 'warm', t_simon_watch: 'calm', t_simon_repeat: 'warm',
  h_count: 'warm', h_left: 'warm', h_compare: 'warm', h_pattern: 'warm', h_odd: 'warm', h_order: 'warm', h_sort: 'warm', h_simon: 'warm',
  t_missing: 'warm', t_house: 'warm', t_before: 'warm', t_after: 'warm', t_signs: 'warm', t_sort_two: 'warm',
  h1_count: 'warm', h1_ten: 'warm', h2_ten: 'warm', h1_add: 'warm', h1_add_cross: 'warm', h2_add_cross: 'warm', h1_sub: 'warm',
  h1_sub_cross: 'warm', h2_sub_cross: 'warm', h2_compare: 'warm', h1_compare_num: 'warm', h2_compare_num: 'warm', h1_signs: 'warm',
  h2_signs: 'warm', h2_order: 'warm', h1_neighbors: 'warm', h2_neighbors: 'warm', h1_missing: 'warm', h1_missing_ten: 'warm',
  h2_missing: 'warm', h1_house: 'warm', h2_house: 'warm', h2_pattern: 'warm', h1_pattern_grow: 'warm', h2_pattern_grow: 'warm',
  h1_pattern_two: 'warm', h2_pattern_two: 'warm', h1_simon: 'warm', h1_simon_long: 'warm', h1_odd_shape: 'warm', h1_odd_two: 'warm',
  h2_odd: 'warm', h2_sort: 'warm', h1_sort_two: 'warm', h2_sort_two: 'warm', h3_show: 'warm',
  shop_hi: 'warm', shop_more: 'warm', shop_bought: 'joy',
  // recorded by the old game (voice/qa.json `from`): one word is allowed here, the clip exists
  praise_0: 'joy', praise_1: 'joy', praise_3: 'joy', praise_4: 'joy', praise_5: 'joy', praise_6: 'joy', praise_7: 'joy',
  try_0: 'warm', try_1: 'warm', try_2: 'warm', tap_1: 'warm', tap_2: 'warm', tap_3: 'warm', tap_4: 'warm', tap_5: 'warm', tap_6: 'warm',
  tap_7: 'warm', tap_8: 'warm', tap_9: 'warm', tap_10: 'warm', tap_11: 'warm', tap_12: 'warm', tap_13: 'warm', tap_14: 'warm', tap_15: 'warm',
  tap_16: 'warm', tap_17: 'warm', tap_18: 'warm', tap_19: 'warm', tap_20: 'warm',
} as const satisfies Partial<Record<keyof typeof S.uk, VoiceStyle>>;
/** A spoken line of the shared table or of any world. */
export type SpokenKey = keyof typeof SPOKEN | WorldSpokenKey;
export { SPOKEN };
/** The praise, "try again" and the numbers 1-20 as keys of the list: the game picks one of these, never builds a key of its own. */
export const PRAISE = ['praise_0', 'praise_1', 'praise_3', 'praise_4', 'praise_5', 'praise_6', 'praise_7'] as const satisfies readonly SpokenKey[];
export const TRY = ['try_0', 'try_1', 'try_2'] as const satisfies readonly SpokenKey[];
const TAPS = ['tap_1', 'tap_2', 'tap_3', 'tap_4', 'tap_5', 'tap_6', 'tap_7', 'tap_8', 'tap_9', 'tap_10', 'tap_11', 'tap_12', 'tap_13', 'tap_14', 'tap_15',
  'tap_16', 'tap_17', 'tap_18', 'tap_19', 'tap_20'] as const satisfies readonly SpokenKey[];
/** The recorded number `n` (1-20); null for any other: no clip, and the synthesizer must not take it. */
export const tapKey = (n: number): SpokenKey | null => (Number.isInteger(n) ? TAPS[n - 1] ?? null : null);

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
 * What is sent for recording: every spoken line in Ukrainian with its intonation and its speaker, the shared ones in
 * the order of `SPOKEN`, then each world's in the order given and of its `spoken`, then the bank's
 * (src/ui/strings-bank.ts). A key two tables share is an error.
 *
 * The speaker is a character of a world's table "character - voice" (src/worlds/<id>/voices.ts, VOICE-10). Every
 * line is the narrator's under its own key, the name of its clip, which never changes. A line the table's `voiced`
 * gives to the characters is listed once more for every voice of a character that says it, as `<key>@<voice>`, with
 * the first such character of the table as its speaker. The whole game has at most five voices.
 *
 * The world of a line (TECH-09, R67): a line of the `spoken` of a world other than `first` - the world the installation
 * brings, DEFAULT_WORLD of src/worlds/index.ts - is that world's voice and carries the id of its world as a fourth
 * field, and so does each `<key>@<voice>` of it: its clips lie in `voice/<id>/` and tools/gen_voice.py names them
 * `<id>/<key>`. Every other row has three fields, as it always had, and its clip is the core's: the shared lines (also
 * in the voice of a character of any world, `npc_next@<voice>`), the first world's and the bank's.
 * The keys are one set for the whole game (R82): a key two tables share is an error, whichever worlds they are of.
 */
export type RecordingRow = [text: string, style: VoiceStyle, speaker: string] | [text: string, style: VoiceStyle, speaker: string, world: string];
export function recordingList(
  worlds: readonly WorldStrings[], bank: SpokenTable,
  casts: readonly { id: string; narrator: string; cast: Record<string, { emoji: string; voice: string }>; voiced: readonly string[] }[],
  first: string,
): Record<string, RecordingRow> {
  const list: Record<string, RecordingRow> = {};
  const keys = new Set(Object.keys(S.uk));
  const narrator = casts[0]?.narrator;
  if (!narrator) throw new Error('no table "character - voice" (src/worlds/<id>/voices.ts): nobody speaks the lines');
  const narratorVoice = casts[0].cast[narrator]?.voice;
  const voices = new Set<string>();
  for (const c of casts) {
    if (c.narrator !== narrator || c.cast[c.narrator]?.voice !== narratorVoice) {
      throw new Error(`the voices of world "${c.id}": every world has the narrator "${narrator}" with the voice ${narratorVoice}`);
    }
    for (const ch of Object.values(c.cast)) voices.add(ch.voice);
  }
  if (voices.size > 5) throw new Error(`the game has ${voices.size} voices, at most 5 with the narrator's: ${[...voices].join(', ')}`);
  /** `world`: the id of the next world the lines are the voice of; none for the lines whose clips are the core's. */
  const add = (owner: string, uk: Record<string, string>, spoken: Record<string, VoiceStyle>, world?: string) => {
    for (const [k, style] of Object.entries(spoken)) {
      if (own(k)) throw new Error(`"${k}" of ${owner} is the world's own text of a shared screen (WORLD_OWN): never spoken`);
      if (typeof uk[k] !== 'string') throw new Error(`spoken line "${k}" of ${owner} has no Ukrainian text`);
      list[k] = world === undefined ? [recordable(k, uk[k]), style, narrator] : [recordable(k, uk[k]), style, narrator, world];
    }
  };
  add('the shared strings', S.uk, SPOKEN);
  for (const w of worlds) {
    const twice = Object.keys(w.table.uk).filter((k) => !own(k) && keys.has(k));
    if (twice.length) throw new Error(`world "${w.id}": these strings already exist (one key, one clip): ${twice.join(', ')}`);
    for (const k of Object.keys(w.table.uk)) if (!own(k)) keys.add(k);
    add(`world "${w.id}"`, w.table.uk, w.spoken, w.id === first ? undefined : w.id);
  }
  const twice = Object.keys(bank.table.uk).filter((k) => keys.has(k));
  if (twice.length) throw new Error(`the bank: these strings already exist (one key, one clip): ${twice.join(', ')}`);
  add('the bank', bank.table.uk, bank.spoken);
  // The lines said in a voice of their own: key -> voice -> the first character of a table with that voice.
  const voiced = new Map<string, Map<string, string>>();
  for (const c of casts) {
    const world = worlds.find((w) => w.id === c.id);
    if (!world) throw new Error(`the voices of world "${c.id}": there is no such world`);
    const lines = (rule: string) => {
      const ks = rule.endsWith('*') ? Object.keys(list).filter((k) => k.startsWith(rule.slice(0, -1))) : [rule];
      if (ks.length === 0 || !ks.every((k) => Object.hasOwn(list, k))) throw new Error(`the voices of world "${c.id}": "${rule}" is no spoken line`);
      return ks;
    };
    // `!<key>` takes a line back from the rules before it (a line of the prefix the narrator says).
    const not = new Set(c.voiced.filter((r) => r.startsWith('!')).flatMap((r) => lines(r.slice(1))));
    for (const rule of c.voiced.filter((r) => !r.startsWith('!'))) {
      const shared = rule === 'own' ? [] : lines(rule).filter((k) => !not.has(k));
      for (const [who, ch] of Object.entries(c.cast)) {
        if (who === c.narrator) continue;
        for (const k of rule === 'own' ? Object.keys(world.spoken).filter((s) => s.startsWith(`${who}_`)) : shared) {
          const by = voiced.get(k) ?? new Map<string, string>();
          if (!by.has(ch.voice)) by.set(ch.voice, who);
          voiced.set(k, by);
        }
      }
    }
  }
  const out: Record<string, RecordingRow> = {};
  for (const [k, row] of Object.entries(list)) {
    out[k] = row;
    // A line in the voice of a character belongs where the line itself does: the world's voice, or the core's.
    const world = row[3];
    for (const [voice, who] of voiced.get(k) ?? []) if (voice !== narratorVoice) out[`${k}@${voice}`] = world === undefined ? [row[0], row[1], who] : [row[0], row[1], who, world];
  }
  return out;
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
