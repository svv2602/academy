/**
 * The texts of the Sweet Land, the grey build (./index.ts, WORLD-12). The grey build speaks nothing of its own: its
 * conversations say the shared recorded lines under the shared clips, as the forest's grey build did; the world's own
 * lines (docs/worlds/world-4.md, the draft taken on 2026-11-18) are written and recorded once the customer has taken the
 * grey build. Here: the world's subtitle, the button of the arch to the Tree, the button of the lemonade fountain (a secret), the card of a ruby, the two places where a
 * ruby lies in the world, the subtitle on the way to the gingerbread house, the subtitles of the scales' questions, the subtitles of the shape bridge (on the way, and the rule the miller names), and the characters' names (the Ukrainian ones of the customer's decision 2026-11-18, question 6).
 *
 * Only `import type` and `declare module` here: tools/sync_phrases.mjs loads this file in Node. Its keys start with
 * `sweet_`: a key the shared strings already have is an error (`addStrings`, src/ui/strings.ts).
 */
import type { WorldStrings } from '../../ui/strings';

const uk = {
  subtitle: 'Солодка країна', sweet_to_tree: 'До Дерева', sweet_part: 'Рубін-льодяник!', sweet_count: '{n} з 5',
  sweet_house: 'Будиночок', sweet_millstone: 'Жорно',
  // the button of the lemonade fountain on the square (a secret, ./secrets.ts): not spoken
  sweet_lemonade: 'Лимонад',
  // the subtitle on the way to Imbir's house (WORLD-21, ./house.ts): under the recorded "let's put it together"
  sweet_house_way: 'Збери будиночок Імбиря: кожну деталь — на її місце.',
  // the subtitles of Tyanuchka's scales (WORLD-22, ./scales.ts): under the recorded questions of the panel
  sweet_scales_ask: 'Постав гирю-льодяник, щоб терези врівноважилися.',
  sweet_scales_sign: 'Яка чаша важча? Постав знак: більше, менше чи дорівнює.',
  // the subtitles of Kakao's shape bridge (WORLD-20, ./bridge.ts): on the way to the river, and the rule he names, under
  // the recorded "let's find together those that are alike" (the eight recorded questions of the bridge are not in the game
  // yet). A rule's text keeps to two lines of the bubble on a phone held sideways: a third line covered the new deck's places
  // (the pictures of 2026-11-23)
  sweet_bridge_way: 'Біжи до річки: Какао будує фігурний місток.',
  sweet_bridge_circle: 'Тільки круги! Торкайся плиток-кругів.',
  sweet_bridge_square: 'Тільки квадрати! Торкайся плиток-квадратів.',
  sweet_bridge_triangle: 'Тільки трикутники! Торкайся плиток-трикутників.',
  sweet_bridge_rect: 'Тільки прямокутники! Торкайся плиток-прямокутників.',
  sweet_bridge_oval: 'Тільки овали! Торкайся плиток-овалів.',
  sweet_bridge_rhombus: 'Тільки ромби! Торкайся плиток-ромбів.',
  sweet_bridge_corners3: 'Тільки ті, у кого три кути! Торкайся їх.',
  sweet_bridge_roundNotRed: 'Круглі, але не червоні! Торкайся таких плиток.',
  sweet_bridge_cornersNotBlue: 'З кутиками, але не сині! Торкайся таких плиток.',
  // the characters' names (not spoken: the grey build's figures carry no line of their own yet)
  sweet_name_pastila: 'Пастила', sweet_name_imbir: 'Імбир', sweet_name_tyanuchka: 'Тягучка', sweet_name_kakao: 'Какао', sweet_name_polosatik: 'Смугастик',
};

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = {
  subtitle: 'Сладкая страна', sweet_to_tree: 'К Древу', sweet_part: 'Рубин-леденец!', sweet_count: '{n} из 5',
  sweet_house: 'Домик', sweet_millstone: 'Жернов',
  sweet_lemonade: 'Лимонад',
  sweet_house_way: 'Собери домик Имбиря: каждую деталь — на её место.',
  sweet_scales_ask: 'Поставь гирю-леденец, чтобы весы уравновесились.',
  sweet_scales_sign: 'Какая чаша тяжелее? Поставь знак: больше, меньше или равно.',
  sweet_bridge_way: 'Беги к реке: Какао строит фигурный мостик.',
  sweet_bridge_circle: 'Только круги! Касайся плиток-кругов.',
  sweet_bridge_square: 'Только квадраты! Касайся плиток-квадратов.',
  sweet_bridge_triangle: 'Только треугольники! Касайся плиток-треугольников.',
  sweet_bridge_rect: 'Только прямоугольники! Касайся плиток-прямоугольников.',
  sweet_bridge_oval: 'Только овалы! Касайся плиток-овалов.',
  sweet_bridge_rhombus: 'Только ромбы! Касайся плиток-ромбов.',
  sweet_bridge_corners3: 'Только те, у кого три угла! Касайся их.',
  sweet_bridge_roundNotRed: 'Круглые, но не красные! Касайся таких плиток.',
  sweet_bridge_cornersNotBlue: 'С уголками, но не синие! Касайся таких плиток.',
  sweet_name_pastila: 'Пастила', sweet_name_imbir: 'Имбирь', sweet_name_tyanuchka: 'Тянучка', sweet_name_kakao: 'Какао', sweet_name_polosatik: 'Полосатик',
};

export const strings = { id: 'sweet', table: { uk, ru }, spoken: {} } satisfies WorldStrings;

declare module '../../ui/strings' {
  interface WorldTables { sweet: typeof strings }
}
