import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { DEAL_MIN, dealState, discounted, ranked } from './deal';
import { CATALOG, PET_ITEMS, SUPPLIES, buy, canBuy, dealOf, priceOf, stock } from './shop';

// The deal of the day (decision of 2026-11-20): one thing 40 % off, one purchase at that price a day.
// the rare things of the pets are sold only as the deal (src/game/petshop.test.ts), the others as any thing
const SOLD = [...CATALOG.filter((i) => i.price !== undefined).map((i) => [i.id, i.price!] as const), ...SUPPLIES.map((x) => [x.id, x.price] as const),
  ...PET_ITEMS.filter((x) => !x.rare).map((x) => [x.id, x.price] as const)];
const day = (n: number) => `2030-${String(1 + (n % 12)).padStart(2, '0')}-${String(1 + (n % 28)).padStart(2, '0')}`;
let s: Save;
beforeEach(() => { s = defaultSave(); s.stars = 1000; dealState.held = false; dealState.day = null; });
afterEach(() => { dealState.held = false; dealState.day = null; });

describe('the price of a deal', () => {
  it('40 % off, whole stars, no less than 5 - and never more than the price itself', () => {
    expect([30, 40, 25, 20, 15, 10].map(discounted)).toEqual([18, 24, 15, 12, 9, 6]);
    expect(discounted(6)).toBe(DEAL_MIN);
    expect(discounted(4)).toBe(4);
    for (let p = 1; p <= 200; p++) expect(discounted(p), String(p)).toBeLessThanOrEqual(p);
  });

  it('on any day, for any thing, the price asked is the thing\'s own or less - never more (the deal cannot raise a price)', () => {
    for (let n = 0; n < 300; n++) {
      for (const [id, price] of SOLD) {
        const now = priceOf(s, id, day(n))!;
        expect(now, `${id} on ${day(n)}`).toBeLessThanOrEqual(price);
        expect(now, `${id} on ${day(n)}`).toBeGreaterThanOrEqual(Math.min(price, DEAL_MIN));
      }
    }
  });
});

describe('which thing', () => {
  it('one deal a day, the same all day: the order of rank is fixed by the day', () => {
    const d = dealOf(s, '2030-03-05')!;
    expect(dealOf(s, '2030-03-05')).toEqual(d);
    expect(ranked('2030-03-05', ['a', 'b', 'c'])).toEqual(ranked('2030-03-05', ['c', 'a', 'b']));
    const seen = new Set(Array.from({ length: 60 }, (_, n) => dealOf(s, day(n))!.id));
    expect(seen.size).toBeGreaterThan(5);   // the days differ
  });

  it('a thing she has is never the deal; a purchase of another thing does not change it', () => {
    // a day whose deal is a thing to wear
    let n = 0;
    while (!CATALOG.some((i) => i.id === dealOf(s, day(n))!.id)) n++;
    const today = day(n), d = dealOf(s, today)!;
    s.owned.push(d.id);
    const next = dealOf(s, today)!;
    expect(next.id).not.toBe(d.id);
    s.owned.pop();
    const other = SOLD.map(([id]) => id).find((id) => id !== d.id && CATALOG.some((i) => i.id === id))!;
    s.owned.push(other);
    expect(dealOf(s, today)!.id).toBe(d.id);
  });

  it('everything to wear bought, hers and the pets\': the deal is a supply', () => {
    s.owned = [...CATALOG.filter((i) => i.price !== undefined).map((i) => i.id), ...PET_ITEMS.map((x) => x.id)];
    for (let n = 0; n < 30; n++) expect(SUPPLIES.map((x) => x.id as string)).toContain(dealOf(s, day(n))!.id);
  });

  it('held by the walkthrough: no deal, every price its own', () => {
    dealState.held = true;
    expect(dealOf(s, '2030-03-05')).toBeNull();
    for (const [id, price] of SOLD) expect(priceOf(s, id, '2030-03-05')).toBe(price);
  });
});

describe('buying the deal', () => {
  it('takes exactly the deal\'s price, once a day; the second the same day is at the full price; the next day has a deal again', () => {
    dealState.day = '2030-03-05';
    let d = dealOf(s)!;
    // make it a supply, which can be bought twice
    while (!SUPPLIES.some((x) => x.id === d.id)) { s.owned.push(d.id); d = dealOf(s)!; }
    const before = s.stars;
    expect(canBuy(s, d.id) && buy(s, d.id)).toBe(true);
    expect(s.stars).toBe(before - d.price);
    expect(s.deal).toEqual({ took: '2030-03-05' });
    expect(dealOf(s)).toBeNull();
    expect(buy(s, d.id)).toBe(true);
    expect(s.stars).toBe(before - d.price - d.was);
    expect(stock(s, d.id as never)).toBe(2);
    dealState.day = '2030-03-06';
    expect(dealOf(s)).not.toBeNull();
  });

  it('with the deal\'s price she may buy what she could not at the full one', () => {
    dealState.day = '2030-03-05';
    const d = dealOf(s)!;
    s.stars = d.price;
    expect(canBuy(s, d.id)).toBe(true);
    expect(buy(s, d.id)).toBe(true);
    expect(s.stars).toBe(0);
  });
});
