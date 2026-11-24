import type { WorldInfo } from '../../game/world';

/**
 * What the game knows of the probe world before she enters it (src/worlds/index.ts, `--mode probe` only): a test world on
 * the forest's place of the shelf, with its one secret. Data only, as every next world's.
 */
export const PROBE_INFO: WorldInfo = { id: 'probe', shelf: 1, test: true, secrets: ['hollow'] };   // ./items.ts SECRET
