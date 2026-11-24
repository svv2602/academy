// @vitest-environment happy-dom
/** The asks of the sea's characters (./trade.ts, PLAY-28; the customer's word of 2026-11-23). */
import { describe, expect, it, vi } from 'vitest';
import { defaultSave, type Save } from '../../core/save';
import { COLLECT_KINDS } from '../../game/collections';
import { GEAR } from '../../game/gear';
import { item } from '../../game/shop';
import { shownOffers, tradeProblems } from '../../game/trade';
import { FRIENDS } from './index';
import { strings } from './strings';
import { TRADES } from './trade';

// the world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed for its asks
vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

const save = (worlds: string[]): Save => {
  const s = defaultSave();
  s.worlds = Object.fromEntries(worlds.map((w) => [w, { quests: {}, final: false, starsTaken: [], flags: {}, pos: null }])) as Save['worlds'];
  return s;
};
const worldOf = (k: string) => COLLECT_KINDS[k as keyof typeof COLLECT_KINDS].world;

describe('the asks of the sea', () => {
  it('every character of a chain: two asks of the sea\'s shells and coral twigs (2-5), one far (1-2)', () => {
    expect(tradeProblems(TRADES, 'sea')).toEqual([]);
    expect(Object.keys(TRADES).sort()).toEqual(FRIENDS.map((f) => f.id).sort());
    for (const offers of Object.values(TRADES)) {
      const own = offers.filter((o) => !o.far), far = offers.filter((o) => o.far);
      expect(own).toHaveLength(2);
      expect(far).toHaveLength(1);
      for (const o of own) for (const k of Object.keys(o.need)) expect(worldOf(k)).toBe('sea');
    }
  });

  it('the far asks are of the worlds open whenever the sea is - the forest, the Fairy Kingdom, the Great Tree - each of them asked', () => {
    // the sea's arch wakes once the forest is done (src/worlds/hub/portals.ts): a save with the sea has the three
    const s = save(['fairy', 'hub', 'forest', 'sea']);
    const farWorlds = new Set<string>();
    for (const offers of Object.values(TRADES)) {
      for (const o of offers.filter((x) => x.far)) for (const k of Object.keys(o.need)) { expect(['forest', 'fairy', 'hub']).toContain(worldOf(k)); farWorlds.add(worldOf(k)); }
      expect(shownOffers(s, offers).filter((o) => o.far)).toHaveLength(1);
    }
    expect([...farWorlds].sort()).toEqual(['fairy', 'forest', 'hub']);
  });

  it('the thing: Khvylia\'s shell tiara for her, a thing of the head, given once', () => {
    const things = Object.values(TRADES).flat().flatMap((o) => (o.gives === 'stars' ? [] : [o.gives.item])).sort();
    expect(things).toEqual(['shell_tiara']);
    expect(item('shell_tiara')).toMatchObject({ slot: 'head', reward: 'trade' });
    expect(GEAR.shell_tiara).toEqual({ slot: 'head', bone: 'Head' });
    const tiara = (s: Save) => shownOffers(s, TRADES.khvylia).some((o) => o.id === 'tiara');
    const s = save(['fairy', 'hub', 'forest', 'sea']);
    expect(tiara(s)).toBe(true);
    s.owned.push('shell_tiara');
    expect(tiara(s)).toBe(false);
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
