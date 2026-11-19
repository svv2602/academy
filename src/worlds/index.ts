// The registry of worlds (ARCH-06): one entry per world in WORLDS. The world the published game plays is named in
// DEFAULT_WORLD, not taken from the order of the list (`?world=<id>` with `?debug` picks another,
// src/game/world.ts `pickWorld`).
import { fairy } from './fairy';
import { hub } from './hub';

// The probe world (./probe, TECH-15) is a test world: it is listed only in a build made with `--mode probe`
// (tools/worlds.mjs builds dist-probe/ and plays it there). In any other mode the condition is a constant false, so
// the build holds neither its code nor its files: `npm run e2e` checks dist/ for that (the step "worlds").
// The hub (./hub, WORLD-01) is the home between the worlds: no files of its own, it is part of the installation.
export const WORLDS = [fairy, hub, ...(import.meta.env.MODE === 'probe' ? [(await import('./probe')).probe] : [])];
/** The id of the world the published game plays. */
export const DEFAULT_WORLD = 'fairy';

/**
 * The worlds to download while the world `current` is played (TECH-09), in the order to try them: the ones listed
 * after it, then the ones listed before it - without `current` itself and without the first world, which is part of
 * the installation. The first of them that is not in the cache yet is the next world (src/core/worldcache.ts
 * `downloadNext`). `ids` are the worlds in the order of the registry.
 */
export function nextWorlds(current: string, ids: readonly string[] = WORLDS.map((w) => w.id), first: string = DEFAULT_WORLD): string[] {
  const at = ids.indexOf(current);
  return [...ids.slice(at + 1), ...ids.slice(0, Math.max(at, 0))].filter((id) => id !== current && id !== first);
}
