/** The pet's shadow in the hub by its stage (./pet-shadow.ts). */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BLOB_R, petBlob, petCastsShadow } from './pet-shadow';

describe('the pet\'s shadow in the hub', () => {
  it('cast on the stages 1-3, not on the fourth', () => {
    expect([1, 2, 3, 4].map((s) => petCastsShadow(s as 1 | 2 | 3 | 4))).toEqual([true, true, true, false]);
  });

  it('the spot instead: one mesh, no shadow of its own, hidden until it has a pet to lie under, then under it', () => {
    const scene = new THREE.Scene(), b = petBlob(scene);
    expect(scene.children).toEqual([b.mesh]);
    expect(b.mesh.visible).toBe(false);
    expect(b.mesh.castShadow).toBe(false);
    b.place(new THREE.Vector3(2, 0.1, -3));
    expect(b.mesh.visible).toBe(true);
    expect([b.mesh.position.x, b.mesh.position.z]).toEqual([2, -3]);
    expect(b.mesh.position.y).toBeGreaterThan(0.1);
    new THREE.Box3().setFromObject(b.mesh).getSize(new THREE.Vector3()).toArray().forEach((v, i) => { if (i !== 1) expect(v).toBeCloseTo(BLOB_R * 2, 1); });
    b.place(null);
    expect(b.mesh.visible).toBe(false);
  });
});
