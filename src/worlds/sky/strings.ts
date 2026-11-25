/**
 * The texts of the Sky Islands, the grey build (./index.ts, WORLD-12). The grey build speaks nothing of its own: its
 * conversations say the shared recorded lines under the shared clips, as the Sweet Land's grey build did; the world's own
 * lines (docs/worlds/world-5.md, the draft taken on 2026-11-18) are written and recorded once the customer has taken the
 * grey build. Here: the world's subtitle, the buttons of the arch to the Tree and of the airship, the card of a ray, the
 * two places where a ray lies in the world, and the characters' names (the Ukrainian ones of the customer's decision
 * 2026-11-18, question 5; the parts of the Star are «промінчики», not «зірочки» - the stars are the game's reward).
 *
 * Only `import type` and `declare module` here: tools/sync_phrases.mjs loads this file in Node. Its keys start with
 * `sky_`: a key the shared strings already have is an error (`addStrings`, src/ui/strings.ts).
 */
import type { WorldStrings } from '../../ui/strings';

const uk = {
  subtitle: 'Небесні острови', sky_to_tree: 'До Дерева', sky_part: 'Промінчик Зірки!', sky_count: '{n} з 5',
  sky_clock: 'Годинник', sky_flowers: 'Квіти', sky_ship: 'На корабель', sky_ship_back: 'До причалу',
  // the cloud bridge (WORLD-25): the bubble on the way to the gap, under the recorded question of addition
  sky_bridge_way: 'До хмаринок на мосту до дракона!',
  // the observatory's clock (WORLD-24): the bubble on the way (the gears found so far), the action button by a gear
  sky_clock_way: 'Шестерні для годинника: {n} з 3', sky_gear: 'Шестерня',
  // the route of the winds (WORLD-23): the bubble on the way to the map's table and over it
  sky_winds_way: 'Проклади кораблику шлях вітрами до островка!',
  // the characters' names (not spoken: the grey build's figures carry no line of their own yet)
  sky_name_lazur: 'Лазур', sky_name_gromykhalo: 'Громихало', sky_name_mertsal: 'Мерехтій', sky_name_veterok: 'Вітерець', sky_name_chirika: 'Цвірінька',
};

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = {
  subtitle: 'Небесные острова', sky_to_tree: 'К Древу', sky_part: 'Лучик Звезды!', sky_count: '{n} из 5',
  sky_clock: 'Часы', sky_flowers: 'Цветы', sky_ship: 'На корабль', sky_ship_back: 'К причалу',
  sky_bridge_way: 'К облачкам на мосту к дракону!',
  sky_clock_way: 'Шестерёнки для часов: {n} из 3', sky_gear: 'Шестерёнка',
  sky_winds_way: 'Проложи кораблику путь ветрами к островку!',
  sky_name_lazur: 'Лазурь', sky_name_gromykhalo: 'Громыхало', sky_name_mertsal: 'Мерцал', sky_name_veterok: 'Ветерок', sky_name_chirika: 'Чирика',
};

export const strings = { id: 'sky', table: { uk, ru }, spoken: {} } satisfies WorldStrings;

declare module '../../ui/strings' {
  interface WorldTables { sky: typeof strings }
}
