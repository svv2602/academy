/**
 * The mysterious stars, PLAY-24 (the rule; the stars in the world are ./mystery-stars.ts). A world names the places they may stand
 * (WorldDef.mystery); every day ten of them are taken, each with a colour that is the kind of its task: blue - an
 * addition, red - a subtraction, green - logic (a pattern or a comparison). The task is the planner's (the level of its
 * skill, the examples with mistakes, LEARN-11) with the hint in three rungs; solved, the star is hers with its stars
 * of the shop; closed, it stays where it is - no penalty. The next day: other places, other tasks.
 *
 * Which places and kinds a day has is drawn from the day and the world (the same all day, on every device), never from
 * the game's randomness: the tasks themselves are.
 */
import type { WorldState } from '../core/save';
import { createRng } from '../core/rng';

/** Stars a day in a world. */
export const MYSTERY_COUNT = 10;
/** Stars of the shop a solved one gives (the decision of 2026-11-19: the shop gets supplies and dearer things). */
export const MYSTERY_REWARD = 3;
/**
 * The star's body, m: the model's height (src/game/boot.ts loads it so), the scale it is drawn at, how high it floats
 * over the ground and how far it bobs up - a world that hides its stars hides this much (src/worlds/fairy/hiding.ts).
 */
export const MYSTERY_STAR = { model: 0.9, scale: 1.5, float: 0.8, bob: 0.18 } as const;
/** The fewest places a world names: fewer, and the places of one day would hardly differ from the day before's. */
export const MYSTERY_MIN_SPOTS = 20;

export type MysteryKind = 'blue' | 'red' | 'green';
export const MYSTERY_KINDS: readonly MysteryKind[] = ['blue', 'red', 'green'];
/** The colour of each kind, on the star and its sparks. */
export const MYSTERY_COLOR: Readonly<Record<MysteryKind, string>> = { blue: '#4fb3ff', red: '#ff4f6d', green: '#4fe07c' };
/** The steps a kind plays: the step is a task type or a skill step (src/game/tasks/index.ts `typeOf` gives the type of its level). */
export const MYSTERY_STEPS: Readonly<Record<MysteryKind, readonly ('add' | 'sub' | 'pattern' | 'compare')[]>> = {
  blue: ['add'], red: ['sub'], green: ['pattern', 'compare'],
};

/** A star of the day: the index of its place in the world's list, its kind and the step of its task. */
export interface MysteryStar { id: number; spot: number; kind: MysteryKind; step: 'add' | 'sub' | 'pattern' | 'compare' }

/**
 * What a world names (WorldDef.mystery): the places, and `showR` - m, the stars are drawn only while an unsolved one is
 * this near her (a world close to its budget of draw calls; absent: always, as in the first world).
 */
export interface MysteryDef { readonly spots: readonly { readonly x: number; readonly z: number }[]; readonly showR?: number }

/** What the save keeps of them in a world (`ws.mystery`): the day the stars are of and the ids solved on it. */
export interface MysteryState { day: string; solved: number[]; told?: boolean }

/**
 * The stars of `day` in world `worldId` of its `spots` places: MYSTERY_COUNT different places (all of them if fewer),
 * the kinds as even as can be (4 + 3 + 3) in an order of the day. The ids are 0..n-1 - the save keeps the solved ones.
 */
export function dailyStars(worldId: string, day: string, spots: number): MysteryStar[] {
  const rng = createRng(`mystery:${worldId}:${day}`);
  const order = Array.from({ length: spots }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const n = Math.min(MYSTERY_COUNT, spots), first = Math.floor(rng() * 3);
  return order.slice(0, n).map((spot, id) => {
    const kind = MYSTERY_KINDS[(first + id) % 3], steps = MYSTERY_STEPS[kind];
    return { id, spot, kind, step: steps[Math.floor(rng() * steps.length)] };
  });
}

/**
 * The state of the stars of `day` in `ws`: a new day (or a damaged state) starts it anew - nothing solved, the line of
 * the day not said yet. The same object is returned while the day lasts.
 */
export function mysteryOf(ws: WorldState, day: string): MysteryState {
  const m = ws.mystery;
  if (m && typeof m === 'object' && m.day === day && Array.isArray(m.solved)) return m;
  return (ws.mystery = { day, solved: [] });
}

/** What is wrong with a world's places: too few, or two of them closer than `gap` m (they would read as one). */
export function mysteryProblems(def: MysteryDef, gap = 6): string[] {
  const out: string[] = [];
  if (def.spots.length < MYSTERY_MIN_SPOTS) out.push(`${def.spots.length} places of the mysterious stars, not at least ${MYSTERY_MIN_SPOTS}`);
  def.spots.forEach((a, i) => def.spots.slice(i + 1).forEach((b, k) => {
    if (Math.hypot(a.x - b.x, a.z - b.z) < gap) out.push(`places ${i} and ${i + 1 + k} of the mysterious stars stand closer than ${gap} m`);
  }));
  return out;
}
