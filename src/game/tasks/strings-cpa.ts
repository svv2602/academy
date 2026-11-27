/**
 * The texts of the steps «things → picture → numbers» (src/game/tasks/cpa.ts): on the screen only, never spoken (the
 * question is the bank's clip as before). Their own module (the lead's word of 2026-11-27), added by src/main.ts with
 * `addStrings` like the parts' of Season 2; keys start with `cpa_`. Only `import type` and `declare module` here.
 */
import type { PartStrings } from '../../ui/strings';

const uk = {
  cpa_sub: 'Було {n}, {k} забрали',
  cpa_again: 'Ще раз',
} satisfies Record<string, string>;

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = {
  cpa_sub: 'Было {n}, {k} забрали',
  cpa_again: 'Ещё раз',
};

export const strings = { id: 'cpa', table: { uk, ru }, spoken: {} } satisfies PartStrings;

declare module '../../ui/strings' {
  interface WorldTables { cpa: typeof strings }
}
