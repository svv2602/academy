import type { Spot } from './player';
import type { Npc } from './world';

/** m over a character's feet its figure is taken to reach when its mark is not placed yet (a frame before the first). */
const TOP_AT_LEAST = 1.2;

/**
 * The spot of talk of a character, the same in every world: the action button within `r` m, a tap on it walks her there
 * (src/game/player.ts: a tap on its figure always, near it only by `talkByTap`). `done` - its chain is finished; its
 * figure is taken up to the mark over its head (placed every frame by the world, visible or not), so a tap on the mark
 * is a tap on it.
 */
export function talkSpot(n: Npc, done: () => boolean, run: () => void, r = 3.0): Spot {
  return {
    pos: n.pos, r, label: 'talk', on: () => true, run,
    talker: { done, top: () => Math.max(TOP_AT_LEAST, n.mark.position.y - n.pos.y) },
  };
}
