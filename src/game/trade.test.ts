/** The trades of the characters (./trade.ts, PLAY-28): asks of open worlds only, nothing spent when short, once a day. */
import { describe, expect, it } from 'vitest';
import { defaultSave, type Save, type WorldState } from '../core/save';
import { canTrade, shownOffers, todayOffer, trade, tradeProblems, tradeSums, tradedToday, type Offer } from './trade';
import { addToStash, inStash } from './stash';
import { has, item, itemState, petItem, petItemState } from './shop';
import { TRADES } from '../worlds/fairy/trade';
import { FRIENDS } from '../worlds/fairy/characters';
import { strings as fairyStrings } from '../worlds/fairy/strings';
import { GEAR } from './gear';
import { PET_GEAR } from './petgear';

const fresh = (): WorldState => ({ quests: {}, final: false, starsTaken: [], flags: {}, pos: null });
const save = (worlds: string[], pets: string[] = []): Save => {
  const s = defaultSave();
  s.worlds = Object.fromEntries(worlds.map((w) => [w, fresh()]));
  if (pets.length) s.pets = pets as Save['pets'];
  return s;
};
const OWN: Offer = { id: 'own', need: { acorn: 3 }, gives: 'stars' };
const FAR: Offer = { id: 'far', need: { treefeather: 1 }, gives: 'stars', far: true };
const CAP: Offer = { id: 'cap', need: { acorn: 2 }, gives: { item: 'acorn_cap' } };
const BOW: Offer = { id: 'bow', need: { feather: 2 }, gives: { item: 'fawn_leaf_bow' } };
const DAY = '2026-11-21', NEXT = '2026-11-22';

describe('which asks are made', () => {
  it('an ask with a find of a world not open is never chosen (nothing she cannot make)', () => {
    expect(shownOffers(save(['fairy']), [OWN, FAR])).toEqual([OWN]);
    expect(shownOffers(save(['fairy', 'hub']), [OWN, FAR])).toEqual([OWN, FAR]);
    // over many days a character of the fairy world alone never asks for the feather of the Great Tree
    const s = save(['fairy']);
    for (let d = 1; d <= 28; d++) expect(todayOffer(s, s.worlds.fairy, 'fox', [OWN, FAR], `2026-11-${String(d).padStart(2, '0')}`)).toBe(OWN);
  });

  it('a thing is given once: then its ask is not made; a thing of a pet not found is not asked for', () => {
    const s = save(['fairy']);
    expect(shownOffers(s, [CAP, BOW])).toEqual([CAP]);               // no fawn yet
    s.pets = ['fawn'] as Save['pets'];
    expect(shownOffers(s, [CAP, BOW])).toEqual([CAP, BOW]);
    s.owned.push('acorn_cap');
    expect(shownOffers(s, [CAP, BOW])).toEqual([BOW]);
  });

  it('one ask a character a day, the same all day; asking changes nothing', () => {
    const s = save(['fairy', 'hub']), ws = s.worlds.fairy, before = JSON.stringify(s);
    const a = todayOffer(s, ws, 'fox', [OWN, FAR, CAP], DAY);
    for (let i = 0; i < 5; i++) expect(todayOffer(s, ws, 'fox', [OWN, FAR, CAP], DAY)).toBe(a);
    expect(JSON.stringify(s)).toBe(before);
    // different days and characters do not all get the same ask
    const seen = new Set<string>();
    for (let d = 1; d <= 20; d++) for (const who of ['fox', 'deer']) seen.add(todayOffer(s, ws, who, [OWN, FAR, CAP], `2026-12-${String(d).padStart(2, '0')}`)!.id);
    expect(seen.size).toBe(3);
  });
});

describe('a trade', () => {
  it('is impossible when the finds are short, and then spends nothing', () => {
    const s = save(['fairy']), ws = s.worlds.fairy;
    addToStash(s, 'acorn', 2);
    expect(canTrade(s, ws, 'fox', OWN, DAY)).toBe(false);
    expect(trade(s, ws, 'fox', OWN, DAY)).toBeNull();
    expect(inStash(s, 'acorn')).toBe(2);
    expect(ws.trade).toBeUndefined();
    expect(tradeSums(s, OWN)).toEqual([{ kind: 'acorn', have: 2, need: 3, left: null }]);
  });

  it('takes exactly the ask, gives the thing once, and marks the day: no second trade with her today, one tomorrow', () => {
    const s = save(['fairy']), ws = s.worlds.fairy;
    addToStash(s, 'acorn', 5); addToStash(s, 'mushroom', 1);
    expect(tradeSums(s, CAP)).toEqual([{ kind: 'acorn', have: 5, need: 2, left: 3 }]);   // "у тебе 5 → залишиться 3"
    expect(trade(s, ws, 'fox', CAP, DAY)).toEqual({ item: 'acorn_cap' });
    expect(inStash(s, 'acorn')).toBe(3);
    expect(inStash(s, 'mushroom')).toBe(1);
    expect(s.owned.filter((x) => x === 'acorn_cap')).toEqual(['acorn_cap']);
    expect(has(s, 'acorn_cap')).toBe(true);
    expect(tradedToday(ws, 'fox', DAY)).toBe(true);
    expect(todayOffer(s, ws, 'fox', [OWN, CAP], DAY)).toBeNull();
    expect(trade(s, ws, 'fox', OWN, DAY)).toBeNull();                // once a day
    expect(inStash(s, 'acorn')).toBe(3);
    // another character the same day
    expect(trade(s, ws, 'deer', { id: 'a', need: { acorn: 2 }, gives: 'stars' }, DAY)).toBe('stars');
    expect(ws.trade).toEqual({ day: DAY, done: ['fox', 'deer'] });
    // tomorrow: the cap is hers, so only the other ask
    expect(todayOffer(s, ws, 'fox', [OWN, CAP], NEXT)).toBe(OWN);
    // stars are no part of a trade's own work: the caller adds them (addStars)
    expect(s.stars).toBe(defaultSave().stars);
  });

  it('a damaged day of trades is mended where read', () => {
    const s = save(['fairy']), ws = s.worlds.fairy;
    ws.trade = { day: DAY, done: 'fox' as unknown as string[] };
    expect(tradedToday(ws, 'fox', DAY)).toBe(false);
    addToStash(s, 'acorn', 3);
    expect(trade(s, ws, 'fox', OWN, DAY)).toBe('stars');
    expect(ws.trade).toEqual({ day: DAY, done: ['fox'] });
  });
});

describe('the asks of the fairy world', () => {
  it('every character of a chain has two asks of its own finds (2-5) and one far one (1-2)', () => {
    expect(tradeProblems(TRADES, 'fairy')).toEqual([]);
    expect(Object.keys(TRADES).sort()).toEqual(FRIENDS.map((f) => f.id).sort());
    for (const offers of Object.values(TRADES)) {
      expect(offers.filter((o) => !o.far)).toHaveLength(2);
      expect(offers.filter((o) => o.far)).toHaveLength(1);
    }
  });

  it('the far asks are for the golden feather of the Great Tree, the only finds of another world so far', () => {
    for (const offers of Object.values(TRADES)) for (const o of offers.filter((x) => x.far)) expect(Object.keys(o.need)).toEqual(['treefeather']);
  });

  it('the things given are the three gifts: never sold, modelled, shown "від жителя" until hers', () => {
    const things = Object.values(TRADES).flat().flatMap((o) => (o.gives === 'stars' ? [] : [o.gives.item])).sort();
    expect(things).toEqual(['acorn_cap', 'fawn_leaf_bow', 'feather_crown']);
    const s = save(['fairy'], ['fawn']);
    for (const id of ['acorn_cap', 'feather_crown']) {
      expect(item(id)).toMatchObject({ reward: 'trade' });
      expect(item(id)!.price).toBeUndefined();
      expect(id in GEAR).toBe(true);
      expect(itemState(s, id)).toEqual({ kind: 'reward', reward: 'trade' });
    }
    expect(petItem('fawn_leaf_bow')).toMatchObject({ pet: 'fawn', reward: 'trade' });
    expect('fawn_leaf_bow' in PET_GEAR).toBe(true);
    expect(petItemState(s, 'fawn_leaf_bow')).toEqual({ kind: 'trade' });
    s.owned.push('fawn_leaf_bow');
    expect(petItemState(s, 'fawn_leaf_bow')).toEqual({ kind: 'owned', worn: false });
  });

  it('every character says its ask, its far ask and its thanks, in both languages', () => {
    for (const lang of ['uk', 'ru'] as const) {
      const table = fairyStrings.table[lang] as Record<string, string>;
      for (const who of Object.keys(TRADES)) for (const k of ['ask', 'far', 'thanks']) expect(table[`${who}_trade_${k}`], `${lang} ${who}_trade_${k}`).toBeTruthy();
    }
  });
});
