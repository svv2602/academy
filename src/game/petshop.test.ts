import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { dealState } from './deal';
import { PET_ITEMS, buy, canBuy, dealOf, equipPet, petItemState, petOpen, petWorn, priceOf } from './shop';
import { PET_GEAR } from './petgear';

// The things of the pets (decision of 2026-11-20): bought as the heroine's, kept in `owned`, one worn on each pet;
// the fawn's only once it is found; a rare thing only on the day it is the deal of the day.
const day = (n: number) => `2030-${String(1 + (n % 12)).padStart(2, '0')}-${String(1 + (n % 28)).padStart(2, '0')}`;
let s: Save;
beforeEach(() => { s = defaultSave(); s.stars = 1000; dealState.held = true; dealState.day = null; });
afterEach(() => { dealState.held = false; dealState.day = null; });
const withFawn = (x: Save) => { x.pets = ['fawn']; return x; };
/** The first day (of the walkthrough's calendar) whose deal is `id` for save `x`. */
const dealDayOf = (x: Save, id: string) => {
  dealState.held = false;
  for (let n = 0; n < 2000; n++) if (dealOf(x, day(n))?.id === id) return day(n);
  throw new Error(`no day has ${id} as its deal`);
};

describe('the catalog of the pets', () => {
  it('has the things and prices of the plan: three of each pet and one rare each, at 30, and the gifts of a trade for the fawn, the owlet and Bulchik', () => {
    expect(Object.fromEntries(PET_ITEMS.map((x) => [x.id, [x.pet, x.price, x.rare === true]]))).toEqual({
      cat_collar: ['cat', 15, false], cat_bow: ['cat', 15, false], cat_hat: ['cat', 25, false], cat_gold_bell: ['cat', 30, true],
      fawn_wreath: ['fawn', 15, false], fawn_ribbon: ['fawn', 15, false], fawn_bell: ['fawn', 20, false], fawn_star_crown: ['fawn', 30, true],
      // a character's gift for a trade (PLAY-28): never sold, no price
      fawn_leaf_bow: ['fawn', undefined, false],
      owlet_leaf_scarf: ['owlet', undefined, false],
      bulchik_coral_necklace: ['bulchik', undefined, false],
    });
  });
  it('every thing has its model on the bone of its own pet (src/game/petgear.ts)', () => {
    expect(PET_ITEMS.map((x) => [x.id, x.pet])).toEqual(Object.entries(PET_GEAR).map(([id, g]) => [id, g.pet]));
  });
});

describe('buying and wearing a thing of a pet', () => {
  it('bought by buy at its price, kept in owned, put on by equipPet', () => {
    expect(canBuy(s, 'cat_bow')).toBe(true);
    expect(buy(s, 'cat_bow')).toBe(true);
    expect(s.stars).toBe(985);
    expect(s.owned).toContain('cat_bow');
    expect(canBuy(s, 'cat_bow')).toBe(false);   // kept for ever: never bought twice
    expect(equipPet(s, 'cat', 'cat_bow')).toBe(true);
    expect(petWorn(s, 'cat')).toBe('cat_bow');
    expect(petItemState(s, 'cat_bow')).toEqual({ kind: 'owned', worn: true });
    expect(equipPet(s, 'cat', null)).toBe(true);
    expect(petWorn(s, 'cat')).toBe(null);
  });
  it('refuses a thing she has not got, or one of another pet, the save as it was', () => {
    expect(equipPet(s, 'cat', 'cat_hat')).toBe(false);
    s.owned.push('fawn_wreath');
    expect(equipPet(s, 'cat', 'fawn_wreath')).toBe(false);
    expect(s.petGear).toBeUndefined();
  });
  it('a damaged petGear wears nothing: an unknown id, one not bought, one of another pet', () => {
    s.owned.push('fawn_bell');
    for (const id of ['x', 'cat_hat', 'fawn_bell']) { s.petGear = { cat: id }; expect(petWorn(s, 'cat'), id).toBe(null); }
  });
  it('short of stars: the stars still needed, and buy refuses', () => {
    s.stars = 10;
    expect(petItemState(s, 'cat_hat')).toEqual({ kind: 'price', price: 25, short: 15 });
    expect(buy(s, 'cat_hat')).toBe(false);
    expect(s.stars).toBe(10);
  });
});

describe('the fawn\'s things only once the fawn is found', () => {
  it('not for sale before, for sale after', () => {
    expect(petOpen(s, 'cat')).toBe(true);
    expect(petOpen(s, 'fawn')).toBe(false);
    expect(canBuy(s, 'fawn_wreath')).toBe(false);
    withFawn(s);
    expect(petOpen(s, 'fawn')).toBe(true);
    expect(canBuy(s, 'fawn_wreath')).toBe(true);
  });
  it('found by the flag of its world in an older save', () => {
    s.worlds.fairy = { ...(s.worlds.fairy ?? {}), flags: { pet: true } } as never;
    expect(petOpen(s, 'fawn')).toBe(true);
  });
  it('never the deal of the day before it is found', () => {
    dealState.held = false;
    for (let n = 0; n < 400; n++) expect(dealOf(s, day(n))?.id ?? '', day(n)).not.toMatch(/^fawn_/);
  });
});

describe('a rare thing: only on the day it is the deal of the day', () => {
  it.each(['cat_gold_bell', 'fawn_star_crown'])('%s: a silhouette on other days, 18 instead of 30 on its day, once', (id) => {
    withFawn(s);
    dealState.held = false;
    const its = dealDayOf(s, id);
    const other = Array.from({ length: 400 }, (_, n) => day(n)).find((d) => dealOf(s, d)?.id !== id)!;
    dealState.day = other;
    expect(priceOf(s, id)).toBeUndefined();
    expect(canBuy(s, id)).toBe(false);
    expect(buy(s, id)).toBe(false);
    expect(petItemState(s, id)).toEqual({ kind: 'rare' });
    dealState.day = its;
    expect(petItemState(s, id)).toEqual({ kind: 'price', price: 18, short: 0, was: 30 });
    expect(buy(s, id)).toBe(true);
    expect(s.stars).toBe(982);
    expect(s.owned).toContain(id);
    expect(s.deal?.took).toBe(its);
    expect(petItemState(s, id)).toEqual({ kind: 'owned', worn: false });
  });
  it('the deal of some day in a year falls on each rare thing', () => {
    withFawn(s);
    expect(() => dealDayOf(s, 'cat_gold_bell')).not.toThrow();
    expect(() => dealDayOf(s, 'fawn_star_crown')).not.toThrow();
  });
});
