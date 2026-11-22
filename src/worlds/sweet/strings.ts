/**
 * The texts of the Sweet Land, the grey build (./index.ts, WORLD-12). The grey build speaks nothing of its own: its
 * conversations say the shared recorded lines under the shared clips, as the forest's grey build did; the world's own
 * lines (docs/worlds/world-4.md, the draft taken on 2026-11-18) are written and recorded once the customer has taken the
 * grey build. Here: the world's subtitle, the button of the arch to the Tree, the card of a ruby, the two places where a
 * ruby lies in the world, and the characters' names (the Ukrainian ones of the customer's decision 2026-11-18, question 6).
 *
 * Only `import type` and `declare module` here: tools/sync_phrases.mjs loads this file in Node. Its keys start with
 * `sweet_`: a key the shared strings already have is an error (`addStrings`, src/ui/strings.ts).
 */
import type { WorldStrings } from '../../ui/strings';

const uk = {
  subtitle: 'Солодка країна', sweet_to_tree: 'До Дерева', sweet_part: 'Рубін-льодяник!', sweet_count: '{n} з 5',
  sweet_house: 'Будиночок', sweet_millstone: 'Жорно',
  // the characters' names (not spoken: the grey build's figures carry no line of their own yet)
  sweet_name_pastila: 'Пастила', sweet_name_imbir: 'Імбир', sweet_name_tyanuchka: 'Тягучка', sweet_name_kakao: 'Какао', sweet_name_polosatik: 'Смугастик',
};

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = {
  subtitle: 'Сладкая страна', sweet_to_tree: 'К Древу', sweet_part: 'Рубин-леденец!', sweet_count: '{n} из 5',
  sweet_house: 'Домик', sweet_millstone: 'Жернов',
  sweet_name_pastila: 'Пастила', sweet_name_imbir: 'Имбирь', sweet_name_tyanuchka: 'Тянучка', sweet_name_kakao: 'Какао', sweet_name_polosatik: 'Полосатик',
};

export const strings = { id: 'sweet', table: { uk, ru }, spoken: {} } satisfies WorldStrings;

declare module '../../ui/strings' {
  interface WorldTables { sweet: typeof strings }
}
