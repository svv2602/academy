/**
 * What the registry knows of the Sky Islands without loading them (WORLD-05): data only, as the registry after the
 * lazy load of the worlds reads it (the place on the shelf, the secrets; src/game/artifacts.ts ArtifactWorld). No
 * import here but `import type`: the registry reads this file without the world's code. The grey build has no secret
 * yet (docs/worlds/world-5.md «Секреты» come in a later step).
 */
import type { ArtifactWorld } from '../../game/artifacts';

export const SKY_INFO: ArtifactWorld = { id: 'sky', shelf: 4, secrets: [] };
