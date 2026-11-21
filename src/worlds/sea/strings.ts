/**
 * The texts of the Underwater Kingdom, the grey build (./index.ts, WORLD-12). The grey build speaks nothing of its own:
 * its conversations say the shared recorded lines; the sea's own lines (docs/worlds/world-3.md, the draft taken on
 * 2026-11-18) are written and recorded once the customer has taken the grey build.
 *
 * Only `import type` and `declare module` here: tools/sync_phrases.mjs loads this file in Node. Its keys start with
 * `sea_`: a key the shared strings already have is an error (`addStrings`, src/ui/strings.ts).
 */
import type { WorldStrings } from '../../ui/strings';

const uk = { subtitle: 'Підводне королівство', sea_part: 'Перлинка!', sea_count: '{n} з 5', sea_cabin: 'Каюта', sea_lock: 'Пливи до воріт замку! 🐚' };

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = { subtitle: 'Подводное королевство', sea_part: 'Жемчужинка!', sea_count: '{n} из 5', sea_cabin: 'Каюта', sea_lock: 'Плыви к воротам замка! 🐚' };

export const strings = { id: 'sea', table: { uk, ru }, spoken: {} } satisfies WorldStrings;

declare module '../../ui/strings' {
  interface WorldTables { sea: typeof strings }
}
