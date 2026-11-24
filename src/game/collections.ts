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

/**
 * The kinds of finds the worlds may lay out (a catalog like the pets'), with the picture of the book and the world it
 * lies in (`world`: the cauldron shows a recipe only once every world of its kinds is open, PLAY-26).
 */
export const COLLECT_KINDS = {
  butterfly: { icon: '🦋', color: '#c77dff', world: 'fairy' },
  acorn: { icon: '🌰', color: '#d8953f', world: 'fairy' },
  mushroom: { icon: '🍄', color: '#ff5f7e', world: 'fairy' },
  feather: { icon: '🪶', color: '#7fb8ff', world: 'fairy' },
  /**
   * the Enchanted Forest's (the customer's word of 2026-11-22, «А»): spruce cones and bilberries. There is no emoji of a
   * cone: its picture is drawn (`svg`, src/ui/finds.ts)
   */
  cone: { icon: '', svg: 'cone', color: '#a8683a', world: 'forest' },
  berry: { icon: '🫐', color: '#5b6fd6', world: 'forest' },
  /** the sea's (the customer's word of 2026-11-23): spiral shells and coral twigs, lying on the sand by its ways */
  shell: { icon: '🐚', color: '#ff9fc4', world: 'sea' },
  coral: { icon: '🪸', color: '#ff6f61', world: 'sea' },
  /** the feathers of the Great Tree's bird, the hub's find of the day (src/worlds/hub/feathers.ts): the feather, golden
   * (`gold`: drawn gilded wherever its picture is shown, src/ui/finds.ts) - a child knows it for a feather */
  treefeather: { icon: '🪶', color: '#ffa31a', world: 'hub', gold: true },
  /**
   * a piece of the picture of a world (PLAY-29): not a set (`set: false` - no row of the book's sets, no stars of a set,
   * no «Збирачка»), of every world that has a picture (`world: 'any'`, never an open world: no recipe, no trade asks it),
   * never in the stash and never the find of the day; its number among the world's pieces is its cell in the frame
   */
  piece: { icon: '🧩', color: '#ffb84d', world: 'any', set: false },
} as const;
export type CollectKind = keyof typeof COLLECT_KINDS;
/** The picture of a world's pieces (PLAY-29, CollectDef.picture). */
export interface Picture { readonly image: string; readonly cols: number; readonly rows: number }
/** Whether a kind makes a set (PLAY-25): every kind but the pieces of a picture. */
export const isSet = (k: CollectKind) => (COLLECT_KINDS[k] as { set?: boolean } | undefined)?.set !== false;

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

/**
 * The kinds of a world's finds in their order, all its sets and its keepsakes are counted by (src/worlds/hub/keepsakes.ts):
 * what the registry knows of a world before its code is loaded (src/worlds/<id>/meta.ts). A CollectDef is one.
 */
export interface CollectKinds { readonly items: readonly { readonly kind: CollectKind }[] }

/** What a world lays out: every kind it names has exactly SET_SIZE finds. */
export interface CollectDef {
  readonly items: readonly CollectItem[];
  /**
   * The finds out in the world now, by their numbers in `items` (a world that lays them out one a day, the hub's
   * feathers); unset - all of them. A find not out is not drawn, not taken and not led to; its number stays its own,
   * so `ws.found` keeps meaning the same finds. Read every frame: keep it cheap.
   */
  shown?(ws: WorldState): readonly number[];
  /**
   * The picture its pieces (kind `piece`, PLAY-29) make: a frame of the world's story (`image`, without its extension,
   * as src/worlds/<id>/story.ts names it) cut into `cols` x `rows` cells, a piece a cell in the order of the pieces.
   * Whole, it comes alive (src/ui/picture.ts).
   */
  readonly picture?: Picture;
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

/**
 * Whether she, her feet at `hero` and of size `scale`, takes a find that is at `at` (its middle): touching is apart.
 * `floor`: the ground under her when she swims over it (floorOf) - a find lying there is in her reach as she swims by.
 */
export function reaches(way: CollectWay, at: { x: number; y: number; z: number }, hero: { x: number; y: number; z: number }, scale: number, floor?: number): boolean {
  if (way === 'tap') return false;
  if (Math.hypot(at.x - hero.x, at.z - hero.z) > TAKE_R * Math.max(1, scale)) return false;
  if (at.y < Math.min(hero.y - 0.3, floor ?? Infinity) || at.y > handsAt(hero.y, scale)) return false;
  // on a support: her feet up there too, not below its edge
  return way !== 'hop' || hero.y >= at.y - HOP_LIFT - STAND;
}

/**
 * The lowest a find is taken from under her, at (x, z): the ground when the world has her swim (WorldDef.move, the
 * test of src/game/player.ts `swimming`) - she floats over the sand, the finds lie on it; else none (her feet).
 */
export const floorOf = (g: { world: { move?: { kind: string } }; groundY(x: number, z: number): number }, x: number, z: number): number | undefined =>
  (g.world.move?.kind === 'swim' ? g.groundY(x, z) : undefined);

/** The finds found in the world, mended where read (a broken field is an empty list). */
export function foundOf(ws: WorldState): number[] {
  if (!Array.isArray(ws.found) || ws.found.some((n) => !Number.isInteger(n))) ws.found = [];
  return ws.found;
}

/** The kinds of a world's finds, in the order they first come in its list. */
export const kindsOf = (def: CollectKinds): CollectKind[] => [...new Set(def.items.map((i) => i.kind))];
/** The kinds of a world's sets: its kinds but the pieces of its picture. */
export const setKindsOf = (def: CollectKinds): CollectKind[] => kindsOf(def).filter(isSet);
/** The numbers of the finds of every set (the pieces of the picture are not one). */
export const setItems = (def: CollectDef): number[] => def.items.flatMap((it, i) => (isSet(it.kind) ? [i] : []));

/** The numbers of the finds of a kind. */
export const itemsOf = (def: CollectKinds, kind: CollectKind): number[] =>
  def.items.flatMap((it, i) => (it.kind === kind ? [i] : []));

/** A set is whole when every find of its kind is found. */
export const setDone = (def: CollectKinds, kind: CollectKind, found: readonly number[]) => itemsOf(def, kind).every((i) => found.includes(i));

/** The numbers of a world's pieces of its picture, in the order of their cells. */
export const piecesOf = (def: CollectDef): number[] => itemsOf(def, 'piece');
/** Whether the picture is whole: every piece found (false for a world without one). */
export const pictureDone = (def: CollectDef, found: readonly number[]) => {
  const ids = piecesOf(def);
  return ids.length > 0 && ids.every((i) => found.includes(i));
};

/**
 * What is wrong with a world's finds: each kind of a set has SET_SIZE of them, the pieces as many as the cells of its
 * picture; every find of a known kind and way.
 */
export function collectProblems(def: CollectDef): string[] {
  const out: string[] = [];
  for (const [i, it] of def.items.entries()) {
    if (!(it.kind in COLLECT_KINDS)) out.push(`find ${i}: the kind "${it.kind}" is not in COLLECT_KINDS`);
    if (!COLLECT_WAYS.includes(it.way)) out.push(`find ${i}: the way "${it.way}" is not one of the six`);
  }
  for (const k of setKindsOf(def)) {
    const n = itemsOf(def, k).length;
    if (n !== SET_SIZE) out.push(`the set "${k}" has ${n} finds, not ${SET_SIZE}`);
  }
  const pieces = piecesOf(def).length, cells = def.picture ? def.picture.cols * def.picture.rows : 0;
  if (pieces !== cells) out.push(`the picture has ${cells} cells and ${pieces} pieces`);
  return out;
}
