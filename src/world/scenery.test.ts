import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import { propMaterial, uTime as shared } from '../core/materials';
import { instanced, setDrawRange } from '../core/instancing';            // where renderer.ts takes the draw range
import { buildMotes, buildWater, updateRanged, uTime } from './scenery';  // where the world updates its cells

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

  it('the wind of the trees and the grass runs on the same clock (bound when the shader is built)', () => {
    const m = propMaterial(0.02);
    const sh = { uniforms: {} as Record<string, unknown>, vertexShader: '#include <begin_vertex>', fragmentShader: '' };
    m.onBeforeCompile(sh as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
    expect(sh.uniforms.uTime).toBe(shared);
  });
});

describe('instanced props stand on the ground', () => {
  it('every instance is placed at the ground height of its spot (5 cm into it)', () => {
    const scene = new THREE.Scene();
    instanced(scene, (x, z) => x + z, new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), [{ x: 1, z: 2, s: 1, rot: 0 }], false);
    const mesh = scene.children.at(-1) as THREE.InstancedMesh, m = new THREE.Matrix4(), p = new THREE.Vector3();
    mesh.getMatrixAt(0, m); p.setFromMatrixPosition(m);
    expect(p.y).toBeCloseTo(2.95, 5);
  });
});

describe('the draw range of small props follows the quality tier', () => {
  afterEach(() => setDrawRange(1));

  it('a cell near the player is drawn at full range and hidden when the range shrinks', () => {
    const scene = new THREE.Scene();
    const geo = new THREE.BoxGeometry(), mat = new THREE.MeshBasicMaterial();
    instanced(scene, () => 0, geo, mat, [{ x: 1, z: 1, s: 1, rot: 0 }], false, undefined, undefined, 10);
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
