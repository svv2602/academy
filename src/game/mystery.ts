/**
 * The mysterious stars, PLAY-24 (the rule; the stars in the world are ./mystery-stars.ts). A world names the places they may stand
 * (WorldDef.mystery); every day ten of them are taken, each with a colour that is the kind of its task: blue - an
 * addition, red - a subtraction, green - logic (a pattern or a comparison). The task is the planner's (the level of its
 * skill, the examples with mistakes, LEARN-11) with the hint in three rungs; solved, the star is hers with its stars
 * of the shop; closed, it stays where it is - no penalty. The next day: other places, other tasks.
 * Once she has met Pip, and while the parent has English on, three of the ten are golden - a word of English (Season 2,
 * step 2, part I; layout §4.5): the colour of a star is the subject of its task, so the subjects alternate by the set
 * of the day - 3 blue, 2 red, 2 green, 3 golden. Before the meeting, and with English off, the day is as it always was.
 *
 * Which places and kinds a day has is drawn from the day and the world (the same all day, on every device), never from
 * the game's randomness: the tasks themselves are.
 */
import type { Save, WorldState } from '../core/save';
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

export type MysteryKind = 'blue' | 'red' | 'green' | 'gold';
/** The kinds of a day without golden stars, taken in turn: as even as can be. */
export const MYSTERY_KINDS: readonly MysteryKind[] = ['blue', 'red', 'green'];
/** The kinds of a day with golden stars (layout §4.5): 3 blue, 2 red, 2 green and 3 golden, in an order of the day. */
export const MYSTERY_GOLD_SET: readonly MysteryKind[] = ['blue', 'blue', 'blue', 'red', 'red', 'green', 'green', 'gold', 'gold', 'gold'];
/** The colour of each kind, on the star and its sparks; the gold of English is that of the diamond over Pip. */
export const MYSTERY_COLOR: Readonly<Record<MysteryKind, string>> = { blue: '#4fb3ff', red: '#ff4f6d', green: '#4fe07c', gold: '#ffd54a' };
/** A step a star may play: a task type or a skill step (src/game/tasks/index.ts `typeOf` gives the type of its level). */
export type MysteryStep = 'add' | 'sub' | 'pattern' | 'compare' | 'en_tap' | 'en_count';
/**
 * The steps a kind plays. A golden star: a word to find or things to count in English - both train the English words
 * (the phrases have no task of the panel in step 2: once they have, the weaker of the two skills is to be taken).
 */
export const MYSTERY_STEPS: Readonly<Record<MysteryKind, readonly MysteryStep[]>> = {
  blue: ['add'], red: ['sub'], green: ['pattern', 'compare'], gold: ['en_tap', 'en_count'],
};

/** A star of the day: the index of its place in the world's list, its kind and the step of its task. */
export interface MysteryStar { id: number; spot: number; kind: MysteryKind; step: MysteryStep }

/** Whether the days have golden stars for this save: Pip is met and the parent has English on (layout §4.4-4.5). */
export const goldStars = (save: Pick<Save, 'pip' | 'english'>): boolean => save.pip.met === true && save.english !== false;

/** What a world names (WorldDef.mystery). */
export interface MysteryDef { readonly spots: readonly { readonly x: number; readonly z: number }[] }

/** What the save keeps of them in a world (`ws.mystery`): the day the stars are of and the ids solved on it. */
export interface MysteryState { day: string; solved: number[]; told?: boolean }

/**
 * The stars of `day` in world `worldId` of its `spots` places: MYSTERY_COUNT different places (all of them if fewer),
 * the kinds as even as can be (4 + 3 + 3) in an order of the day. The ids are 0..n-1 - the save keeps the solved ones.
 * `gold` (`goldStars` of the save): the kinds are the set with golden stars, in an order of the day; the places are
 * the same ten either way - the day she meets Pip no star moves, some turn golden.
 */
export function dailyStars(worldId: string, day: string, spots: number, gold = false): MysteryStar[] {
  const rng = createRng(`mystery:${worldId}:${day}`);
  const order = Array.from({ length: spots }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const n = Math.min(MYSTERY_COUNT, spots);
  let kindOf: (id: number) => MysteryKind;
  if (gold) {
    const set = [...MYSTERY_GOLD_SET];
    for (let i = set.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [set[i], set[j]] = [set[j], set[i]];
    }
    kindOf = (id) => set[id % set.length];
  } else {
    const first = Math.floor(rng() * 3);
    kindOf = (id) => MYSTERY_KINDS[(first + id) % 3];
  }
  return order.slice(0, n).map((spot, id) => {
    const kind = kindOf(id), steps = MYSTERY_STEPS[kind];
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
