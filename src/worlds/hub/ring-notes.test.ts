/** The ring of mushrooms that plays notes (./ring-notes.ts, ./tree-look.ts `ring`). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RING_SCALE, ringNote, ringTapped } from './ring-notes';

describe('the notes round the ring', () => {
  it('up the scale over half the ring from C4 to its top, back down over the other half', () => {
    const n = 20, notes = Array.from({ length: n }, (_, i) => ringNote(i, n));
    expect(notes[0]).toBe(RING_SCALE[0]);
    expect(notes[9]).toBe(RING_SCALE[RING_SCALE.length - 1]);
    for (let i = 1; i < 10; i++) expect(notes[i]).toBeGreaterThan(notes[i - 1]);
    for (let i = 10; i < n; i++) expect(notes[i]).toBe(notes[n - 1 - i]);
    expect(new Set(notes).size).toBe(RING_SCALE.length);
  });
});

describe('which mushroom a tap meets', () => {
  const tops = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(1, 0, 0), new THREE.Vector3(2, 0, 0)];
  // a screen where a metre is 30 px along x and the tap is at x = 1.2 m
  const dist = (at: number) => (p: THREE.Vector3) => Math.abs(p.x - at) * 30;
  it('the nearest on the screen within the pixels', () => {
    expect(ringTapped(tops, dist(1.2), 40)).toBe(1);
    expect(ringTapped(tops, dist(1.6), 40)).toBe(2);
  });
  it('none farther than the pixels', () => {
    expect(ringTapped(tops, dist(5), 40)).toBeNull();
  });
});
