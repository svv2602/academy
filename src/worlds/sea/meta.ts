import type { WorldInfo } from '../../game/world';

/**
 * What the game knows of the sea before she enters it (src/worlds/index.ts): its place on the shelf, its secrets and
 * the kinds of its finds - the hub's arches, its keepsakes and the shelf of the book read them while the sea's own code
 * (./index.ts) is not loaded yet (TECH-09: it is a next world's, downloaded with its files). Data only: nothing here may
 * import three or the world's code, or the core would carry the world again.
 */
export const SEA_INFO: WorldInfo = {
  id: 'sea', shelf: 2, secrets: ['ship_chest', 'bubble_lift', 'echo_shells', 'whale'],   // ./secrets.ts SEA_SECRETS (src/worlds/meta.test.ts holds them equal)
  // the kinds of the finds of ./collect.ts COLLECT, in its order (src/worlds/meta.test.ts holds them equal)
  collect: { items: [...Array(6).fill({ kind: 'shell' }), ...Array(6).fill({ kind: 'coral' })] },
};
