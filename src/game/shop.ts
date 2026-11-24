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
 * The things of the pets (`PET_ITEMS`, decision of 2026-11-20): the cat's and the fawn's, bought by `buy` as well, kept
 * for ever in `save.owned`, worn by `equipPet` (`save.petGear`, one thing on each pet). The fawn's are sold only once
 * the fawn is found. A rare thing is sold only on the day it is the deal of the day, at the deal's price; on the other
 * days it is a silhouette.
 */
import type { Gear, Save } from '../core/save';
import { dealDay, dealState, discounted, ranked } from './deal';
import { artifactBack } from './artifacts';
import { foundPets } from './pets';

export type Slot = keyof Gear;
/** The world whose artifact is the Crystal of Light. */
const FIRST_WORLD = 'fairy';
/** What opens a thing that is not sold: the Crystal of Light restored (the end of the first world), an achievement. */
export type Reward = 'crystal' | 'three_secrets' | 'trade';

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
  // the gifts of the characters for a trade (PLAY-28, src/game/trade.ts): never sold, "від жителя" in the shop
  { id: 'feather_crown', slot: 'head', reward: 'trade' },
  { id: 'acorn_cap', slot: 'head', reward: 'trade' },
  { id: 'mushroom_hat', slot: 'head', reward: 'trade' },
  { id: 'shell_tiara', slot: 'head', reward: 'trade' },
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

/**
 * The potions and the compass: drunk in the game, from the row of their buttons (src/game/supplies.ts). The rainbow is
 * not sold (it is not in SUPPLIES): only brewed in the cauldron from finds of two worlds (PLAY-26, src/game/cauldron.ts).
 */
export const POTION_IDS = ['speed', 'jump', 'glow', 'funny', 'compass', 'rainbow'] as const;
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

/**
 * The pets that wear things: the cat (the companion), the fawn (the pet of the first world), the owlet (the forest's) and
 * Bulchik (the sea's) - these two of src/game/pets.ts, their things hung on their models where a world loads them
 * (src/game/petgear.ts `hangOwnGear`).
 */
export type PetWearer = 'cat' | 'fawn' | 'owlet' | 'bulchik';
export const PET_WEARERS: readonly PetWearer[] = ['cat', 'fawn', 'owlet', 'bulchik'];
/**
 * A thing of a pet: its pet, its price; `rare` - sold only on the day it is the deal of the day; `reward: 'trade'` - not
 * sold, a character's gift for a trade (PLAY-28), no price.
 */
export interface PetItem { id: string; pet: PetWearer; price?: number; rare?: true; reward?: 'trade' }
/** The models are src/game/petgear.ts PET_GEAR (the same ids, petgear.test.ts checks it). */
export const PET_ITEMS: readonly PetItem[] = [
  { id: 'cat_collar', pet: 'cat', price: 15 },
  { id: 'cat_bow', pet: 'cat', price: 15 },
  { id: 'cat_hat', pet: 'cat', price: 25 },
  { id: 'cat_gold_bell', pet: 'cat', price: 30, rare: true },
  { id: 'fawn_wreath', pet: 'fawn', price: 15 },
  { id: 'fawn_ribbon', pet: 'fawn', price: 15 },
  { id: 'fawn_bell', pet: 'fawn', price: 20 },
  { id: 'fawn_star_crown', pet: 'fawn', price: 30, rare: true },
  { id: 'fawn_leaf_bow', pet: 'fawn', reward: 'trade' },
  { id: 'owlet_leaf_scarf', pet: 'owlet', reward: 'trade' },
  { id: 'bulchik_coral_necklace', pet: 'bulchik', reward: 'trade' },
];
export const petItem = (id: string): PetItem | undefined => PET_ITEMS.find((x) => x.id === id);

/** Whether the things of a pet are shown in the shop: the cat's always, another pet's once it is found. */
export function petOpen(s: Save, pet: PetWearer): boolean {
  return pet === 'cat' || foundPets(s).includes(pet);
}

/** Anything the shop sells or keeps: a thing to wear, a supply or a thing of a pet. */
const goods = (id: string): Item | Supply | PetItem | undefined => item(id) ?? SUPPLIES.find((x) => x.id === id) ?? petItem(id);
const isSupply = (x: Item | Supply | PetItem): x is Supply => 'supply' in x;
const isPetItem = (x: Item | Supply | PetItem): x is PetItem => 'pet' in x;

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
  // A gift of a trade is hers once given: it is in `owned` (src/game/trade.ts), which `has` reads.
  return it.reward === 'three_secrets' && 'three_secrets' in s.achievements;
}

/** Whether she may wear a thing: bought, opened by its reward, or free. */
export function has(s: Save, id: string): boolean {
  const it = item(id);
  return !!it && (it.free === true || s.owned.includes(id) || unlocked(s, id));
}

/** Whether the thing could be bought at all now, whatever she can pay: for sale, and not hers yet (a supply: room in the stock). */
function forSale(s: Save, id: string): boolean {
  const it = goods(id);
  if (!it || it.price === undefined) return false;
  if (isPetItem(it)) return !s.owned.includes(id) && petOpen(s, it.pet);
  return isSupply(it) ? stock(s, it.id) < STOCK_MAX : !has(s, id);
}

/** Every id the shop sells, in the order of the catalog: the things to wear, the supplies, the things of the pets. */
const SOLD: readonly string[] = [...CATALOG.filter((i) => i.price !== undefined).map((i) => i.id), ...SUPPLIES.map((x) => x.id), ...PET_ITEMS.filter((x) => x.price !== undefined).map((x) => x.id)];

/** The deal of `day` (src/game/deal.ts): its thing and both prices; null - held, taken that day already, or nothing to sell. */
export function dealOf(s: Save, day = dealDay()): { id: string; price: number; was: number } | null {
  if (dealState.held || s.deal?.took === day) return null;
  const id = ranked(day, SOLD).find((x) => forSale(s, x));
  if (!id) return null;
  const was = goods(id)!.price!;
  return { id, price: discounted(was), was };
}

/**
 * What the thing costs now: the deal's price for the deal of the day, else its own (undefined: not sold - a rare thing
 * of a pet on any day it is not the deal).
 */
export function priceOf(s: Save, id: string, day = dealDay()): number | undefined {
  const deal = dealOf(s, day);
  if (deal?.id === id) return deal.price;
  const it = goods(id);
  return it && isPetItem(it) && it.rare ? undefined : it?.price;
}

/** Whether a tap on "buy" would buy the thing: it is for sale, not hers yet, and she has the stars for its price now. */
export function canBuy(s: Save, id: string): boolean {
  const price = priceOf(s, id);
  return forSale(s, id) && price !== undefined && s.stars >= price;
}

/**
 * Buys a thing on the child's tap: the second and last writer of the stars (src/game/no-penalties.test.ts reads this
 * function), and the only one that lowers them. Takes exactly the price canBuy checked (`priceOf`: the deal of the
 * day's, or the thing's own) and keeps the thing for ever - or, for a supply, adds one to her stock. Refused, with
 * the save left as it was, when canBuy says no. The caller stores the save.
 */
export function buy(s: Save, id: string): boolean {
  if (!canBuy(s, id)) return false;
  const it = goods(id)!, day = dealDay(), deal = dealOf(s, day), price = priceOf(s, id, day)!;
  s.stars -= price;
  if (isSupply(it)) s.supplies = { ...s.supplies, [it.id]: stock(s, it.id) + 1 };
  else s.owned.push(id);   // a thing of the heroine or of a pet
  // the deal of the day taken: no other deal today (src/game/deal.ts)
  if (deal?.id === id) s.deal = { ...s.deal, took: day };
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

/** The thing a pet wears (null: none); a thing she does not have, or of another pet, is none. */
export function petWorn(s: Save, pet: PetWearer): string | null {
  const id = s.petGear?.[pet];
  return typeof id === 'string' && petItem(id)?.pet === pet && s.owned.includes(id) ? id : null;
}

/**
 * Puts a thing of a pet she has on it, or takes the pet's thing off with null. Refused, the save left as it was, for a
 * thing she does not have or of another pet. The caller stores the save.
 */
export function equipPet(s: Save, pet: PetWearer, id: string | null): boolean {
  if (id !== null && (petItem(id)?.pet !== pet || !s.owned.includes(id))) return false;
  s.petGear = { ...s.petGear, [pet]: id };
  return true;
}

/**
 * How the screen shows a thing of a pet: `owned` (worn or not), `price` as a thing of the heroine (`was` on the deal of
 * the day), `rare` - a rare thing on a day it is not the deal: a silhouette "рідкісна річ".
 */
export type PetItemState = { kind: 'owned'; worn: boolean } | { kind: 'price'; price: number; short: number; was?: number } | { kind: 'rare' } | { kind: 'trade' };

export function petItemState(s: Save, id: string): PetItemState | undefined {
  const it = petItem(id);
  if (!it) return undefined;
  if (s.owned.includes(id)) return { kind: 'owned', worn: petWorn(s, it.pet) === id };
  if (it.reward === 'trade') return { kind: 'trade' };
  const price = priceOf(s, id);
  if (price === undefined) return { kind: 'rare' };
  return { kind: 'price', price, short: Math.max(0, price - s.stars), ...(price < it.price! ? { was: it.price } : {}) };
}

/**
 * How the screen shows a thing:
 * - `owned`: hers (bought, opened or free), worn or not;
 * - `price`: for sale at `price` now (`was`: its own price, when it is the deal of the day); `short` is the stars she still
 *   needs ("ещё N звёзд", no red, no error sound), 0 when she can buy it;
 * - `reward`: not sold and not opened yet, its reward is reachable now (the Crystal of Light, a trade): shown with what opens it;
 * - `silhouette`: not sold, its reward does not exist yet (the earrings until PLAY-08): a silhouette "за досягнення".
 */
export type ItemState =
  | { kind: 'owned'; worn: boolean }
  | { kind: 'price'; price: number; short: number; was?: number }
  | { kind: 'reward'; reward: Reward }
  | { kind: 'silhouette'; reward: Reward };

/** The rewards the game can give now; the others wait for their part of the game. */
const REACHABLE: readonly Reward[] = ['crystal', 'trade'];

export function itemState(s: Save, id: string): ItemState | undefined {
  const it = item(id);
  if (!it) return undefined;
  if (has(s, id)) return { kind: 'owned', worn: s.gear[it.slot] === id };
  if (it.price !== undefined) {
    const price = priceOf(s, id)!;
    return { kind: 'price', price, short: Math.max(0, price - s.stars), ...(price < it.price ? { was: it.price } : {}) };
  }
  const reward = it.reward!;
  return REACHABLE.includes(reward) ? { kind: 'reward', reward } : { kind: 'silhouette', reward };
}
