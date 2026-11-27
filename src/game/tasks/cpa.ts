/**
 * The steps «things → picture → numbers» (CPA) of the number tasks (the customer's word of 2026-11-27: «да, делаем
 * всё»; plan idea/proposal/cpa-steps-2026-11-27): the same task drawn three ways. Step 1 - the things as they always
 * were; step 2 - a picture that does not give the answer away (the things taken stay coloured until the answer); step 3
 * - the numbers, the things only after the answer or in a hint. The hint ladder (LEARN-10) shows the things at every
 * step. The level of the task (LEARN-15) is another axis: a step never changes the numbers.
 *
 * The step is the world's (CPA of src/core/tuning.ts), one lower while the child's level of the skill is CPA_LOW or
 * under. The world and the save come by `setCpaWorld` (src/game/start.ts), as the puzzle's frames do; a show asks
 * `cpaOf` once, as it draws a task. `cpaHold` (?debug, the walkthrough) fixes the step whatever the world.
 */
import { CPA, CPA_LOW } from '../../core/tuning';

export type Cpa = 1 | 2 | 3;
/** The task types that are drawn by steps. */
export const CPA_TYPES = ['sub', 'add', 'count', 'compare', 'neighbors', 'missing'] as const;
export type CpaType = (typeof CPA_TYPES)[number];

/** The step of the world `world`; the hub (or any world not in CPA) - the highest step of the worlds she has been in. */
export function worldCpa(world: string, visited: readonly string[] = []): Cpa {
  const own = CPA[world];
  if (own) return own;
  return visited.reduce<Cpa>((best, w) => (CPA[w] && CPA[w] > best ? CPA[w] : best), 1);
}

/** The step of a task in `world` for a child at `level` of its skill: one lower at CPA_LOW or under, never below 1. */
export function cpaFor(world: string, level: number, visited: readonly string[] = []): Cpa {
  const step = worldCpa(world, visited);
  return (level <= CPA_LOW && step > 1 ? step - 1 : step) as Cpa;
}

/** The walkthrough's lever (?debug, src/game/debug.ts): a step for every task, whatever the world; null - the world's. */
export const cpaHold: { step: Cpa | null } = { step: null };

let worldOf: () => string = () => 'fairy';
let visitedOf: () => readonly string[] = () => [];
/** The world played and the worlds she has been in (src/game/start.ts); gives back the defaults. */
export function setCpaWorld(world: () => string, visited: () => readonly string[]): () => void {
  worldOf = world; visitedOf = visited;
  return () => { worldOf = () => 'fairy'; visitedOf = () => []; };
}

/** The step to draw a task of `level` at now: the lever, else the world's for that level. */
export const cpaOf = (level: number): Cpa => cpaHold.step ?? cpaFor(worldOf(), level, visitedOf());
