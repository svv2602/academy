import type { WorldInfo } from '../../game/world';

/**
 * What the game knows of the forest before she enters it (src/worlds/index.ts): its place on the shelf, its secrets and
 * the kinds of its finds - the hub's arches, its keepsakes and the shelf of the book read them while the forest's own
 * code (./index.ts) is not loaded yet (TECH-09: it is a next world's, downloaded with its files). Data only: nothing
 * here may import three or the world's code, or the core would carry the world again.
 */
export const FOREST_INFO: WorldInfo = {
  id: 'forest', shelf: 1, secrets: ['cave', 'bounce', 'fireflies', 'ring', 'roots', 'hollow'],   // ./secrets.ts FOREST_SECRETS (src/worlds/meta.test.ts holds them equal)
  // the kinds of the finds of ./collect.ts COLLECT, in its order (src/worlds/meta.test.ts holds them equal)
  collect: { items: [...Array(6).fill({ kind: 'cone' }), ...Array(6).fill({ kind: 'berry' }), ...Array(9).fill({ kind: 'piece' })] },
};
