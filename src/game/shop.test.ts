import { describe, expect, it } from 'vitest';
import { defaultSave, defaultWorld } from '../core/save';
import type { Save } from '../core/save';
import { CATALOG, buy, canBuy, equip, has, item, itemState, unlocked } from './shop';
import { GEAR } from './gear';
import type { Slot } from './shop';

/** A fresh save with some stars and, when asked, the first world finished. */
function save(stars: number, final = false): Save {
  const s = defaultSave();
  s.stars = stars;
  if (final) s.worlds.fairy = { ...defaultWorld(), final: true };
  return s;
}
const copy = (s: Save) => JSON.parse(JSON.stringify(s)) as Save;

describe('the catalog of the first shop (PLAY-04, decisions of 2026-11-15)', () => {
  it('sells 5 to 8 things (decision Q3)', () => {
    const sold = CATALOG.filter((i) => i.price !== undefined);
    expect(sold.length).toBeGreaterThanOrEqual(5);
    expect(sold.length).toBeLessThanOrEqual(8);
  });

  it('has the things and prices the customer chose', () => {
    expect(Object.fromEntries(CATALOG.map((i) => [i.id, [i.slot, i.price ?? i.reward ?? 'free']]))).toEqual({
      wand_star: ['wand', 10], wings_butterfly: ['wings', 15], wreath: ['head', 15], crown: ['head', 30],
      wizard_hat: ['head', 30], trail_sparkle: ['trail', 40],
      wand_crystal: ['wand', 'crystal'], earrings_star: ['head', 'three_secrets'], wings_petals: ['wings', 'free'],
      tiara: ['head', 'free'], wizard_cap: ['head', 'free'], elf_ears: ['head', 'free'],
      wand_flower: ['wand', 'free'], wand_moon: ['wand', 'free'], wand_leaf: ['wand', 'free'],
      // the gifts of the characters for a trade (PLAY-28, the customer's word of 2026-11-21)
      feather_crown: ['head', 'trade'], acorn_cap: ['head', 'trade'],
      // the forest's (the customer's word of 2026-11-22)
      mushroom_hat: ['head', 'trade'],
      // the sea's (the customer's word of 2026-11-23)
      shell_tiara: ['head', 'trade'],
    });
  });

  it('every thing has one way to get it: a price, a reward or free', () => {
    for (const i of CATALOG) expect([i.price !== undefined, !!i.reward, !!i.free].filter(Boolean), i.id).toHaveLength(1);
    expect(new Set(CATALOG.map((i) => i.id)).size).toBe(CATALOG.length);
  });

  // The ✨ tab (the trail) has one thing, at 40: the customer's prices leave it without a cheap one (see PROGRESS).
  it.each(['wand', 'wings', 'head'] as Slot[])('the %s tab has a thing for 15 stars or less, or a free one', (slot) => {
    const cheap = CATALOG.filter((i) => i.slot === slot && (i.free || (i.price !== undefined && i.price <= 15)));
    expect(cheap.length).toBeGreaterThan(0);
  });

  it('an id the catalog does not know is no thing: not hers, not for sale, not to wear', () => {
    const s = save(100);
    expect(item('hat')).toBeUndefined();
    expect(has(s, 'hat')).toBe(false);
    expect(buy(s, 'hat')).toBe(false);
    expect(equip(s, 'head', 'hat')).toBe(false);
    expect(itemState(s, 'hat')).toBeUndefined();
    expect(s).toEqual(save(100));
  });
});

describe('buying (PLAY-04 acceptance: enough / not enough stars, no second purchase)', () => {
  it('enough stars: the thing is bought, exactly its price is taken, and it is hers', () => {
    const s = save(25);
    expect(canBuy(s, 'wreath')).toBe(true);
    expect(buy(s, 'wreath')).toBe(true);
    expect(s.stars).toBe(10);
    expect(s.owned).toEqual(['wreath']);
    expect(has(s, 'wreath')).toBe(true);
  });

  it('exactly the price is enough, and leaves no stars', () => {
    const s = save(10);
    expect(buy(s, 'wand_star')).toBe(true);
    expect(s.stars).toBe(0);
  });

  it('not enough stars: refused, the save is left as it was', () => {
    const s = save(14);
    expect(canBuy(s, 'wreath')).toBe(false);
    expect(buy(s, 'wreath')).toBe(false);
    expect(s).toEqual(save(14));
  });

  it('a second purchase is impossible: refused, no stars taken, the thing stays hers', () => {
    const s = save(70);           // enough for two crowns: only "already hers" can refuse the second
    expect(buy(s, 'crown')).toBe(true);
    const after = copy(s);
    expect(canBuy(s, 'crown')).toBe(false);
    expect(buy(s, 'crown')).toBe(false);
    expect(s).toEqual(after);
    expect(s.stars).toBe(40);
    expect(s.owned).toEqual(['crown']);
  });

  it('a thing that is not sold cannot be bought, whatever the stars', () => {
    for (const id of ['wand_crystal', 'earrings_star', 'wings_petals']) {
      const s = save(1000, true);
      expect(canBuy(s, id), id).toBe(false);
      expect(buy(s, id), id).toBe(false);
      expect(s).toEqual(save(1000, true));
    }
  });

  it('asking changes nothing: canBuy, has, unlocked and itemState leave the save as it was', () => {
    const s = save(12);
    for (const i of CATALOG) { canBuy(s, i.id); has(s, i.id); unlocked(s, i.id); itemState(s, i.id); }
    expect(s).toEqual(save(12));
    expect(s.worlds).toEqual({});
  });

  it('what is bought stays: buying more keeps every earlier thing, and the stars never go below 0 (R02)', () => {
    const s = save(140);
    for (const i of CATALOG) buy(s, i.id);
    expect(s.stars).toBe(0);
    expect(s.owned.sort()).toEqual(['crown', 'trail_sparkle', 'wand_star', 'wings_butterfly', 'wizard_hat', 'wreath']);
    for (const id of s.owned) expect(has(s, id)).toBe(true);
  });
});

describe('rewards: found or earned, not bought (R03, R17)', () => {
  it('the crystal wand is closed until the Crystal of Light is restored', () => {
    const s = save(0);
    expect(unlocked(s, 'wand_crystal')).toBe(false);
    expect(has(s, 'wand_crystal')).toBe(false);
    s.worlds.fairy = { ...defaultWorld(), quests: { q1: 3, q2: 3 } };
    expect(unlocked(s, 'wand_crystal')).toBe(false);
  });

  it('the crystal wand opens with the first world\'s final, free', () => {
    const s = save(0, true);
    expect(unlocked(s, 'wand_crystal')).toBe(true);
    expect(has(s, 'wand_crystal')).toBe(true);
    expect(equip(s, 'wand', 'wand_crystal')).toBe(true);
    expect(s.stars).toBe(0);
  });

  it('the star earrings stay a silhouette until "three secrets" (PLAY-08), even with every world finished and other achievements', () => {
    const s = save(500, true);
    s.achievements = { first_shard: 1, secret_chest: 1, first_artifact: 1 };
    expect(unlocked(s, 'earrings_star')).toBe(false);
    expect(itemState(s, 'earrings_star')).toEqual({ kind: 'silhouette', reward: 'three_secrets' });
  });

  it('the star earrings open with the achievement "three secrets" (PLAY-08), free', () => {
    const s = save(0);
    s.achievements = { three_secrets: 1 };
    expect(unlocked(s, 'earrings_star')).toBe(true);
    expect(has(s, 'earrings_star')).toBe(true);
    expect(itemState(s, 'earrings_star')?.kind).not.toBe('silhouette');
    expect(s.stars).toBe(0);
  });

  it('the petal wings are hers from the start, and worn', () => {
    expect(has(save(0), 'wings_petals')).toBe(true);
    expect(itemState(save(0), 'wings_petals')).toEqual({ kind: 'owned', worn: true });
  });
});

describe('how the screen shows a thing (R14, R17)', () => {
  it('not enough stars: the thing is shown with its price and the stars still needed', () => {
    expect(itemState(save(4), 'wreath')).toEqual({ kind: 'price', price: 15, short: 11 });
    expect(itemState(save(15), 'wreath')).toEqual({ kind: 'price', price: 15, short: 0 });
    expect(itemState(save(99), 'wreath')).toEqual({ kind: 'price', price: 15, short: 0 });
  });

  it('a bought thing is hers, worn once she puts it on', () => {
    const s = save(15);
    buy(s, 'wreath');
    expect(itemState(s, 'wreath')).toEqual({ kind: 'owned', worn: false });
    equip(s, 'head', 'wreath');
    expect(itemState(s, 'wreath')).toEqual({ kind: 'owned', worn: true });
  });

  it('the crystal wand before the final shows its reward; after it, it is hers', () => {
    expect(itemState(save(0), 'wand_crystal')).toEqual({ kind: 'reward', reward: 'crystal' });
    expect(itemState(save(0, true), 'wand_crystal')).toEqual({ kind: 'owned', worn: false });
  });
});

describe('wearing (PLAY-05)', () => {
  it('a fresh save wears the petal wings and nothing else', () => {
    expect(defaultSave().gear).toEqual({ head: null, wand: null, wings: 'wings_petals', trail: null });
  });

  it('a thing she does not have cannot be worn: refused, the gear left as it was', () => {
    const s = save(100);
    expect(equip(s, 'head', 'crown')).toBe(false);
    expect(equip(s, 'wand', 'wand_crystal')).toBe(false);
    expect(equip(s, 'head', 'earrings_star')).toBe(false);
    expect(s.gear).toEqual(defaultSave().gear);
  });

  it('a thing goes only on its own slot', () => {
    const s = save(15);
    buy(s, 'wreath');
    expect(equip(s, 'wand', 'wreath')).toBe(false);
    expect(equip(s, 'head', 'wreath')).toBe(true);
    expect(s.gear).toEqual({ ...defaultSave().gear, head: 'wreath' });
  });

  it('a slot can be emptied: no wings at all, and the petal wings back', () => {
    const s = save(0);
    expect(equip(s, 'wings', null)).toBe(true);
    expect(s.gear.wings).toBeNull();
    expect(equip(s, 'wings', 'wings_petals')).toBe(true);
    expect(s.gear.wings).toBe('wings_petals');
  });

  it('taking a thing off keeps it hers', () => {
    const s = save(40);
    buy(s, 'trail_sparkle');
    equip(s, 'trail', 'trail_sparkle');
    equip(s, 'trail', null);
    expect(has(s, 'trail_sparkle')).toBe(true);
    expect(s.owned).toEqual(['trail_sparkle']);
  });
});

describe('the things of the looks (PLAY-06, R27: simple free versions, the full ones stay in the shop)', () => {
  const LOOK_THINGS = ['tiara', 'wizard_cap', 'elf_ears', 'wand_flower', 'wand_moon', 'wand_leaf'];

  it('are free, marked as things of a look, have no price and no reward, and hang on a bone', () => {
    expect(CATALOG.filter((i) => i.look).map((i) => i.id).sort()).toEqual([...LOOK_THINGS].sort());
    for (const id of LOOK_THINGS) {
      const it = item(id)!;
      expect(it.free, id).toBe(true);
      expect(it.price, id).toBeUndefined();
      expect(it.reward, id).toBeUndefined();
      expect(GEAR[id as keyof typeof GEAR].slot, id).toBe(it.slot);
      expect(GEAR[id as keyof typeof GEAR].bone, id).not.toBeNull();
    }
  });

  it('are hers from the start, shown as hers (no price), and cannot be bought for any stars', () => {
    const s = save(1000);
    for (const id of LOOK_THINGS) {
      expect(has(s, id), id).toBe(true);
      expect(itemState(s, id), id).toEqual({ kind: 'owned', worn: false });
      expect(canBuy(s, id), id).toBe(false);
      expect(buy(s, id), id).toBe(false);
    }
    expect(s.stars).toBe(1000);
    expect(s.owned).toEqual([]);
  });

  it('are put on and taken off in the fitting room like any other thing, and stay hers', () => {
    const s = save(0);
    for (const id of LOOK_THINGS) {
      const slot = item(id)!.slot;
      expect(equip(s, slot, id), id).toBe(true);
      expect(s.gear[slot]).toBe(id);
      expect(itemState(s, id)).toEqual({ kind: 'owned', worn: true });
      expect(equip(s, slot, null)).toBe(true);
      expect(s.gear[slot]).toBeNull();
      expect(has(s, id)).toBe(true);
    }
    expect(equip(s, 'wand', 'tiara')).toBe(false);
  });

  it('the full things are still sold or given as they were: the crown, the hat, the star and crystal wands, the earrings', () => {
    expect(item('crown')!.price).toBe(30);
    expect(item('wizard_hat')!.price).toBe(30);
    expect(item('wand_star')!.price).toBe(10);
    expect(item('wand_crystal')!.reward).toBe('crystal');
    expect(item('earrings_star')!.reward).toBe('three_secrets');
  });
});
