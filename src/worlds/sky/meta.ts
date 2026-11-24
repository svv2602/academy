import type { WorldInfo } from '../../game/world';

/**
 * What the game knows of the Sky Islands before she enters them (src/worlds/index.ts): their place on the shelf and
 * their secrets - the hub's arches, its keepsakes and the shelf of the book read them while their own code (./index.ts)
 * is not loaded yet. Data only: nothing here may import three or the world's code. The grey build has no secret yet
 * (docs/worlds/world-5.md «Секреты» come in a later step).
 */
export const SKY_INFO: WorldInfo = { id: 'sky', shelf: 4, secrets: [] };
