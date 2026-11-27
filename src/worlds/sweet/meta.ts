import type { WorldInfo } from '../../game/world';

/**
 * What the game knows of the Sweet Land before she enters it (src/worlds/index.ts): its place on the shelf and its
 * secrets and the kinds of its finds - the hub's arches, its keepsakes and the shelf of the book read them while its own code (./index.ts) is not
 * loaded yet. Data only: nothing here may import three or the world's code.
 */
export const SWEET_INFO: WorldInfo = {
  id: 'sweet', shelf: 3, secrets: ['candy_box', 'cotton_cloud', 'lemonade', 'bubble_gum', 'choco_cave', 'ginger_room'],   // ./secrets.ts SWEET_SECRETS
  // ./collect.ts COLLECT: its kinds and how many (src/worlds/meta.test.ts holds them equal)
  collect: { items: [...Array(6).fill({ kind: 'lollipop' }), ...Array(6).fill({ kind: 'marmalade' }), ...Array(9).fill({ kind: 'piece' })] },
};
