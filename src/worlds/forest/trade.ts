import type { Trades } from '../../game/trade';

/**
 * The asks of the Enchanted Forest's characters (PLAY-28, src/game/trade.ts; the customer's word of 2026-11-22, «А»):
 * each two of the forest's own finds (./collect.ts: cones and bilberries) - for stars or a thing the shop has not - and
 * one "far" ask, finds of the Fairy Kingdom or the golden feather of the Great Tree (both open once the forest is). The
 * things: Borovik's fly-agaric hat for her, Mudrena's leaf scarf for the owlet (asked only once it is found). A thing is
 * given once: after that its ask is not made.
 * The lines: `<id>_trade_ask`, `<id>_trade_far`, `<id>_trade_thanks` in ./strings.ts, said in the character's voice.
 */
export const TRADES: Trades = {
  borovik: [
    { id: 'hat', need: { cone: 3 }, gives: { item: 'mushroom_hat' } },
    { id: 'pantry', need: { cone: 2, berry: 2 }, gives: 'stars' },
    { id: 'far', need: { mushroom: 2 }, gives: 'stars', far: true },
  ],
  mudrena: [
    { id: 'scarf', need: { berry: 3 }, gives: { item: 'owlet_leaf_scarf' } },
    { id: 'cones', need: { cone: 3 }, gives: 'stars' },
    { id: 'far', need: { treefeather: 1 }, gives: 'stars', far: true },
  ],
  shustrik: [
    { id: 'winter', need: { cone: 4 }, gives: 'stars' },
    { id: 'hoard', need: { cone: 2, berry: 1 }, gives: 'stars' },
    { id: 'far', need: { acorn: 2 }, gives: 'stars', far: true },
  ],
  yasen: [
    { id: 'roots', need: { berry: 3 }, gives: 'stars' },
    { id: 'glade', need: { berry: 2, cone: 2 }, gives: 'stars' },
    { id: 'far', need: { butterfly: 1 }, gives: 'stars', far: true },
  ],
  kolyuchka: [
    { id: 'needles', need: { berry: 4 }, gives: 'stars' },
    { id: 'snack', need: { berry: 2, cone: 1 }, gives: 'stars' },
    { id: 'far', need: { feather: 1 }, gives: 'stars', far: true },
  ],
};
