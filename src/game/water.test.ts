// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Game } from './context';
import { BUBBLE_EVERY, BUBBLE_LIFE, CAT_BUBBLE_Y, MOTES, catLift, createWater, waterOf } from './water';

function game(water: boolean) {
  const scene = new THREE.Scene();
  let seed = 1;
  const g = {
    scene, hero: { root: new THREE.Object3D() }, cat: { root: new THREE.Object3D() }, camera: new THREE.PerspectiveCamera(),
    rng: () => ((seed = (seed * 16807) % 2147483647) / 2147483647), debug: true,
    world: { move: water ? { kind: 'swim', height: 0.6 } : undefined },
  };
  return g as unknown as Game & typeof g;
}
const shown = (g: { scene: THREE.Scene }) => g.scene.children.filter((o) => o.visible).map((o) => o.name).sort();

describe('under water (src/game/water.ts): the cat in its bubble, her bubbles, the motes', () => {
  it('three meshes made once; on land none of them is seen', () => {
    const g = game(false), w = createWater(g);
    expect(g.scene.children.map((o) => o.name).sort()).toEqual(['cat-bubble', 'swim-bubbles', 'water-motes']);
    expect(waterOf(g)).toBe(w);
    w.update(1 / 60, true, 2);
    expect(shown(g)).toEqual([]);
  });

  it('in the water: three draw calls on q1-q2 (the cat\'s bubble and two of particles), two on q0 - no motes there', () => {
    const g = game(true), w = createWater(g);
    w.update(1 / 60, false, 2);
    expect(shown(g)).toEqual(['cat-bubble', 'swim-bubbles', 'water-motes']);
    expect(w.motes.count).toBe(MOTES);
    w.update(1 / 60, false, 0);
    expect(shown(g)).toEqual(['cat-bubble', 'swim-bubbles']);
  });

  it('the bubble stays round the cat; her bubbles come while she swims, never while she floats still, and go up and away', () => {
    const g = game(true), w = createWater(g);
    g.cat.root.position.set(2, 0.1, 3);
    for (let i = 0; i < 60; i++) w.update(1 / 60, false, 2);
    expect(w.bubbles.count).toBe(0);
    expect(w.catBubble.position.toArray()).toEqual([2, 0.1 + CAT_BUBBLE_Y, 3]);
    for (let i = 0; i < 120; i++) w.update(1 / 60, true, 2);
    // one each BUBBLE_EVERY, each living BUBBLE_LIFE: about ten up at once
    expect(w.bubbles.count).toBeGreaterThanOrEqual(Math.floor(BUBBLE_LIFE / BUBBLE_EVERY) - 1);
    expect(w.bubbles.count).toBeLessThanOrEqual(12);
    for (let i = 0; i < 120; i++) w.update(1 / 60, false, 2);
    expect(w.bubbles.count).toBe(0);
  });

  it('the cat is carried at her swimming height in a water world (the customer\'s choice of 2026-11-21), on the ground on land', () => {
    expect(catLift(game(true))).toBe(0.6);
    expect(catLift(game(false))).toBe(0);
  });
});
