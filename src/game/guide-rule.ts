/**
 * When the cat's sparkles show (src/game/guide.ts, the customer's word of 2026-11-27): the rule of the fading by world,
 * the help asked by a tap on the cat and the parent's choice. Pure: no Three.js, no page.
 */
import type { HintsChoice, Save, WorldState } from '../core/save';
import { GUIDE } from '../core/tuning';

/** The parent's choice (Save.hints, the parents' section): as the world has it, always, or only when asked by a tap on the cat. */
export type { HintsChoice };
/** What the guide draws: the beam and the whole trail, a short flash towards the goal, or nothing. */
export type GuideShow = 'trail' | 'flash' | null;

/** How the world `id` fades its sparkles: `trail` (always) unless GUIDE.worlds names it. */
export const guideOf = (id: string): { mode: 'trail' | 'idle' | 'flash'; idleS: number } => GUIDE.worlds[id] ?? { mode: 'trail', idleS: 0 };

/**
 * What shows now in the world `world`: `quiet` - seconds of game time with no progress, `asked` - a tap on the cat
 * asked for the way and its time is not over, `choice` - the parent's.
 */
export function guideShows(world: string, quiet: number, asked: boolean, choice: HintsChoice = 'world'): GuideShow {
  if (asked || choice === 'always') return 'trail';
  if (choice === 'asked') return null;
  const { mode, idleS } = guideOf(world);
  if (mode === 'trail') return 'trail';
  if (quiet < idleS) return null;
  if (mode === 'idle') return 'trail';
  return (quiet - idleS) % GUIDE.flashEveryS < GUIDE.flashS ? 'flash' : null;
}

/**
 * The progress of the game as one number that only grows while she plays on: the tasks of every skill recorded, the
 * steps of the chains of the world, its finds, its flags set (secrets, items done, scenes). Any change is progress.
 */
export function progressOf(save: Pick<Save, 'skills'>, ws: Pick<WorldState, 'quests' | 'flags'> & { found?: number[] }): number {
  let n = 0;
  for (const k of Object.values(save.skills)) n += k?.tasks ?? 0;
  for (const q of Object.values(ws.quests ?? {})) n += typeof q === 'number' ? q : 0;
  n += ws.found?.length ?? 0;
  for (const f of Object.values(ws.flags ?? {})) if (f === true) n++;
  return n;
}

/**
 * What the guide shows and why (?debug, the walkthrough): `show` now, `quiet` - seconds with no progress in this world,
 * `asked` - a tap on the cat asked for the way (`ask()`), `choice` - the parent's. Here, not in ./guide.ts, so the
 * heroine's taps and the debug part read it without the guide's textures.
 */
export const guideState: { show: GuideShow; quiet: number; asked: boolean; choice: HintsChoice; ask(): void } = {
  show: null, quiet: 0, asked: false, choice: 'world',
  ask() { askedAt = -2; },
};
/** The time a tap on the cat asked for the way: -1 none, -2 asked and not yet seen by a frame. */
let askedAt = -1;
/** The time of the last ask, a fresh one stamped with `time` (the guide's frame). */
export function askedTime(time: number): number {
  if (askedAt === -2) askedAt = time;
  return askedAt;
}
