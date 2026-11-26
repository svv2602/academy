/**
 * The texts of the hub, the Great Tree (./index.ts, docs/worlds/hub.md). It speaks four lines of its own: the cat's on
 * the tour (R34), its word with nothing new (./index.ts hubLeft) by a sleeping arch and as she takes the find of the day, their clips in voice/hub/ - part of the installation, precached with the core.
 *
 * Only `import type` and `declare module` here: tools/sync_phrases.mjs loads this file in Node. Its keys start with
 * `hub_`: a key the shared strings already have is an error (`addStrings`, src/ui/strings.ts).
 *
 * A world's words are found by their names, with no code of their own: hub_<world>_wake is said by its arch waking,
 * hub_<world>_home and hub_<world>_after as she comes in once that world is done (./index.ts `worldWord`). A line put
 * here for anything else must not have such a name - it would start to be said by itself.
 */
import type { WorldStrings } from '../../ui/strings';

const uk = { subtitle: 'Велике Дерево', hub_title: 'Велике Дерево', hub_count: '{n} з 5',
  // the cat on the tour of the first entry (./flyover-path.ts, R34)
  // the cat with nothing new in the hub: on a tap, and as she comes in (./index.ts hubLeft)
  hub_asleep: 'Інші світи ще сплять. Повернемося до фей?',
  // the cat by a sleeping arch (./index.ts, portals.ts sleepingToSpeakOf)
  hub_sleeping: 'Цей світ ще спить. Він прокинеться згодом!',
  // the cat as she takes a feather of the Great Tree's bird, the hub's find of the day (R38)
  hub_feather: 'Це перо птаха з Великого Дерева! Завтра тут знайдеться ще одне.',
  hub_tour: 'Це Велике Дерево! Світло Кристала вже тут. Але дивись: ще чотири гнізда порожні. Їхні світи поки сплять.',
  // the cat after the forest (docs/worlds/world-2.md, the draft of 2026-11-15): its portal awake, its Emerald home, the tree in bloom
  hub_forest_wake: 'Чуєш? Портал до лісу прокинувся! Біжи за іскорками.',
  hub_forest_home: 'Смарагд мудрості вдома! Дивись, на Дереві розквітли квіти.',
  hub_forest_after: 'Дерево стало веселішим. Світлячки прилетіли! А нас кличе новий портал.',
  // the cat after the sea (docs/worlds/world-3.md, the draft of 2026-11-18): its portal awake, its pearl home, the tree grown
  hub_sea_wake: 'Чуєш, як шумлять хвилі? Прокинувся портал до моря!',
  hub_sea_home: 'Перлина глибин удома! Дивись, ще одне гніздо засяяло.',
  hub_sea_after: 'Крона стала густішою, а біля коріння виросли грибочки!',
  // the cat after the Sweet Land (docs/worlds/world-4.md, the draft of 2026-11-18): its portal awake, its ruby home, the tree lit
  hub_sweet_wake: 'Чуєш, як пахне ваніллю? Прокинувся портал до Солодкої країни!',
  hub_sweet_home: 'Рубін радості вдома! Ще одне гніздо сяє.',
  hub_sweet_after: 'На гілках засвітилися плоди-ліхтарики, а пташки співають!',
  // the cat after the Sky Islands (docs/worlds/world-5.md, the draft of 2026-11-18): their portal awake, the Star of Time
  // home (the world's last line before the final chapter of the Tree, WORLD-06; no "after" line of its own)
  hub_sky_wake: 'Дивись угору! Прокинувся портал до Небесних островів!',
  hub_sky_home: 'Зірка часу вдома! Усі гнізда Дерева сяють.',
};

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = { subtitle: 'Великое Древо', hub_title: 'Великое Древо', hub_count: '{n} из 5',
  hub_asleep: 'Другие миры ещё спят. Вернёмся к феям?',
  hub_sleeping: 'Этот мир ещё спит. Он проснётся позже!',
  hub_feather: 'Это перо птицы с Великого Древа! Завтра здесь найдётся ещё одно.',
  hub_tour: 'Это Великое Древо! Свет Кристалла уже здесь. Но смотри: ещё четыре гнезда пустые. Их миры пока спят.',
  hub_forest_wake: 'Слышишь? Портал в лес проснулся! Беги за искорками.',
  hub_forest_home: 'Изумруд мудрости дома! Смотри, на Древе распустились цветы.',
  hub_forest_after: 'Древо повеселело. Светлячки прилетели! А нас зовёт новый портал.',
  hub_sea_wake: 'Слышишь, как шумят волны? Проснулся портал к морю!',
  hub_sea_home: 'Жемчужина глубин дома! Смотри, ещё одно гнездо засияло.',
  hub_sea_after: 'Крона стала гуще, а у корней выросли грибочки!',
  hub_sweet_wake: 'Чувствуешь, как пахнет ванилью? Проснулся портал в Сладкую страну!',
  hub_sweet_home: 'Рубин радости дома! Ещё одно гнездо сияет.',
  hub_sweet_after: 'На ветках засветились плоды-фонарики, а птицы поют!',
  hub_sky_wake: 'Смотри вверх! Проснулся портал к Небесным островам!',
  hub_sky_home: 'Звезда времени дома! Все гнёзда Древа сияют.',
};

export const strings = { id: 'hub', table: { uk, ru }, spoken: { hub_tour: 'joy', hub_feather: 'joy', hub_asleep: 'warm', hub_sleeping: 'warm', hub_forest_wake: 'joy', hub_forest_home: 'joy', hub_forest_after: 'warm', hub_sea_wake: 'joy', hub_sea_home: 'joy', hub_sea_after: 'warm', hub_sweet_wake: 'joy', hub_sweet_home: 'joy', hub_sweet_after: 'warm', hub_sky_wake: 'joy', hub_sky_home: 'joy' } } satisfies WorldStrings;

declare module '../../ui/strings' {
  interface WorldTables { hub: typeof strings }
}
