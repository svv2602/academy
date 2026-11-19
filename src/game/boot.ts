import { rig, shared, type Rig } from '../core/assets';
import type { Save } from '../core/save';
import { showNotice } from '../ui/ui';
import { CAT_HEIGHT } from './companion';
import { loadGear, type GearModels } from './gear';
import { buildHero } from './hero';
import { PETS } from './pets';

/**
 * The shared load (TECH-15): what every world is played with and no world owns - the heroine's model with her items,
 * the cat's and the pets' (PLAY-09: one model of each species of src/game/pets.ts). It runs once, next to the load of the world (src/main.ts starts both under one loading bar); a world
 * loads and builds only its own (WorldDef.load) and reads the heroine's model from the game (`g.heroRig`).
 */

/** The heroine's model with her items hung, hidden, under its bones (src/game/gear.ts): the worlds make her gear of it. */
export type HeroModel = Awaited<ReturnType<typeof buildHero>> & { gear: GearModels };

/** What the shared load hands to the game (createGame, src/game/context.ts). */
export interface Shared {
  heroRig: HeroModel; catRig: Rig;
  /**
   * The pets by species id (PLAY-09). A world showing the same model file asks for it too: the loader holds one request
   * per file (src/core/assets.ts `gltf`), each `rig` is a clone of its own.
   */
  petRigs: Record<string, Rig>;
}

let failed = false;

/**
 * TECH-08: a model failed even after its repeats (src/core/assets.ts) - of the shared load or of a world's, they report
 * here. The two loads run side by side and both may fail (one file both need, no network): the game says why it stopped
 * once, whichever fails first. "Try again" reloads the page rather than loading again here: a world has put part of
 * itself into the scene by then, and a second build in this page would double it. The models that did load come from
 * the cache then.
 */
export function loadFailed(e: unknown): void {
  if (failed) return;
  failed = true;
  console.error('the game could not load:', e);
  showNotice('load_failed', () => location.reload());
}

/** The heroine (dressed as the save says), the cat and the pets. Null = failed for good, the notice is already shown. */
export function loadShared(save: Save): Promise<Shared | null> {
  // The pets are of the core: never released with a world, also when a world shows the same model file.
  shared(...PETS.map((p) => p.model));
  return Promise.all([
    // The heroine's items hang under her bones while she is still in her rest pose (src/game/gear.ts).
    buildHero(save).then(async (h) => Object.assign(h, { gear: await loadGear(h) })),
    rig('extra/cat', CAT_HEIGHT, false),
    Promise.all(PETS.map((p) => rig(p.model, p.height, true).then((r) => [p.id, r] as const))),
  ]).then(([heroRig, catRig, pets]): Shared => ({ heroRig, catRig, petRigs: Object.fromEntries(pets) }), (e: unknown) => { loadFailed(e); return null; });
}
