/**
 * The texts of the hub, the Great Tree (./index.ts, docs/worlds/hub.md). It speaks one line of its own: the cat's on
 * the tour (R34), its clip in voice/hub/ - part of the installation, precached with the core.
 *
 * Only `import type` and `declare module` here: tools/sync_phrases.mjs loads this file in Node. Its keys start with
 * `hub_`: a key the shared strings already have is an error (`addStrings`, src/ui/strings.ts).
 */
import type { WorldStrings } from '../../ui/strings';

const uk = { subtitle: 'Велике Дерево', hub_title: 'Велике Дерево', hub_count: '{n} з 5',
  // the cat on the tour of the first entry (./flyover-path.ts, R34)
  hub_tour: 'Це Велике Дерево! Світло Кристала вже тут. Але дивись: ще чотири гнізда порожні. Їхні світи поки сплять.',
};

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = { subtitle: 'Великое Древо', hub_title: 'Великое Древо', hub_count: '{n} из 5',
  hub_tour: 'Это Великое Древо! Свет Кристалла уже здесь. Но смотри: ещё четыре гнезда пустые. Их миры пока спят.',
};

export const strings = { id: 'hub', table: { uk, ru }, spoken: { hub_tour: 'joy' } } satisfies WorldStrings;

declare module '../../ui/strings' {
  interface WorldTables { hub: typeof strings }
}
