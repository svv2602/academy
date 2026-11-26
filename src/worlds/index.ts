// The registry of worlds (ARCH-06): one entry per world in WORLDS. The world the published game plays is named in
// DEFAULT_WORLD, not taken from the order of the list (`?world=<id>` with `?debug` picks another,
// src/game/world.ts `pickWorld`).
import type { WorldDef, WorldMeta } from '../game/world';
import { fairy } from './fairy';
import { hub } from './hub';
import { FOREST_INFO } from './forest/meta';
import { PROBE_INFO } from './probe/meta';
import { SEA_INFO } from './sea/meta';
import { SKY_INFO } from './sky/meta';
import { SWEET_INFO } from './sweet/meta';

// The probe world (./probe, TECH-15) is a test world: it is listed only in a build made with `--mode probe`
// (tools/worlds.mjs builds dist-probe/ and plays it there). In any other mode the condition is a constant false, so
// the build holds neither its code nor its files: `npm run e2e` checks dist/ for that (the step "worlds").
// The hub (./hub, WORLD-01) is the home between the worlds: part of the installation (INSTALLED below).
// The forest (./forest, WORLD-02) is published (the customer's word of 2026-11-24: «выкладывай лес»): listed in every
// build, a next world downloaded while the fairies are played (TECH-09); its files lie in worlds-data/forest/.
// The sea (./sea, WORLD-03) is published too (the customer's word of 2026-11-24: «да, пусть П3 готовит море»): listed
// in every build, downloaded while the forest is played; its files lie in worlds-data/sea/ (its swimming clips:
// tools/vite-worlds.mjs WORLD_EXTRA_FILES). The Sweet Land (./sweet, WORLD-04) is published too (the customer's word of
// 2026-11-26: «Сладкая страна — да»): listed in every build, downloaded while the sea is played; its files lie in worlds-data/sweet/, the hub's
// arch of its place (shelf 3) wakes once the sea is done. The Sky Islands (./sky, WORLD-05) are in their grey build
// (WORLD-12): listed only in a build or a dev server made with `--mode grey` (tools/sky-grey.mjs), never in the published
// game, until the customer has taken the grey build; the arch of shelf 4 wakes once the Sweet Land is done.
//
// A next world is listed by what the game knows of it before she enters it (./<id>/meta.ts: data only) and its code is
// imported when she enters it (`code`): a chunk of its own, not the core's (decision of 2026-11-24, «вариант Б»). The
// worlds of the installation are at hand.
const installed = (w: WorldDef): WorldMeta => ({ id: w.id, shelf: w.shelf, test: w.test, secrets: w.secrets, collect: w.collect, code: async () => w });
export const WORLDS: readonly WorldMeta[] = [
  installed(fairy), installed(hub),
  ...(import.meta.env.MODE === 'probe' ? [{ ...PROBE_INFO, code: async () => (await import('./probe')).probe }] : []),
  { ...FOREST_INFO, code: async () => (await import('./forest')).forest },
  { ...SEA_INFO, code: async () => (await import('./sea')).sea },
  { ...SWEET_INFO, code: async () => (await import('./sweet')).sweet },
  ...(import.meta.env.MODE === 'grey' ? [{ ...SKY_INFO, code: async () => (await import('./sky')).sky }] : []),
];
/** The id of the world the published game plays. */
export const DEFAULT_WORLD = 'fairy';
/** Every world of the registry with its code loaded: for the tests that check the descriptions of all of them. */
export const loadWorlds = (): Promise<WorldDef[]> => Promise.all(WORLDS.map((w) => w.code()));
/**
 * The worlds of the installation: never downloaded as a next world. The first world, and the hub - it has no files of
 * its own (decision Q5 of the hub, R31: up to 0.5 MB it stays in the installation). Once it has files under
 * models/hub/ or voice/hub/, the build has to keep them in the installation too (tools/vite-worlds.mjs counts every
 * folder of src/worlds/ but the first world's as a next world).
 */
export const INSTALLED: readonly string[] = [DEFAULT_WORLD, 'hub'];

/**
 * The worlds to download while the world `current` is played (TECH-09), in the order to try them: the ones listed
 * after it, then the ones listed before it - without `current` itself and without the worlds of the installation
 * (`INSTALLED`). The first of them that is not in the cache yet is the next world (src/core/worldcache.ts
 * `downloadNext`). `ids` are the worlds in the order of the registry.
 */
export function nextWorlds(current: string, ids: readonly string[] = WORLDS.map((w) => w.id), installed: readonly string[] = INSTALLED): string[] {
  const at = ids.indexOf(current);
  return [...ids.slice(at + 1), ...ids.slice(0, Math.max(at, 0))].filter((id) => id !== current && !installed.includes(id));
}
