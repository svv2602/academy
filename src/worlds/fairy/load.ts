import type * as THREE from 'three';
import { rig, staticGeo } from '../../core/assets';
import type { Save } from '../../core/save';
import { buildHero } from '../../game/hero';
import { buildClouds, buildGrass, buildMotes, buildRainbow, buildScenery, buildWater } from '../../world/scenery';
import { buildTerrain } from '../../world/terrain';
import { showNotice } from '../../ui/ui';

/**
 * The fairy world before anything moves in it (ARCH-05): the terrain, the water, the rainbow, the motes and the grass
 * join the scene at once, then the props and every model load together. Null when a model failed for good: the notice
 * with "try again" is on screen then, and nothing more is built.
 */
export async function loadFairy(scene: THREE.Scene, save: Save, touch: boolean) {
  const density = touch ? 0.75 : 1;
  scene.add(buildTerrain(touch ? 150 : 200));
  buildWater(scene);
  const rainbowAlpha = buildRainbow(scene);
  const motes = buildMotes(scene, 260);
  buildGrass(scene, touch ? 9000 : 16000);
  const loads = await Promise.all([
    buildScenery(scene, density), buildClouds(scene),
    buildHero(save), rig('extra/cat2', 0.62, true), rig('platformer_game_pack/Chest', 0.9),
    staticGeo('rpg_items_pack/Crystal2', 1), staticGeo('platformer_game_pack/Star', 0.7),
    rig('animals_pack/Horse_White', 2.0, true), rig('animals_pack/Fox', 0.8, true), rig('extra/mushking', 1.25, true),
    rig('animals_pack/Deer', 1.55, true), buildHero({ dress: '#ffd54f', hair: '#f5d16b', hairStyle: 'buns' }, 1.72, 1.1),
  ]).catch((e: unknown) => {
    // TECH-08: a model failed even after its repeats (src/core/assets.ts). "Try again" reloads the page rather than
    // building again here: the terrain, the water, the grass and part of the props are in the scene already, and a
    // second build in this page would double them. The models that did load come from the cache then.
    console.error('the game could not load:', e);
    showNotice('load_failed', () => location.reload());
    return null;
  });
  if (!loads) return null;
  const [, updateClouds, heroRig, catRig, chestRig, crystalGeo, starGeo, uniRig, foxRig, kingRig, deerRig, queenRig] = loads;
  return { rainbowAlpha, motes, updateClouds, heroRig, catRig, chestRig, crystalGeo, starGeo, uniRig, foxRig, kingRig, deerRig, queenRig };
}

/** What `loadFairy` hands to the rest of the world once everything is loaded. */
export type FairyLoads = NonNullable<Awaited<ReturnType<typeof loadFairy>>>;
