/**
 * The collections (PLAY-25, the rule; the things in the world: ./collect-items.ts). A world lays out sets of small finds
 * (butterflies, acorns, mushrooms, feathers...): each find gives a star, a whole set five more and its row in the book,
 * every set of a world - the achievement `collector`. A find is taken one of six ways - run into it, jump for it, jump
 * for it only with the jumping potion, jump up onto what it lies on, touch it on the screen, catch it up - and never
 * by bending down (the decision of 2026-11-20).
 *
 * What is found is kept in the world's part of the save: `ws.found`, the numbers of the finds in `CollectDef.items`
 * (an optional field, no new version). Nothing here is random: the same world lays out the same finds every time.
 */
import type { WorldState } from '../core/save';
import { HERO_TOP } from './hero';

/** The kinds of finds the worlds may lay out (a catalog like the pets'), with the picture of the book. */
export const COLLECT_KINDS = {
  butterfly: { icon: '🦋', color: '#c77dff' },
  acorn: { icon: '🌰', color: '#d8953f' },
  mushroom: { icon: '🍄', color: '#ff5f7e' },
  feather: { icon: '🪶', color: '#7fb8ff' },
  /** the feathers of the Great Tree's bird, the hub's find of the day (src/worlds/hub/feathers.ts) */
  treefeather: { icon: '✨', color: '#ffc94a' },
} as const;
export type CollectKind = keyof typeof COLLECT_KINDS;

/**
 * How a find is taken:
 * - `run` - it lies low: she walks into it;
 * - `jump` - it hangs above her reach standing, within her reach in a jump;
 * - `potion` - above the reach of a jump, even a giant's, within the reach of a jump with the jumping potion;
 * - `hop` - it lies on top of a support (a stump, a flat stone): she has to stand up there;
 * - `tap` - out of her way (on the water): a touch on the screen within TAP_R of her;
 * - `chase` - a butterfly that flies off round its place while she is near: she catches it up.
 */
export type CollectWay = 'run' | 'jump' | 'potion' | 'hop' | 'tap' | 'chase';
export const COLLECT_WAYS: readonly CollectWay[] = ['run', 'jump', 'potion', 'hop', 'tap', 'chase'];

/** A find of a world: where it is (`y` - the height of its middle over the ground), its kind and the way to take it. */
export interface CollectItem {
  kind: CollectKind; way: CollectWay; x: number; z: number; y: number;
  /** Finds of one flock (butterflies on a meadow): when one is taken the others fly up for a moment. */
  flock?: number;
}

/** What a world lays out: every kind it names has exactly SET_SIZE finds. */
export interface CollectDef {
  readonly items: readonly CollectItem[];
  /**
   * The finds out in the world now, by their numbers in `items` (a world that lays them out one a day, the hub's
   * feathers); unset - all of them. A find not out is not drawn, not taken and not led to; its number stays its own,
   * so `ws.found` keeps meaning the same finds. Read every frame: keep it cheap.
   */
  shown?(ws: WorldState): readonly number[];
}

export const SET_SIZE = 6;
/** Stars for a find, and for a whole set (literals at `addStars`, as src/game/no-penalties.test.ts reads them). */
export const COLLECT_REWARD = 1;
export const SET_REWARD = 5;

/** m: how near (across) her a find is taken; her hands reach this much over her crown. */
export const TAKE_R = 1.0;
export const HANDS = 0.3;
/** m: the farthest a find on the screen is touched from. */
export const TAP_R = 6;
/** A `hop` find lies this much over the top of its support; standing on it is her feet at most STAND below its top. */
export const HOP_LIFT = 0.28;
export const STAND = 0.1;
/** A butterfly to catch: the ring it flies round (m), how near she makes it fly (m) and how fast it flies (m/s). */
export const CHASE = { ring: 6, wake: 5, speed: 4.3 } as const;

/** m: how high a jump rises at the speed `v` upwards (m/s) under the gravity `g` (src/game/player.ts). */
export const jumpApex = (v: number, g: number) => (v * v) / (2 * g);

/** m: the highest point her hands reach, her feet at `feet` and her size `scale`. */
export const handsAt = (feet: number, scale: number) => feet + HERO_TOP * scale + HANDS;

/** Whether she, her feet at `hero` and of size `scale`, takes a find that is at `at` (its middle): touching is apart. */
export function reaches(way: CollectWay, at: { x: number; y: number; z: number }, hero: { x: number; y: number; z: number }, scale: number): boolean {
  if (way === 'tap') return false;
  if (Math.hypot(at.x - hero.x, at.z - hero.z) > TAKE_R * Math.max(1, scale)) return false;
  if (at.y < hero.y - 0.3 || at.y > handsAt(hero.y, scale)) return false;
  // on a support: her feet up there too, not below its edge
  return way !== 'hop' || hero.y >= at.y - HOP_LIFT - STAND;
}

/** The finds found in the world, mended where read (a broken field is an empty list). */
export function foundOf(ws: WorldState): number[] {
  if (!Array.isArray(ws.found) || ws.found.some((n) => !Number.isInteger(n))) ws.found = [];
  return ws.found;
}

/** The kinds of a world's finds, in the order they first come in its list. */
export const kindsOf = (def: CollectDef): CollectKind[] => [...new Set(def.items.map((i) => i.kind))];

/** The numbers of the finds of a kind. */
export const itemsOf = (def: CollectDef, kind: CollectKind): number[] =>
  def.items.flatMap((it, i) => (it.kind === kind ? [i] : []));

/** A set is whole when every find of its kind is found. */
export const setDone = (def: CollectDef, kind: CollectKind, found: readonly number[]) => itemsOf(def, kind).every((i) => found.includes(i));

/** What is wrong with a world's finds: each kind has SET_SIZE of them, of a known kind and way. */
export function collectProblems(def: CollectDef): string[] {
  const out: string[] = [];
  for (const [i, it] of def.items.entries()) {
    if (!(it.kind in COLLECT_KINDS)) out.push(`find ${i}: the kind "${it.kind}" is not in COLLECT_KINDS`);
    if (!COLLECT_WAYS.includes(it.way)) out.push(`find ${i}: the way "${it.way}" is not one of the six`);
  }
  for (const k of kindsOf(def)) {
    const n = itemsOf(def, k).length;
    if (n !== SET_SIZE) out.push(`the set "${k}" has ${n} finds, not ${SET_SIZE}`);
  }
  return out;
}
