/** The rainbow's ribbon (./rainbow-trail.ts): drawn only while the potion acts and the world allows it. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RAINBOW_COLOURS, TRAIL_STEP, createRainbowTrail, rainbowRibbon } from './rainbow-trail';

const walk = (t: ReturnType<typeof createRainbowTrail>, steps: number, active = true) => {
  for (let i = 0; i < steps; i++) t.update(new THREE.Vector3(0, 0, i * TRAIL_STEP * 1.5), active);
};

describe('the rainbow\'s ribbon', () => {
  it('nothing drawn while the rainbow does not act', () => {
    const scene = new THREE.Scene(), t = createRainbowTrail(scene);
    walk(t, 10, false);
    expect(t.mesh.visible).toBe(false);
  });

  it('acting and walking: a ribbon of the seven colours behind her, fading toward its tail; it ends with the potion', () => {
    const t = createRainbowTrail(new THREE.Scene());
    walk(t, 12);
    expect(t.mesh.visible).toBe(true);
    const col = t.mesh.geometry.getAttribute('color');
    const across = RAINBOW_COLOURS.length + 1, first = new THREE.Color(RAINBOW_COLOURS[0]);
    expect(col.getX(0)).toBeCloseTo(first.r); expect(col.getY(0)).toBeCloseTo(first.g);
    expect(col.getW(0)).toBeGreaterThan(col.getW(5 * across));   // the head brighter than further back
    t.update(new THREE.Vector3(0, 0, 100), false);
    expect(t.mesh.visible).toBe(false);
  });

  it('a world that turns the ribbon off draws none; undone, it is drawn again', () => {
    const t = createRainbowTrail(new THREE.Scene()), undo = rainbowRibbon(false);
    walk(t, 12);
    expect(t.mesh.visible).toBe(false);
    undo();
    walk(t, 3);
    expect(t.mesh.visible).toBe(true);
  });

  it('one mesh in the scene, gone with dispose', () => {
    const scene = new THREE.Scene(), t = createRainbowTrail(scene);
    expect(scene.children.filter((o) => (o as THREE.Mesh).isMesh)).toHaveLength(1);
    t.dispose();
    expect(scene.children).toHaveLength(0);
  });
});
