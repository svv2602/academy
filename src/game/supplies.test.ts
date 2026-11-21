import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../core/save';
import { dealState } from './deal';
import { STOCK_MAX, SUPPLIES, buy, canBuy, priceOf, stock } from './shop';
import { EFFECT_MAX, EFFECT_SECONDS, SCALE, acting, drink, left, mysteriesLeft, refusal, sizeOf, tick, tuningOf } from './supplies';

// The potions and the compass (decision of 2026-11-19): bought by `buy`, drunk from the stock, a minute of play each.
const land = { water: false, mysteries: 3, random: () => 0.2 };
let s: Save;
beforeEach(() => { s = defaultSave(); });

describe('the shop sells the supplies again and again (src/game/shop.ts)', () => {
  it('prices: speed 25, jump 25, funny 20, glow 30, compass 30; the helpers: owl 15, abacus 20', () => {
    expect(Object.fromEntries(SUPPLIES.map((x) => [x.id, x.price]))).toEqual({ speed: 25, jump: 25, funny: 20, glow: 30, compass: 30, owl: 15, abacus: 20 });
  });

  it('each purchase takes the price and adds one to the stock; never into the things she wears', () => {
    s.stars = 60;
    expect(buy(s, 'speed')).toBe(true);
    expect(buy(s, 'speed')).toBe(true);
    expect([s.stars, stock(s, 'speed'), s.owned]).toEqual([10, 2, []]);
    expect(buy(s, 'speed')).toBe(false);          // 10 stars: not enough, nothing changes
    expect([s.stars, stock(s, 'speed')]).toEqual([10, 2]);
  });

  it('no more than STOCK_MAX of one kind', () => {
    s.stars = 1000;
    for (let i = 0; i < STOCK_MAX; i++) expect(buy(s, 'funny')).toBe(true);
    expect(canBuy(s, 'funny')).toBe(false);
    expect(buy(s, 'funny')).toBe(false);
    expect([stock(s, 'funny'), s.stars]).toEqual([STOCK_MAX, 1000 - STOCK_MAX * 20]);
  });

  it('on no day of a year does a test pay the price of the deal: the deal is held for every test (src/test-setup.ts)', () => {
    expect(dealState.held).toBe(true);
    const off: string[] = [];
    for (let d = 0; d < 366; d++) {
      const day = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
      dealState.day = day;
      for (const x of SUPPLIES) if (priceOf(s, x.id) !== x.price) off.push(`${day} ${x.id}`);
    }
    dealState.day = null;
    expect(off).toEqual([]);
    // and the lever is what does it: released, some day of the year sells a supply at the deal's price
    dealState.held = false;
    let deals = 0;
    for (let d = 0; d < 366; d++) {
      const day = new Date(Date.UTC(2026, 0, 1 + d)).toISOString().slice(0, 10);
      if (SUPPLIES.some((x) => priceOf(s, x.id, day) !== x.price)) deals++;
    }
    dealState.held = true;
    expect(deals).toBeGreaterThan(0);
  });

  it('a damaged count is none', () => {
    for (const bad of [-1, 1.5, '3', null]) { s.supplies = { glow: bad as never }; expect(stock(s, 'glow')).toBe(0); }
  });
});

describe('drinking', () => {
  beforeEach(() => { s.supplies = { speed: 2, jump: 1, glow: 1, funny: 3, compass: 1 }; });

  it('one less in the stock and a minute of its effect; the last one empties its place', () => {
    expect(drink(s, 'speed', land)).toEqual({ effect: 'speed' });
    expect([stock(s, 'speed'), left(s, 'speed')]).toEqual([1, EFFECT_SECONDS]);
    expect(drink(s, 'glow', land)).toEqual({ effect: 'glow' });
    expect('glow' in s.supplies!).toBe(false);
    expect(acting(s)).toEqual(['speed', 'glow']);
  });

  it('the same again adds a minute, no more than EFFECT_MAX; at the full time it is not spent', () => {
    s.supplies = { speed: 5 };
    for (let i = 0; i < 3; i++) drink(s, 'speed', land);
    expect(left(s, 'speed')).toBe(EFFECT_MAX);
    expect(drink(s, 'speed', land)).toEqual({ refused: 'full' });
    expect(stock(s, 'speed')).toBe(2);
    tick(s, 30);
    drink(s, 'speed', land);
    expect(left(s, 'speed')).toBe(EFFECT_MAX);
  });

  it('funny: tiny or a giant by chance; drunk again it keeps the size she has', () => {
    expect(drink(s, 'funny', { ...land, random: () => 0.7 })).toEqual({ effect: 'giant' });
    expect(drink(s, 'funny', { ...land, random: () => 0.1 })).toEqual({ effect: 'giant' });
    expect([left(s, 'giant'), left(s, 'tiny')]).toEqual([120, 0]);
    s.effects = {};
    expect(drink(s, 'funny', { ...land, random: () => 0.1 })).toEqual({ effect: 'tiny' });
  });

  it('what could do nothing now is not spent: none left, the jump in the water, the compass without stars or with all solved', () => {
    expect(drink(s, 'jump', { ...land, water: true })).toEqual({ refused: 'water' });
    expect(drink(s, 'compass', { ...land, mysteries: null })).toEqual({ refused: 'no-stars' });
    expect(drink(s, 'compass', { ...land, mysteries: 0 })).toEqual({ refused: 'all-found' });
    expect(stock(s, 'jump') + stock(s, 'compass')).toBe(2);
    s.supplies = {};
    expect(refusal(s, 'speed', land)).toBe('none');
    expect(drink(s, 'speed', land)).toEqual({ refused: 'none' });
    expect(s.effects).toBeUndefined();
  });
});

describe('the time of play', () => {
  it('runs down; the ones that end are told once and leave the save', () => {
    s.effects = { speed: 60, glow: 10, later: 5 };
    expect(tick(s, 10)).toEqual(['glow']);
    expect(s.effects).toEqual({ speed: 50 });
    expect(tick(s, 0)).toEqual([]);
    expect(tick(s, -5)).toEqual([]);
    expect(tick(s, 50)).toEqual(['speed']);
    expect(acting(s)).toEqual([]);
  });
});

describe('what the effects do to the tuning and to her size', () => {
  it('speed: speed and run from x1.5; jump: twice as high; tiny and giant: the camera with her size', () => {
    expect(tuningOf(['speed', 'jump'])).toEqual({ speed: 1.5, runFrom: 1.5, jump: Math.SQRT2 });
    expect(tuningOf(['tiny'])).toEqual({ camDist: 0.6 });
    expect(tuningOf(['giant'])).toEqual({ camDist: 1.5 });
    expect(tuningOf(['glow', 'compass'])).toEqual({});
  });

  it('a giant in a cramped place keeps her own size and camera; tiny shrinks anywhere', () => {
    expect([sizeOf(['giant'], false), sizeOf(['giant'], true), sizeOf(['tiny'], true), sizeOf(['speed'], false)]).toEqual([SCALE.giant, 1, SCALE.tiny, 1]);
    expect(tuningOf(['giant', 'speed'], true)).toEqual({ speed: 1.5, runFrom: 1.5 });
  });
});

describe('the stars the compass sees (PLAY-24, g.mystery)', () => {
  const view = (today: number, unsolved: number) => ({ today: Array(today).fill({}), unsolved: () => Array(unsolved).fill({}) });
  it('none today, or no g.mystery, or one without `today`: null - the compass is dimmed', () => {
    expect([mysteriesLeft(null), mysteriesLeft(view(0, 0)), mysteriesLeft({ unsolved: () => [] })]).toEqual([null, null, null]);
  });
  it('stars today: how many are left; all solved: 0 - the cat says so', () => {
    expect([mysteriesLeft(view(3, 2)), mysteriesLeft(view(3, 0))]).toEqual([2, 0]);
  });
});
