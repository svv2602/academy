import type { WorldInfo } from '../../game/world';

/**
 * What the game knows of the Sky Islands before she enters them (src/worlds/index.ts): their place on the shelf,
 * their secrets and the kinds of their finds - the hub's arches, its keepsakes and the shelf of the book read them while their own code (./index.ts)
 * is not loaded yet. Data only: nothing here may import three or the world's code.
 */
export const SKY_INFO: WorldInfo = {
  id: 'sky', shelf: 4, secrets: ['sky_chest', 'rainbow_slide', 'cloud_shapes', 'dragon_nest'],   // ./secrets.ts SKY_SECRETS
  // ./collect.ts COLLECT: its kinds and how many (src/worlds/meta.test.ts holds them equal)
  collect: { items: [...Array(6).fill({ kind: 'cloudlet' }), ...Array(6).fill({ kind: 'balloon' }), ...Array(6).fill({ kind: 'piece' })] },
};
