/**
 * The texts of the hub, the Great Tree (./index.ts, docs/worlds/hub.md). The grey build (WORLD-12) speaks nothing of
 * its own: its tour is silent, and its lines are written and recorded once the customer has taken the grey build
 * (R14, R34: one line of the cat on the tour, in voice/hub/).
 *
 * Only `import type` and `declare module` here: tools/sync_phrases.mjs loads this file in Node. Its keys start with
 * `hub_`: a key the shared strings already have is an error (`addStrings`, src/ui/strings.ts).
 */
import type { WorldStrings } from '../../ui/strings';

const uk = { subtitle: 'Велике Дерево', hub_title: 'Велике Дерево', hub_count: '{n} з 5' };

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = { subtitle: 'Великое Древо', hub_title: 'Великое Древо', hub_count: '{n} из 5' };

export const strings = { id: 'hub', table: { uk, ru }, spoken: {} } satisfies WorldStrings;

declare module '../../ui/strings' {
  interface WorldTables { hub: typeof strings }
}
