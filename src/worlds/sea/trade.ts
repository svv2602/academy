import type { Trades } from '../../game/trade';

/**
 * The asks of the sea's characters (PLAY-28, src/game/trade.ts; the customer's word of 2026-11-23): each two of the sea's
 * own finds (./collect.ts: spiral shells and coral twigs) - for stars or a thing the shop has not - and one "far" ask,
 * finds of another open world: the forest's (open whenever the sea is), the Fairy Kingdom's or the golden feather of the
 * Great Tree. The thing: Khvylia's shell tiara for her. A thing is given once: after that its ask is not made.
 * The lines: `<id>_trade_ask`, `<id>_trade_far`, `<id>_trade_thanks` in ./strings.ts, said in the character's voice.
 */
export const TRADES: Trades = {
  khvylia: [
    { id: 'tiara', need: { shell: 3 }, gives: { item: 'shell_tiara' } },
    { id: 'song', need: { shell: 2, coral: 2 }, gives: 'stars' },
    { id: 'far', need: { treefeather: 1 }, gives: 'stars', far: true },
  ],
  bulk: [
    { id: 'reef', need: { coral: 3 }, gives: 'stars' },
    { id: 'shells', need: { shell: 3 }, gives: 'stars' },
    { id: 'far', need: { cone: 2 }, gives: 'stars', far: true },
  ],
  pantsyr: [
    { id: 'hundred', need: { coral: 4 }, gives: 'stars' },
    { id: 'shelf', need: { coral: 2, shell: 1 }, gives: 'stars' },
    { id: 'far', need: { berry: 2 }, gives: 'stars', far: true },
  ],
  kleshnya: [
    { id: 'soup', need: { shell: 4 }, gives: 'stars' },
    { id: 'pot', need: { shell: 2, coral: 2 }, gives: 'stars' },
    { id: 'far', need: { mushroom: 2 }, gives: 'stars', far: true },
  ],
  iskorka: [
    { id: 'glow', need: { coral: 3 }, gives: 'stars' },
    { id: 'shine', need: { shell: 2, coral: 1 }, gives: 'stars' },
    { id: 'far', need: { butterfly: 1 }, gives: 'stars', far: true },
  ],
};
