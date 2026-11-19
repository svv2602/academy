import * as THREE from 'three';
import type { Save } from '../../core/save';
import type { Game } from '../../game/context';
import type { Spot } from '../../game/player';
import { travel } from '../../game/travel';
import type { Arrival } from '../../game/world';
import { TREE_WAY } from './layout';

/**
 * The way to the Great Tree (WORLD-01, docs/worlds/hub.md; the hub's checklist E, R12, R28, R29): an arch at the end
 * of the path behind the spawn, there once the crystal is whole. The first time the heroine goes to the hub by
 * herself, right after the return of the crystal (./shrine.ts `createFinale`); later she walks into this arch, and
 * from the hub she comes back out of it. Until she has been to the hub the cat's sparkles lead here - also for a save
 * that finished the kingdom before the hub existed (R28). Grey like the hub (WORLD-12): its look comes with the hub's.
 */

/**
 * The way is open in the published game: after the crystal she goes to the hub, and the arch stands. False hides it
 * while the hub is grey (the customer's word): "walk around" after the finale as before, no arch, no sparkles to it.
 * The hub itself stays in the registry - `?debug&world=hub` opens it, and from there the arch of the fairies leads
 * back here (`arrive` still puts her where the arch would stand).
 */
export const TREE_WAY_OPEN = false;

/** The id of the hub in the registry (src/worlds/index.ts). */
export const HUB = 'hub';
/** m in front of the arch, toward the valley, where she comes out of it. */
const OUT = 3;
/** m: how near the arch the action button takes her through it. */
const SPOT_R = 2;

/** She has been to the hub: its part of the save exists (read without creating it). */
export const hubVisited = (save: Save): boolean => (save.worlds as Record<string, unknown>)[HUB] !== undefined;

/** Where she comes out of the arch from the hub: in front of it, facing the valley (WorldDef.arrive). */
export const FROM_HUB: Arrival = {
  x: TREE_WAY.x + Math.sin(TREE_WAY.facing) * OUT, z: TREE_WAY.z + Math.cos(TREE_WAY.facing) * OUT, facing: TREE_WAY.facing,
};

export interface TreeWay { spot: Spot; pos: THREE.Vector3; update(time: number): void }

export function createTreeWay(g: Game): TreeWay {
  const { scene, ws } = g;
  const y = g.groundY(TREE_WAY.x, TREE_WAY.z);
  const stone = new THREE.MeshStandardMaterial({ color: '#b9b2a6', roughness: 0.9, flatShading: true });
  const arch = new THREE.Group();
  arch.position.set(TREE_WAY.x, y, TREE_WAY.z); arch.rotation.y = TREE_WAY.facing;
  for (const side of [-1, 1]) {
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.55, 3.4, 0.55), stone);
    post.position.set(side * 1.4, 1.6, 0);   // a little into the ground: it is not flat here
    arch.add(post);
    // hidden, it keeps nobody out
    if (TREE_WAY_OPEN) g.ground.block(TREE_WAY.x + Math.cos(TREE_WAY.facing) * side * 1.4, TREE_WAY.z - Math.sin(TREE_WAY.facing) * side * 1.4, 0.45);
  }
  const top = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.55, 0.65), stone);
  top.position.y = 3.55;
  // the veil in the green-gold of the tree's light, facing the valley (one-sided: not drawn from behind the arch)
  const veilMat = new THREE.MeshBasicMaterial({ color: '#b6e88a', transparent: true, opacity: 0.5, depthWrite: false });
  const veil = new THREE.Mesh(new THREE.PlaneGeometry(2.25, 3.1), veilMat);
  veil.position.y = 1.7;
  arch.add(top, veil);
  arch.traverse((o) => { if ((o as THREE.Mesh).isMesh && o !== veil) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(arch);
  const pos = new THREE.Vector3(TREE_WAY.x, y, TREE_WAY.z);
  return {
    pos,
    spot: { pos, r: SPOT_R, label: 'to_tree', on: () => TREE_WAY_OPEN && ws.final, run: () => { void travel(HUB); } },
    update(time) {
      arch.visible = TREE_WAY_OPEN && ws.final;
      veilMat.opacity = 0.4 + 0.18 * Math.sin(time * 1.6);
    },
  };
}
