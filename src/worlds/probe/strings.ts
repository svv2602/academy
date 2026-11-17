/**
 * The texts of the probe world (./index.ts): a test world, never part of the published game. It has no spoken line of
 * its own - its conversation says the shared recorded ones - so nothing of it is ever recorded.
 *
 * Only `import type` and `declare module` here: tools/sync_phrases.mjs loads this file in Node. Its keys start with
 * `probe_`: a key the shared strings already have is an error (`addStrings`, src/ui/strings.ts).
 */
import type { WorldStrings } from '../../ui/strings';

const uk = { subtitle: 'Пробний світ', probe_part: 'Перевірку пройдено!', probe_count: '{n} з 1' };

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = { subtitle: 'Пробный мир', probe_part: 'Проверка пройдена!', probe_count: '{n} из 1' };

export const strings = { id: 'probe', table: { uk, ru }, spoken: {} } satisfies WorldStrings;

declare module '../../ui/strings' {
  interface WorldTables { probe: typeof strings }
}
