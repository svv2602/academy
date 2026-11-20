import type * as THREE from 'three';

/**
 * The ring of mushrooms round the stump plays notes (the customer's word of 2026-11-20, docs/worlds/hub.md «Повторные
 * входы», п. 5): a tap on a mushroom sounds a bell note, as the music box of the fairy house, and the mushroom flashes.
 * No voice, no stars, nothing saved - a toy. Round the ring the notes go up a pentatonic scale over two octaves for
 * half of it and back down for the other half: running a finger round it plays the scale up and down.
 */

/** Hz: C major pentatonic from C4, two octaves. */
export const RING_SCALE = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0] as const;

/** The note of the `i`-th of `n` mushrooms round the ring: up the scale, then down. */
export function ringNote(i: number, n: number): number {
  const half = Math.ceil(n / 2), k = i < half ? i : n - 1 - i;
  return RING_SCALE[Math.round((k / Math.max(1, half - 1)) * (RING_SCALE.length - 1))];
}

/** The mushroom a tap meets: the nearest cap on the screen within `px` pixels (`screenDist`), or null. */
export function ringTapped(tops: readonly THREE.Vector3[], screenDist: (p: THREE.Vector3) => number, px: number): number | null {
  let best: number | null = null, bd = px;
  tops.forEach((p, i) => { const d = screenDist(p); if (d <= bd) { bd = d; best = i; } });
  return best;
}
