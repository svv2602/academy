/**
 * The texts of the hub, the Great Tree (./index.ts, docs/worlds/hub.md). It speaks three lines of its own: the cat's on
 * the tour (R34), its word with nothing new (./index.ts hubLeft) and by a sleeping arch, their clips in voice/hub/ - part of the installation, precached with the core.
 *
 * Only `import type` and `declare module` here: tools/sync_phrases.mjs loads this file in Node. Its keys start with
 * `hub_`: a key the shared strings already have is an error (`addStrings`, src/ui/strings.ts).
 */
import type { WorldStrings } from '../../ui/strings';

const uk = { subtitle: 'Велике Дерево', hub_title: 'Велике Дерево', hub_count: '{n} з 5',
  // the cat on the tour of the first entry (./flyover-path.ts, R34)
  // the cat with nothing new in the hub: on a tap, and as she comes in (./index.ts hubLeft)
  hub_asleep: 'Інші світи ще сплять. Повернемося до фей?',
  // the cat by a sleeping arch (./index.ts, portals.ts sleepingToSpeakOf)
  hub_sleeping: 'Цей світ ще спить. Він прокинеться згодом!',
  hub_tour: 'Це Велике Дерево! Світло Кристала вже тут. Але дивись: ще чотири гнізда порожні. Їхні світи поки сплять.',
};

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = { subtitle: 'Великое Древо', hub_title: 'Великое Древо', hub_count: '{n} из 5',
  hub_asleep: 'Другие миры ещё спят. Вернёмся к феям?',
  hub_sleeping: 'Этот мир ещё спит. Он проснётся позже!',
  hub_tour: 'Это Великое Древо! Свет Кристалла уже здесь. Но смотри: ещё четыре гнезда пустые. Их миры пока спят.',
};

export const strings = { id: 'hub', table: { uk, ru }, spoken: { hub_tour: 'joy', hub_asleep: 'warm', hub_sleeping: 'warm' } } satisfies WorldStrings;

declare module '../../ui/strings' {
  interface WorldTables { hub: typeof strings }
}
