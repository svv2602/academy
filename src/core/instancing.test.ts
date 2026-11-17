import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import type { Part } from './assets';
import { forgetPartMaterials, forgetRanged, instanced, instancedParts, updateRanged } from './instancing';

/** One triangle: the tests must stay light (the heap of the test run is capped). */
const triangle = () => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));
const items = [{ x: 1, z: 1, s: 1, rot: 0 }];
const cells = (scene: THREE.Scene) => scene.children as THREE.InstancedMesh[];
/** Further than any drawing distance: a cell in the list is hidden there. */
const FAR = 1e6;

// The list and the cache are one for the whole module: every test leaves them empty.
afterEach(() => { forgetRanged(() => true); forgetPartMaterials(() => true); });

describe('forgetRanged (TECH-15): the cells of a world that left are out of the distance list', () => {
  it('drops exactly the cells it is told to, and keeps the others in their order', () => {
    const scene = new THREE.Scene();
    for (let i = 0; i < 4; i++) instanced(scene, () => 0, triangle(), new THREE.MeshBasicMaterial(), items, false, undefined, undefined, 10);
    const [a, b, c, d] = cells(scene);
    updateRanged(FAR, FAR);
    expect(cells(scene).map((m) => m.visible)).toEqual([false, false, false, false]);

    const asked: THREE.Object3D[] = [];
    forgetRanged((mesh) => { asked.push(mesh); return mesh === a || mesh === c; });
    expect(asked).toEqual([a, b, c, d]);

    updateRanged(1, 1);
    expect([a.visible, b.visible, c.visible, d.visible], 'only the cells left in the list are switched on').toEqual([false, true, false, true]);
    updateRanged(FAR, FAR);
    expect([b.visible, d.visible]).toEqual([false, false]);

    // What is left can be dropped in turn; an empty list is fine.
    forgetRanged((mesh) => mesh === d);
    updateRanged(1, 1);
    expect([b.visible, d.visible]).toEqual([true, false]);
    forgetRanged(() => true);
    forgetRanged(() => true);
    updateRanged(FAR, FAR);
    expect(b.visible).toBe(true);
  });

  it('a cell without a drawing distance was never in the list', () => {
    const scene = new THREE.Scene();
    instanced(scene, () => 0, triangle(), new THREE.MeshBasicMaterial(), items, false);
    const asked: THREE.Object3D[] = [];
    forgetRanged((mesh) => { asked.push(mesh); return false; });
    expect(asked).toEqual([]);
  });
});

describe('forgetPartMaterials (TECH-15): a freed material is not handed out again', () => {
  const part = (name: string): Part => ({ geo: triangle(), name, map: new THREE.Texture(), cutout: false });
  const last = (scene: THREE.Scene) => cells(scene)[scene.children.length - 1].material as THREE.Material;

  it('drops exactly the materials it is told to: the next mesh of that part gets a new one, the others keep theirs', () => {
    const scene = new THREE.Scene();
    const tree = part('tree'), rock = part('rock');
    instancedParts(scene, () => 0, [tree], items, 0, false);
    const treeMat = last(scene);
    instancedParts(scene, () => 0, [rock], items, 0, false);
    const rockMat = last(scene);
    expect(rockMat).not.toBe(treeMat);
    instancedParts(scene, () => 0, [tree], items, 0, false);
    expect(last(scene), 'one material per part').toBe(treeMat);

    const asked: THREE.Material[] = [];
    forgetPartMaterials((mat) => { asked.push(mat); return mat === treeMat; });
    expect(asked).toEqual([treeMat, rockMat]);

    instancedParts(scene, () => 0, [tree], items, 0, false);
    const fresh = last(scene);
    expect(fresh).not.toBe(treeMat);
    instancedParts(scene, () => 0, [rock], items, 0, false);
    expect(last(scene)).toBe(rockMat);
    // The new one is cached in its place.
    instancedParts(scene, () => 0, [tree], items, 0, false);
    expect(last(scene)).toBe(fresh);
  });
});
