import type { Trades } from '../../game/trade';

/**
 * The asks of the Fairy Kingdom's characters (PLAY-28, src/game/trade.ts): each two of its own finds - for stars or a
 * thing the shop has not - and one "far" ask, the golden feather of the Great Tree (the hub's find of the day), the only
 * finds of another world so far (the lead's word of 2026-11-21). A thing is given once: after that its ask is not made.
 * The lines: `<id>_trade_ask`, `<id>_trade_far`, `<id>_trade_thanks` in ./strings.ts, said in the character's voice.
 */
export const TRADES: Trades = {
  unicorn: [
    { id: 'butterflies', need: { butterfly: 3 }, gives: 'stars' },
    { id: 'meadow', need: { butterfly: 2, mushroom: 1 }, gives: 'stars' },
    { id: 'far', need: { treefeather: 1 }, gives: 'stars', far: true },
  ],
  fox: [
    { id: 'acorns', need: { acorn: 3 }, gives: { item: 'acorn_cap' } },
    { id: 'winter', need: { acorn: 2, mushroom: 2 }, gives: 'stars' },
    { id: 'far', need: { treefeather: 1 }, gives: 'stars', far: true },
  ],
  mushking: [
    { id: 'soup', need: { mushroom: 3 }, gives: 'stars' },
    { id: 'feast', need: { mushroom: 2, acorn: 2 }, gives: 'stars' },
    { id: 'far', need: { treefeather: 2 }, gives: 'stars', far: true },
  ],
  deer: [
    { id: 'bow', need: { feather: 2, acorn: 1 }, gives: { item: 'fawn_leaf_bow' } },
    { id: 'acorns', need: { acorn: 4 }, gives: 'stars' },
    { id: 'far', need: { treefeather: 1 }, gives: 'stars', far: true },
  ],
  queen: [
    { id: 'crown', need: { feather: 4, butterfly: 1 }, gives: { item: 'feather_crown' } },
    { id: 'ball', need: { feather: 2, butterfly: 2 }, gives: 'stars' },
    { id: 'far', need: { treefeather: 1 }, gives: 'stars', far: true },
  ],
};
