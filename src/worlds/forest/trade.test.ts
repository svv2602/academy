// @vitest-environment happy-dom
/** The asks of the forest's characters (./trade.ts, PLAY-28; the customer's word of 2026-11-22, «А»). */
import { describe, expect, it, vi } from 'vitest';
import { defaultSave, type Save } from '../../core/save';
import { COLLECT_KINDS } from '../../game/collections';
import { GEAR } from '../../game/gear';
import { PET_GEAR } from '../../game/petgear';
import { item, petItem } from '../../game/shop';
import { shownOffers, tradeProblems } from '../../game/trade';
import { FRIENDS } from './index';
import { strings } from './strings';
import { TRADES } from './trade';

// the world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed for its asks
vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

const save = (worlds: string[], pets: string[] = []): Save => {
  const s = defaultSave();
  s.worlds = Object.fromEntries(worlds.map((w) => [w, { quests: {}, final: false, starsTaken: [], flags: {}, pos: null }])) as Save['worlds'];
  if (pets.length) s.pets = pets as Save['pets'];
  return s;
};

describe('the asks of the forest', () => {
  it('every character of a chain: two asks of the forest\'s cones and bilberries (2-5), one far (1-2)', () => {
    expect(tradeProblems(TRADES, 'forest')).toEqual([]);
    expect(Object.keys(TRADES).sort()).toEqual(FRIENDS.map((f) => f.id).sort());
    for (const offers of Object.values(TRADES)) {
      const own = offers.filter((o) => !o.far), far = offers.filter((o) => o.far);
      expect(own).toHaveLength(2);
      expect(far).toHaveLength(1);
      for (const o of own) for (const k of Object.keys(o.need)) expect(COLLECT_KINDS[k as keyof typeof COLLECT_KINDS].world).toBe('forest');
    }
  });

  it('the far asks are of the worlds open whenever the forest is: the Fairy Kingdom and the Great Tree', () => {
    const s = save(['fairy', 'forest', 'hub']);
    for (const offers of Object.values(TRADES)) {
      for (const o of offers.filter((x) => x.far)) for (const k of Object.keys(o.need)) expect(['fairy', 'hub']).toContain(COLLECT_KINDS[k as keyof typeof COLLECT_KINDS].world);
      expect(shownOffers(s, offers).filter((o) => o.far)).toHaveLength(1);
    }
  });

  it('the things: Borovik\'s fly-agaric hat for her, Mudrena\'s leaf scarf for the owlet - asked only once it is found', () => {
    const things = Object.values(TRADES).flat().flatMap((o) => (o.gives === 'stars' ? [] : [o.gives.item])).sort();
    expect(things).toEqual(['mushroom_hat', 'owlet_leaf_scarf']);
    expect(item('mushroom_hat')).toMatchObject({ reward: 'trade' });
    expect('mushroom_hat' in GEAR).toBe(true);
    expect(petItem('owlet_leaf_scarf')).toMatchObject({ pet: 'owlet', reward: 'trade' });
    expect('owlet_leaf_scarf' in PET_GEAR).toBe(true);
    const scarf = (s: Save) => shownOffers(s, TRADES.mudrena).some((o) => o.id === 'scarf');
    expect(scarf(save(['fairy', 'forest', 'hub']))).toBe(false);
    expect(scarf(save(['fairy', 'forest', 'hub'], ['owlet']))).toBe(true);
  });

  it('every character says its ask, its far ask and its thanks, in both languages, spoken', () => {
    const spoken = strings.spoken as Record<string, string>;
    for (const lang of ['uk', 'ru'] as const) {
      const table = strings.table[lang] as Record<string, string>;
      for (const who of Object.keys(TRADES)) for (const k of ['ask', 'far', 'thanks']) {
        expect(table[`${who}_trade_${k}`], `${lang} ${who}_trade_${k}`).toBeTruthy();
        expect(spoken[`${who}_trade_${k}`], `${who}_trade_${k}`).toBeTruthy();
      }
    }
  });
});
