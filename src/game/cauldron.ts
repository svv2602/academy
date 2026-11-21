/**
 * The cauldron (PLAY-26, the customer's word of 2026-11-21): the finds of the stash (src/game/stash.ts) brewed into
 * potions by recipes drawn in pictures. It stands by the Great Tree, outside the worlds, and takes the finds of every
 * world; a recipe is shown only once every world of its kinds is open (a world is open once the save has its part),
 * so a child never sees a recipe she cannot make. Brewing is no task: a find put in that the recipe does not ask is
 * refused and nothing is spent; the finds put in are spent only when the potion is done, so stopping half way costs
 * nothing. The potion goes to the stock of the shop's potions (PLAY-23, `supplies`, up to STOCK_MAX).
 */
import type { Save } from '../core/save';
import { COLLECT_KINDS, type CollectKind } from './collections';
import { STOCK_MAX, stock, type PotionId } from './shop';
import { canSpend, inStash, spend, type Need } from './stash';

/** A recipe: what it gives and how many finds of each kind it asks. */
export interface Recipe { readonly id: string; readonly gives: PotionId; readonly need: Readonly<Partial<Record<CollectKind, number>>> }

/**
 * The recipes: each potion of the shop from the finds of the fairy world, 3 or 4 finds (the shop asks 20-30 stars;
 * a find is a star when it is taken). Recipes mixing the worlds give potions the shop has not - they come with their
 * effects (the first: the rainbow, PLAY-26).
 */
export const RECIPES: readonly Recipe[] = [
  { id: 'speed', gives: 'speed', need: { mushroom: 2, feather: 1 } },
  { id: 'jump', gives: 'jump', need: { acorn: 2, feather: 1 } },
  { id: 'glow', gives: 'glow', need: { butterfly: 2, mushroom: 1 } },
  { id: 'funny', gives: 'funny', need: { mushroom: 1, acorn: 1, butterfly: 1 } },
  { id: 'compass', gives: 'compass', need: { feather: 2, butterfly: 2 } },
];

/** The kinds a recipe asks, in its order. */
export const kindsOfRecipe = (r: Recipe) => Object.keys(r.need) as CollectKind[];
/** The worlds open in this save: those with a part of their own. */
export const openWorlds = (s: Pick<Save, 'worlds'>): ReadonlySet<string> => new Set(Object.keys(s.worlds ?? {}));
/** The recipes she may see: every kind of each from an open world. */
export function shownRecipes(s: Pick<Save, 'worlds'>, recipes: readonly Recipe[] = RECIPES): Recipe[] {
  const open = openWorlds(s);
  return recipes.filter((r) => kindsOfRecipe(r).every((k) => open.has(COLLECT_KINDS[k].world)));
}

/** A potion being brewed: the recipe and how many of each kind are in the cauldron so far. */
export interface Brew { readonly recipe: Recipe; readonly put: Partial<Record<CollectKind, number>> }
export const startBrew = (recipe: Recipe): Brew => ({ recipe, put: {} });
const need = (b: Brew): Need => b.recipe.need as Need;

/** How many of `kind` are still to put in. */
export const stillToPut = (b: Brew, kind: CollectKind) => (b.recipe.need[kind] ?? 0) - (b.put[kind] ?? 0);
/** Whether every find of the recipe is in. */
export const brewReady = (b: Brew) => kindsOfRecipe(b.recipe).every((k) => stillToPut(b, k) <= 0);

/**
 * One find of `kind` put in: 'put' - in; 'refused' - the recipe does not ask it (or no more of it), or the stash has
 * no more of it than is in already, or the stock of the potion is full; nothing is spent either way.
 */
export function putIn(s: Pick<Save, 'stash' | 'supplies'>, b: Brew, kind: CollectKind): 'put' | 'refused' {
  if (stillToPut(b, kind) <= 0 || inStash(s, kind) <= (b.put[kind] ?? 0) || stock(s as Save, b.recipe.gives) >= STOCK_MAX) return 'refused';
  (b.put as Record<string, number>)[kind] = (b.put[kind] ?? 0) + 1;
  return 'put';
}

/** The potion done: the recipe's finds taken from the stash and one potion into the stock; false - not ready, nothing done. */
export function finishBrew(s: Pick<Save, 'stash' | 'supplies'>, b: Brew): boolean {
  if (!brewReady(b) || !canSpend(s, need(b)) || stock(s as Save, b.recipe.gives) >= STOCK_MAX) return false;
  spend(s, need(b));
  const st = (s.supplies ??= {});
  st[b.recipe.gives] = stock(s as Save, b.recipe.gives) + 1;
  return true;
}
