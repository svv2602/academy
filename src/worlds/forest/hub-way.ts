import * as THREE from 'three';
import type { Game } from '../../game/context';
import type { Spot } from '../../game/player';
import { travel } from '../../game/travel';
import type { Arrival } from '../../game/world';
import { HUB } from '../fairy/tree-way';
import { archStoneMaterial, breathe, buildArch, crestTree } from '../hub/arch-look';
import { ARRIVAL, HUB_ARCH, LANDMARKS } from './layout';

/**
 * The way back to the Great Tree (WORLD-01, docs/worlds/hub.md; the hub's arch of the forest leads here): the hub's
 * stone arch on the central glade, where the grey build had its arch of three blocks (the landmark of the glade, WORLD-10:
 * `landmark-center`, seen from the targets of the route). She comes out of it from the hub, facing the forest, and
 * walks into it to go back - the same arch, the same green-gold light of the Great Tree and the same button as the
 * first world's arch to the tree (src/worlds/fairy/tree-way.ts).
 */

/** The arch's turn: as the grey build's arch stood, its passage toward the spawn (she comes out facing the forest). */
export const FACING = HUB_ARCH.facing;
/** m in front of the arch, toward the spawn, where she comes out of it: the camera behind her stands on the glade (as the first world's OUT). */
export const OUT = HUB_ARCH.out;
/** The green-gold of the Great Tree's light: the veil and the runes of its arch (as the first world's arch to the tree). */
const TREE_LIGHT = '#b6e88a';
/** m: how near the arch the action button takes her through it. */
const SPOT_R = 2;

/** Where she comes out of the arch from the hub: in front of it, facing the forest (WorldDef.arrive). */
export const FROM_HUB: Arrival = { ...ARRIVAL, facing: FACING };

/** The forest's `WorldDef.arrive`: out of this arch coming from the hub; from anywhere else at the spawn (null). */
export const arriveFrom = (from: string): Arrival | null => (from === HUB ? FROM_HUB : null);

export interface HubWay { spot: Spot; arch: THREE.Group; update(time: number): void }

export function createHubWay(g: Game): HubWay {
  const { x, z } = LANDMARKS.center;
  const y = g.groundY(x, z);
  // turned so that its veil faces the glade she comes up from; its stone dissolves at the lens and is looked through
  const { group: arch, glow } = buildArch(g.scene, {
    x, z, facing: FACING + Math.PI, colour: TREE_LIGHT, icon: '🌳', crest: crestTree(), open: true, seed: 4051, phase: 0,
  }, archStoneMaterial(), (bx, bz, r) => g.ground.block(bx, bz, r));
  arch.position.y = y - 0.1;   // a little into the ground: it is not flat here
  // the landmark of the glade (tools/forest-grey.mjs looks for it by this name)
  arch.name = 'landmark-center';
  const glows = glow ? [{ mat: glow, phase: 0 }] : [];
  return {
    arch,
    spot: { pos: new THREE.Vector3(x, y, z), r: SPOT_R, label: 'forest_to_tree', on: () => true, run: () => { void travel(HUB); } },
    update(time) { breathe(time, glows); },
  };
}
