/**
 * The texts of the Enchanted Forest, the grey build (./index.ts, WORLD-12). The grey build speaks nothing of its own:
 * its conversations say the shared recorded lines; the forest's own lines (docs/worlds/world-2.md) are written and
 * recorded once the customer has taken the grey build.
 *
 * Only `import type` and `declare module` here: tools/sync_phrases.mjs loads this file in Node. Its keys start with
 * `forest_`: a key the shared strings already have is an error (`addStrings`, src/ui/strings.ts).
 */
import type { WorldStrings } from '../../ui/strings';

const uk = { subtitle: 'Зачарований ліс', forest_part: 'Листочок-смарагд!', forest_count: '{n} з 5', forest_nuts: 'Шукай горішки за слідами! 🌰 {n} з {of}', forest_maze: 'Йди стежкою, де візерунок триває! 🦔 {n} з {of}' };

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = { subtitle: 'Зачарованный лес', forest_part: 'Листочек-изумруд!', forest_count: '{n} из 5', forest_nuts: 'Ищи орешки по следам! 🌰 {n} из {of}', forest_maze: 'Иди по тропке, где узор продолжается! 🦔 {n} из {of}' };

export const strings = { id: 'forest', table: { uk, ru }, spoken: {} } satisfies WorldStrings;

declare module '../../ui/strings' {
  interface WorldTables { forest: typeof strings }
}
