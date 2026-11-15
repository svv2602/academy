import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { uTime as shared } from './materials';
import { instanced, setDrawRange, updateRanged } from './instancing';
import { buildMotes, buildWater, uTime } from './scenery';

/** Every ShaderMaterial in the scene that has a uTime uniform. */
function timed(scene: THREE.Scene) {
  const out: THREE.ShaderMaterial[] = [];
  scene.traverse((o) => {
    const m = (o as THREE.Mesh).material as THREE.ShaderMaterial | undefined;
    if (m?.uniforms?.uTime) out.push(m);
  });
  return out;
}

describe('one clock for the whole world', () => {
  it('water and motes animate with the uTime the frame advances (one object, not a copy)', () => {
    const scene = new THREE.Scene();
    buildWater(scene);
    buildMotes(scene, 8);
    const mats = timed(scene);
    expect(mats.length).toBeGreaterThanOrEqual(2);
    for (const m of mats) expect(m.uniforms.uTime).toBe(shared);
    expect(uTime).toBe(shared);   // what main.ts advances is the same object
  });
});

describe('the draw range of small props follows the quality tier', () => {
  afterEach(() => setDrawRange(1));

  it('a cell near the player is drawn at full range and hidden when the range shrinks', () => {
    const scene = new THREE.Scene();
    const geo = new THREE.BoxGeometry(), mat = new THREE.MeshBasicMaterial();
    instanced(scene, geo, mat, [{ x: 1, z: 1, s: 1, rot: 0 }], false, undefined, undefined, 10);
    const cell = scene.children.at(-1)!;
    // The cell (20 m) is centred at 10,10, about 14 m from the player at 0,0; it is drawn within 10 + 14 m.
    updateRanged(0, 0);
    expect(cell.visible).toBe(true);
    setDrawRange(0.5);            // the lowest tier: clutter only half as far
    updateRanged(0, 0);
    expect(cell.visible).toBe(false);
    setDrawRange(1);
    updateRanged(0, 0);
    expect(cell.visible).toBe(true);
  });
});
