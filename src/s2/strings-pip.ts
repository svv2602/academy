/**
 * The texts of Pip in the hub and the worlds 1-2 (his meeting, his requests, the pieces of his map) - Season 2, step 2, part G (idea/proposal/season2-step2-plan-2026-11-27).
 * Empty until that part writes them; src/main.ts adds them to the shared table (`addStrings`).
 *
 * Only `import type` and `declare module` here, like a world's strings.ts (tools/sync_phrases.mjs loads those in Node).
 * Its keys start with `pip_`: a key the shared strings or another table already have is an error (`addStrings`).
 * Every line has both texts, Ukrainian and Russian (R31): `ru` has exactly the keys of `uk`.
 */
import type { PartStrings } from '../ui/strings';

const uk = {} satisfies Record<string, string>;

// Exactly the keys of uk: a missing translation or a key of one language only fails `tsc` right here.
const ru: Record<keyof typeof uk, string> = {};

export const strings = { id: 's2-pip', table: { uk, ru }, spoken: {} } satisfies PartStrings;

declare module '../ui/strings' {
  interface WorldTables { 's2-pip': typeof strings }
}
