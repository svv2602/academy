/**
 * The red flowers of Pip's command in the valley (LEARN-23, ./en-places.ts: three beds of them): the valley's own
 * single pink flower with its head tinted red. No new model and no new material - the instances of the head carry a
 * colour, the leaves stay as green as they are; the pink flower's materials draw both.
 */
import * as THREE from 'three';
import type { Part } from '../../core/assets';
import { instancedParts, type Cell, type Height } from '../../core/instancing';
import { redFlowers } from './en-places';

/** The part of the flower that is its head (the material of the model: its petals and heart); the rest is leaves. */
export const HEAD = 'Flowers';
/** The tint of a head: the pink petals times it are a clear red, the yellow heart turns orange. */
export const RED_TINT = '#ff5a6e';
/** How the meadow's flowers sway, and from how far they are drawn (m) - the red ones as they (./scenery.ts). */
const SWAY = 0.45, RANGE = 55;

/** Plants the beds of `flower` (the parts of the valley's single pink flower) and tints its heads; returns their cells. */
export function buildRedFlowers(scene: THREE.Scene, height: Height, flower: Part[]): Cell[] {
  const head = flower.find((p) => p.name === HEAD);
  if (!head) throw new Error(`the flower of the red beds has no part "${HEAD}": ${flower.map((p) => p.name).join(', ')}`);
  const cells = instancedParts(scene, height, flower, redFlowers(), SWAY, false, RANGE);
  const tint = new THREE.Color(RED_TINT);
  for (const { mesh } of cells) {
    mesh.name = 'red-flowers';
    if (mesh.geometry !== head.geo) continue;
    for (let i = 0; i < mesh.count; i++) mesh.setColorAt(i, tint);
    mesh.instanceColor!.needsUpdate = true;
  }
  return cells;
}
