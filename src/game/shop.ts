/**
 * The shop of the first version (PLAY-04): the things the heroine can wear, what each costs or what opens it, and the
 * rules that move the save. No screen here (src/ui/shop.ts shows it); the worn things live in `save.gear`, the bought
 * ones in `save.owned`.
 *
 * The rules (LEARN-14, decisions of 2026-11-15): stars are spent only by `buy`, which the screen calls on the child's
 * tap, and never by anything else; a bought thing is kept for ever and cannot be bought twice; a thing she cannot
 * afford yet is still shown with the stars it still needs; some things are not for sale - a reward opens them.
 * Trying a thing on before buying it is the screen's own state and never reaches the save.
 * The potions and the compass (`SUPPLIES`) are bought the same way, by `buy`, but are used up: each purchase adds one to
 * her stock (`save.supplies`), which src/game/supplies.ts spends when she drinks one. None of them gives an answer or
 * skips a task.
 */
import type { Gear, Save } from '../core/save';
import { artifactBack } from './artifacts';

export type Slot = keyof Gear;
/** The world whose artifact is the Crystal of Light. */
const FIRST_WORLD = 'fairy';
/** What opens a thing that is not sold: the Crystal of Light restored (the end of the first world), an achievement. */
export type Reward = 'crystal' | 'three_secrets';

export interface Item {
  id: string;
  slot: Slot;
  /** Stars it costs in the shop; absent for a thing that is not sold. */
  price?: number;
  /** What opens a thing that is not sold; absent for one that is sold or free. */
  reward?: Reward;
  /** Every heroine has it from the start. */
  free?: boolean;
  /** A thing of one of the four looks (src/game/looks.ts): always free as well. */
  look?: boolean;
}

/**
 * The first version: six things to buy, two rewards, the wings she has always had (decision Q3: 5 to 8 for sale) and
 * the six free things of the looks.
 */
export const CATALOG: readonly Item[] = [
  { id: 'wand_star', slot: 'wand', price: 10 },
  { id: 'wings_butterfly', slot: 'wings', price: 15 },
  { id: 'wreath', slot: 'head', price: 15 },
  { id: 'crown', slot: 'head', price: 30 },
  { id: 'wizard_hat', slot: 'head', price: 30 },
  { id: 'trail_sparkle', slot: 'trail', price: 40 },
  { id: 'wand_crystal', slot: 'wand', reward: 'crystal' },
  { id: 'earrings_star', slot: 'head', reward: 'three_secrets' },
  { id: 'wings_petals', slot: 'wings', free: true },
  // The things of the four looks (PLAY-06, decision 3 of 2026-11-15): simple versions, free, never sold; the full ones
  // (the crown, the hat with stars, the star and crystal wands) stay in the shop and the rewards.
  { id: 'tiara', slot: 'head', free: true, look: true },
  { id: 'wizard_cap', slot: 'head', free: true, look: true },
  { id: 'elf_ears', slot: 'head', free: true, look: true },
  { id: 'wand_flower', slot: 'wand', free: true, look: true },
  { id: 'wand_moon', slot: 'wand', free: true, look: true },
  { id: 'wand_leaf', slot: 'wand', free: true, look: true },
];

/** The thing of an id, or undefined for an id the catalog does not know (a later version's thing, a damaged save). */
export const item = (id: string): Item | undefined => CATALOG.find((i) => i.id === id);

/** The potions and the compass: drunk in the game, from the row of their buttons (src/game/supplies.ts). */
export const POTION_IDS = ['speed', 'jump', 'glow', 'funny', 'compass'] as const;
export type PotionId = (typeof POTION_IDS)[number];
/** The helpers of a task: taken in the task itself, from its panel (src/game/helpers.ts). */
export const HELPER_IDS = ['owl', 'abacus'] as const;
export type HelperId = (typeof HELPER_IDS)[number];
/** The things that are used up: the potions and the compass, and the helpers of a task. */
export const SUPPLY_IDS = [...POTION_IDS, ...HELPER_IDS] as const;
export type SupplyId = PotionId | HelperId;
/** A thing that is used up: bought again and again, each purchase one more in her stock. */
export interface Supply { id: SupplyId; price: number; supply: true }
/**
 * Prices (decision of 2026-11-19): a day of play brings about 50-60 stars, one or two potions; the dearer things of the
 * shop are what the stars are saved for.
 */
export const SUPPLIES: readonly Supply[] = [
  { id: 'speed', price: 25, supply: true },
  { id: 'jump', price: 25, supply: true },
  { id: 'funny', price: 20, supply: true },
  { id: 'glow', price: 30, supply: true },
  { id: 'compass', price: 30, supply: true },
  // the helpers of a task (decision of 2026-11-19): the owl says the first rung of the hint at once, the abacus lays the
  // things out in ten frames
  { id: 'owl', price: 15, supply: true },
  { id: 'abacus', price: 20, supply: true },
];
/** No more of one kind in her stock: the number fits its button, and the stars are not all spent on one thing. */
export const STOCK_MAX = 9;

/** How many of a supply she has (a damaged or missing count is none). */
export function stock(s: Save, id: SupplyId): number {
  const n = s.supplies?.[id];
  return typeof n === 'number' && Number.isInteger(n) && n > 0 ? n : 0;
}

/** Anything the shop sells or keeps: a thing to wear or a supply. */
const goods = (id: string): Item | Supply | undefined => item(id) ?? SUPPLIES.find((x) => x.id === id);
const isSupply = (x: Item | Supply): x is Supply => 'supply' in x;

/**
 * Whether the reward of a thing that is not sold has been earned. The Crystal of Light: the first world's final.
 * Three secrets: the achievement `three_secrets` of PLAY-08 in `save.achievements` - until it comes the earrings stay a
 * silhouette.
 */
export function unlocked(s: Save, id: string): boolean {
  const it = item(id);
  if (!it?.reward) return false;
  // Read without worldState, which would create the world in the save: asking must change nothing.
  if (it.reward === 'crystal') return artifactBack(s, FIRST_WORLD);
  // Three secrets: the achievement of PLAY-08, received for good (src/game/achievements.ts).
  return it.reward === 'three_secrets' && 'three_secrets' in s.achievements;
}

/** Whether she may wear a thing: bought, opened by its reward, or free. */
export function has(s: Save, id: string): boolean {
  const it = item(id);
  return !!it && (it.free === true || s.owned.includes(id) || unlocked(s, id));
}

/** Whether a tap on "buy" would buy the thing: it is for sale, not hers yet, and she has the stars. */
export function canBuy(s: Save, id: string): boolean {
  const it = goods(id);
  if (!it || it.price === undefined || s.stars < it.price) return false;
  return isSupply(it) ? stock(s, it.id) < STOCK_MAX : !has(s, id);
}

/**
 * Buys a thing on the child's tap: the second and last writer of the stars (src/game/no-penalties.test.ts reads this
 * function), and the only one that lowers them. Takes exactly the price and keeps the thing for ever - or, for a
 * supply, adds one to her stock. Refused, with
 * the save left as it was, when canBuy says no. The caller stores the save.
 */
export function buy(s: Save, id: string): boolean {
  if (!canBuy(s, id)) return false;
  const it = goods(id)!;
  s.stars -= it.price!;
  if (isSupply(it)) s.supplies = { ...s.supplies, [it.id]: stock(s, it.id) + 1 };
  else s.owned.push(id);
  return true;
}

/**
 * Puts a thing she has on its slot, or empties the slot with null (null wings: no wings). Refused, the gear left as
 * it was, for a thing she does not have or of another slot. The caller stores the save.
 */
export function equip(s: Save, slot: Slot, id: string | null): boolean {
  if (id !== null) {
    const it = item(id);
    if (!it || it.slot !== slot || !has(s, id)) return false;
  }
  s.gear[slot] = id;
  return true;
}

/**
 * How the screen shows a thing:
 * - `owned`: hers (bought, opened or free), worn or not;
 * - `price`: for sale; `short` is the stars she still needs ("ещё N звёзд", no red, no error sound), 0 when she can buy it;
 * - `reward`: not sold and not opened yet, its reward is reachable now (the Crystal of Light): shown with what opens it;
 * - `silhouette`: not sold, its reward does not exist yet (the earrings until PLAY-08): a silhouette "за досягнення".
 */
export type ItemState =
  | { kind: 'owned'; worn: boolean }
  | { kind: 'price'; price: number; short: number }
  | { kind: 'reward'; reward: Reward }
  | { kind: 'silhouette'; reward: Reward };

/** The rewards the game can give now; the others wait for their part of the game. */
const REACHABLE: readonly Reward[] = ['crystal'];

export function itemState(s: Save, id: string): ItemState | undefined {
  const it = item(id);
  if (!it) return undefined;
  if (has(s, id)) return { kind: 'owned', worn: s.gear[it.slot] === id };
  if (it.price !== undefined) return { kind: 'price', price: it.price, short: Math.max(0, it.price - s.stars) };
  const reward = it.reward!;
  return REACHABLE.includes(reward) ? { kind: 'reward', reward } : { kind: 'silhouette', reward };
}
