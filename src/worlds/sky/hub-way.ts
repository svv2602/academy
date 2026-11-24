import * as THREE from 'three';
import type { Game } from '../../game/context';
import type { Spot } from '../../game/player';
import { travel } from '../../game/travel';
import type { Arrival } from '../../game/world';
import { HUB } from '../fairy/tree-way';
import { archStoneMaterial, breathe, buildArch, crestTree } from '../hub/arch-look';
import { TREE_ARCH, ZONES } from './layout';

/**
 * The way back to the Great Tree (WORLD-01, docs/worlds/hub.md; the hub's arch of the fifth place leads here): the hub's
 * stone arch on the castle island, south-east of its middle (./layout.ts TREE_ARCH). She comes out of it from
 * the hub, facing the island and the world beyond it, and walks into it to go back - the same arch, the same green-gold
 * light of the Great Tree and the same button as the forest's arch (src/worlds/forest/hub-way.ts).
 */

/** The arch's turn: its passage toward the middle of the castle island (she comes out facing it). */
export const FACING = Math.atan2(ZONES.castle.x - TREE_ARCH.x, ZONES.castle.z - TREE_ARCH.z);
/** m in front of the arch, toward the island's middle, where she comes out of it: the camera behind her stands on the island. */
export const OUT = 7;
/** The green-gold of the Great Tree's light: the veil and the runes of its arch (as the forest's arch to the tree). */
const TREE_LIGHT = '#b6e88a';
/** m: how near the arch the action button takes her through it. */
const SPOT_R = 2;

/** Where she comes out of the arch from the hub: in front of it, facing the island's middle (WorldDef.arrive). */
export const FROM_HUB: Arrival = {
  x: TREE_ARCH.x + Math.sin(FACING) * OUT, z: TREE_ARCH.z + Math.cos(FACING) * OUT, facing: FACING,
};

/** The Sky Islands' `WorldDef.arrive`: out of this arch coming from the hub; from anywhere else at the spawn (null). */
export const arriveFrom = (from: string): Arrival | null => (from === HUB ? FROM_HUB : null);

export interface HubWay { spot: Spot; arch: THREE.Group; update(time: number): void }

export function createHubWay(g: Game): HubWay {
  const { x, z } = TREE_ARCH;
  const y = g.groundY(x, z);
  // turned so that its veil faces the island she comes out onto
  const { group: arch, glow } = buildArch(g.scene, {
    x, z, facing: FACING + Math.PI, colour: TREE_LIGHT, icon: '🌳', crest: crestTree(), open: true, seed: 5071, phase: 0,
  }, archStoneMaterial(), (bx, bz, r) => g.ground.block(bx, bz, r));
  arch.position.y = y - 0.1;   // a little into the ground: it is not flat here
  arch.name = 'tree-arch';
  const glows = glow ? [{ mat: glow, phase: 0 }] : [];
  return {
    arch,
    spot: { pos: new THREE.Vector3(x, y, z), r: SPOT_R, label: 'sky_to_tree', on: () => true, run: () => { void travel(HUB); } },
    update(time) { breathe(time, glows); },
  };
}
