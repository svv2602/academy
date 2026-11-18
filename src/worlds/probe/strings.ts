/**
 * The texts of the probe world (./index.ts): a test world, never part of the published game. It has one spoken line of
 * its own, the greeting of its character (`probe_hi`): what the voice of a next world is tried on - a clip in the
 * folder of its world (worlds-test/probe/voice/probe/), listed in ./clips.json. The line has the text and the
 * intonation of the shared line `h_count`, and its clip is a copy of that line's clip: nothing was recorded for it
 * (worlds-test/probe/README.md). The rest of its conversation says the shared recorded lines.
 *
 * Only `import type` and `declare module` here: tools/sync_phrases.mjs loads this file in Node. Its keys start with
 * `probe_`: a key the shared strings already have is an error (`addStrings`, src/ui/strings.ts).
 */
import type { WorldStrings } from '../../ui/strings';

const uk = { subtitle: 'Пробний світ', probe_hi: 'Порахуймо разом!', probe_part: 'Перевірку пройдено!', probe_count: '{n} з 2', probe_look: 'Подивитися' };

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = { subtitle: 'Пробный мир', probe_hi: 'Посчитаем вместе!', probe_part: 'Проверка пройдена!', probe_count: '{n} из 2', probe_look: 'Посмотреть' };

export const strings = { id: 'probe', table: { uk, ru }, spoken: { probe_hi: 'warm' } } satisfies WorldStrings;

declare module '../../ui/strings' {
  interface WorldTables { probe: typeof strings }
}
