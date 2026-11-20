import * as THREE from 'three';
import { afterEach, describe, expect, it } from 'vitest';
import type { Part } from './assets';
import { NEAR_FADE, NEAR_FADE_GLSL, forgetPartMaterials, forgetRanged, instanced, instancedParts, updateRanged } from './instancing';

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

describe('NEAR_FADE: a part of the scenery by the camera dissolves, the camera keeps its place', () => {
  /** The fragment shader of a part's material as the renderer would compile it. */
  const compiled = (cutout: boolean, sway: number) => {
    const scene = new THREE.Scene();
    instancedParts(scene, () => 0, [{ geo: triangle(), name: `p${cutout}${sway}`, map: new THREE.Texture(), cutout }], items, sway, false);
    const mat = cells(scene)[0].material as THREE.MeshStandardMaterial;
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
    mat.onBeforeCompile(sh, {} as THREE.WebGLRenderer);
    return { sh, key: mat.customProgramCacheKey() };
  };

  it('every part - a leaf card or a solid one, swaying or not - thins by the distance to the camera, first in its shader', () => {
    for (const cutout of [true, false]) {
      for (const sway of [0, 0.0035]) {
        const { sh, key } = compiled(cutout, sway);
        const f = sh.fragmentShader;
        expect(f, `cutout ${cutout}, sway ${sway}`).toContain(NEAR_FADE_GLSL);
        expect(f.indexOf(NEAR_FADE_GLSL)).toBeLessThan(f.indexOf('#include <map_fragment>'));
        expect(key).toContain('near');
        // the wind still bends what sways
        if (sway) expect(sh.vertexShader).toContain('uSway');
      }
    }
  });

  it('a leaf card stays lit the same on both sides; a solid part keeps its own normals', () => {
    const leaf = compiled(true, 0).sh.fragmentShader, solid = compiled(false, 0).sh.fragmentShader;
    expect(leaf).not.toContain('#include <normal_fragment_begin>');   // its own copy of the chunk, the face sign 1.0
    expect(leaf).not.toMatch(/gl_FrontFacing \? 1\.0 : - ?1\.0/);
    expect(solid).toContain('#include <normal_fragment_begin>');
  });

  it('gone at the lens, whole where the camera stands behind her in play (5 m and more)', () => {
    expect(NEAR_FADE.in).toBeGreaterThan(0);
    expect(NEAR_FADE.out).toBeGreaterThan(NEAR_FADE.in);
    expect(NEAR_FADE.out).toBeLessThan(4);
    expect(NEAR_FADE_GLSL).toContain('length(vViewPosition)');
    expect(NEAR_FADE_GLSL).toContain('discard');
  });
});
