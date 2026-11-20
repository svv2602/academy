import * as THREE from 'three';
import type { Save, WorldState } from '../../core/save';
import type { Game } from '../../game/context';
import type { Spot } from '../../game/player';
import { travel } from '../../game/travel';
import { archStoneMaterial, breathe, buildArch, crestTree } from '../hub/arch-look';
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
 * Open: after the crystal she goes to the hub, and the arch stands. Closed 2026-11-20 until the route is finished -
 * the way out of the arch, the look of the arch in this world, the points of the hub's tour (it was opened the same
 * day, once the hub had its look and passed on the S22). Closed: "walk around" after the finale as before, no arch, no
 * sparkles to it.
 * The hub itself stays in the registry - `?debug&world=hub` opens it, and from there the arch of the fairies leads
 * back here (`arrive` still puts her where the arch would stand).
 */
export const TREE_WAY_OPEN = false;

/** The id of the hub in the registry (src/worlds/index.ts). */
export const HUB = 'hub';
/**
 * m in front of the arch, toward the valley, where she comes out of it: far enough that the camera behind her (6.2 m in
 * a landscape window) stands in front of the arch, not in its stones (at 3 m the posts filled half the frame); in a
 * portrait window (8 m) it is at the arch, whose stone dissolves at the lens.
 */
export const OUT = 7;
/** The green-gold of the Great Tree's light: the veil and the runes of its arch. */
const TREE_LIGHT = '#b6e88a';
/** m: how near the arch the action button takes her through it. */
const SPOT_R = 2;

/** She has been to the hub: its part of the save exists (read without creating it). */
export const hubVisited = (save: Save): boolean => (save.worlds as Record<string, unknown>)[HUB] !== undefined;

/**
 * The cat's word for where she stopped (WorldDef.left, R28): with the crystal whole and the way open, until she has been
 * to the hub - "the Great Tree calls, run after the sparkles to the arch". Else none: the shared words.
 */
export const treeCalls = (ws: Pick<WorldState, 'final'>, save: Save, open = TREE_WAY_OPEN): 'tree_calls' | null =>
  (open && ws.final && !hubVisited(save) ? 'tree_calls' : null);

/** Where she comes out of the arch from the hub: in front of it, facing the valley (WorldDef.arrive). */
export const FROM_HUB: Arrival = {
  x: TREE_WAY.x + Math.sin(TREE_WAY.facing) * OUT, z: TREE_WAY.z + Math.cos(TREE_WAY.facing) * OUT, facing: TREE_WAY.facing,
};

export interface TreeWay { spot: Spot; pos: THREE.Vector3; update(time: number): void }

export function createTreeWay(g: Game): TreeWay {
  const { scene, ws } = g;
  const y = g.groundY(TREE_WAY.x, TREE_WAY.z);
  // The stone arch of the hub (src/worlds/hub/arch-look.ts), open, in the green-gold of the tree's light, the Great
  // Tree on its keystone. Turned so that its veil faces the valley, where she comes up to it from; its stone
  // dissolves at the lens and is looked through. Hidden (the way closed), it keeps nobody out.
  const { group: arch, glow } = buildArch(scene, {
    x: TREE_WAY.x, z: TREE_WAY.z, facing: TREE_WAY.facing + Math.PI, colour: TREE_LIGHT, icon: '🌳', crest: crestTree(), open: true, seed: 4049, phase: 0,
  }, archStoneMaterial(), (x, z, r) => { if (TREE_WAY_OPEN) g.ground.block(x, z, r); });
  arch.position.y = y - 0.1;   // a little into the ground: it is not flat here
  const glows = glow ? [{ mat: glow, phase: 0 }] : [];
  const pos = new THREE.Vector3(TREE_WAY.x, y, TREE_WAY.z);
  return {
    pos,
    spot: { pos, r: SPOT_R, label: 'to_tree', on: () => TREE_WAY_OPEN && ws.final, run: () => { void travel(HUB); } },
    update(time) {
      arch.visible = TREE_WAY_OPEN && ws.final;
      if (arch.visible) breathe(time, glows);
    },
  };
}
