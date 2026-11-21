/** The fireflies of the forest (./fireflies.ts): where they float, one draw for all of them, moving. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { FLY_HIGH, FLY_LOW, buildFireflies, placeFlies } from './fireflies';
import { ZONES } from './layout';

describe('the fireflies of the forest', () => {
  it('float over her head, round every glade and along the paths; the owl\'s glade blue', () => {
    const flies = placeFlies();
    expect(flies.length).toBeGreaterThan(80);
    for (const f of flies) { expect(f.y).toBeGreaterThanOrEqual(FLY_LOW); expect(f.y).toBeLessThanOrEqual(FLY_HIGH); }
    const blue = flies.filter((f) => f.blue);
    expect(blue.length).toBeGreaterThanOrEqual(14);
    for (const f of blue) expect(Math.hypot(f.x - ZONES.owl.x, f.z - ZONES.owl.z)).toBeLessThan(8);
    expect(placeFlies()).toEqual(flies);
  });

  it('are one instanced mesh with no shadow, and they move', () => {
    const scene = new THREE.Scene(), f = buildFireflies(scene);
    expect(scene.children.filter((o) => o.name === 'fireflies')).toHaveLength(1);
    expect(f.mesh.castShadow).toBe(false);
    const a = new THREE.Matrix4(), b = new THREE.Matrix4();
    f.mesh.getMatrixAt(0, a); f.update(1.3); f.mesh.getMatrixAt(0, b);
    expect(a.equals(b)).toBe(false);
  });
});
