import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { disposeMaterial, disposeTree } from './dispose';

// No WebGL here and none needed: `dispose()` of a geometry, a material or a texture only sends the event `dispose`
// (the renderer listens to it in the game). The tests count those events on real Three.js objects.
type Sends = { addEventListener(type: 'dispose', listener: () => void): void };
function counter() {
  const freed: string[] = [];
  const watch = <T extends Sends>(name: string, x: T): T => { x.addEventListener('dispose', () => freed.push(name)); return x; };
  return { freed, watch, sorted: () => [...freed].sort() };
}
/** One triangle: the tests must stay light (the heap of the test run is capped). */
const triangle = () => new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(9), 3));

describe('disposeTree (TECH-15)', () => {
  it('frees the geometry, the material and every texture of the material', () => {
    const c = counter();
    const mat = c.watch('material', new THREE.MeshStandardMaterial({
      map: c.watch('map', new THREE.Texture()), normalMap: c.watch('normalMap', new THREE.Texture()),
      alphaMap: c.watch('alphaMap', new THREE.Texture()), emissiveMap: c.watch('emissiveMap', new THREE.Texture()),
    }));
    const root = new THREE.Group().add(new THREE.Group().add(new THREE.Mesh(c.watch('geometry', triangle()), mat)));
    disposeTree(root);
    expect(c.sorted()).toEqual(['alphaMap', 'emissiveMap', 'geometry', 'map', 'material', 'normalMap']);
  });

  it('frees the root itself when it is the mesh', () => {
    const c = counter();
    disposeTree(new THREE.Mesh(c.watch('geometry', triangle()), c.watch('material', new THREE.MeshBasicMaterial())));
    expect(c.sorted()).toEqual(['geometry', 'material']);
  });

  it('frees every material of a mesh that has several, with their textures', () => {
    const c = counter();
    const mats = [
      c.watch('first', new THREE.MeshStandardMaterial({ map: c.watch('first map', new THREE.Texture()) })),
      c.watch('second', new THREE.MeshStandardMaterial({ map: c.watch('second map', new THREE.Texture()) })),
    ];
    disposeTree(new THREE.Mesh(c.watch('geometry', triangle()), mats));
    expect(c.sorted()).toEqual(['first', 'first map', 'geometry', 'second', 'second map']);
  });

  it('frees a resource met twice only once', () => {
    const c = counter();
    const geo = c.watch('geometry', triangle()), map = c.watch('map', new THREE.Texture());
    const one = c.watch('one', new THREE.MeshStandardMaterial({ map, emissiveMap: map }));
    const two = c.watch('two', new THREE.MeshStandardMaterial({ map }));
    const root = new THREE.Group().add(new THREE.Mesh(geo, one), new THREE.Mesh(geo, one), new THREE.Mesh(geo, [two, one]));
    disposeTree(root);
    expect(c.sorted()).toEqual(['geometry', 'map', 'one', 'two']);
  });

  it('frees the textures among the uniforms of a shader material, one or an array', () => {
    const c = counter();
    const mat = c.watch('material', new THREE.ShaderMaterial({
      uniforms: {
        noise: { value: c.watch('noise', new THREE.Texture()) },
        layers: { value: [c.watch('layer 0', new THREE.Texture()), c.watch('layer 1', new THREE.Texture())] },
        time: { value: 0 }, tint: { value: new THREE.Color('#fff') }, none: { value: null },
      },
    }));
    disposeTree(new THREE.Mesh(c.watch('geometry', triangle()), mat));
    expect(c.sorted()).toEqual(['geometry', 'layer 0', 'layer 1', 'material', 'noise']);
  });

  it('frees the bone texture of a skinned mesh', () => {
    const c = counter();
    const bone = new THREE.Bone();
    const skeleton = new THREE.Skeleton([bone]);
    skeleton.computeBoneTexture();
    c.watch('bones', skeleton.boneTexture!);
    const mesh = new THREE.SkinnedMesh(c.watch('geometry', triangle()), c.watch('material', new THREE.MeshStandardMaterial()));
    mesh.add(bone); mesh.bind(skeleton);
    disposeTree(new THREE.Group().add(mesh));
    expect(c.sorted()).toEqual(['bones', 'geometry', 'material']);
    expect(skeleton.boneTexture).toBeNull();
  });

  it('frees the per-instance buffers of an instanced mesh', () => {
    const c = counter();
    const mesh = c.watch('instances', new THREE.InstancedMesh(c.watch('geometry', triangle()), c.watch('material', new THREE.MeshBasicMaterial()), 3));
    disposeTree(new THREE.Group().add(mesh));
    expect(c.sorted()).toEqual(['geometry', 'instances', 'material']);
  });

  it('frees lines and points as well as meshes', () => {
    const c = counter();
    const root = new THREE.Group().add(
      new THREE.Line(c.watch('line geometry', triangle()), c.watch('line material', new THREE.LineBasicMaterial())),
      new THREE.Points(c.watch('points geometry', triangle()), c.watch('points material', new THREE.PointsMaterial({ map: c.watch('sprite', new THREE.Texture()) }))),
    );
    disposeTree(root);
    expect(c.sorted()).toEqual(['line geometry', 'line material', 'points geometry', 'points material', 'sprite']);
  });

  it('takes nothing out of the scene and leaves the objects whole', () => {
    const scene = new THREE.Scene();
    const geo = triangle(), mat = new THREE.MeshStandardMaterial({ map: new THREE.Texture() });
    const mesh = new THREE.Mesh(geo, mat), group = new THREE.Group().add(mesh, new THREE.PointLight(), new THREE.Object3D());
    scene.add(group);
    disposeTree(group);
    expect(group.parent).toBe(scene);
    expect(group.children).toHaveLength(3);
    expect(mesh.parent).toBe(group);
    expect(mesh.geometry).toBe(geo);
    expect(mesh.material).toBe(mat);
    expect(mat.map).not.toBeNull();
  });

  it('shares what was freed between calls that are given the same set', () => {
    const c = counter();
    const geo = c.watch('geometry', triangle()), map = c.watch('map', new THREE.Texture());
    const here = new THREE.Mesh(geo, c.watch('here', new THREE.MeshStandardMaterial({ map })));
    const there = new THREE.Mesh(geo, c.watch('there', new THREE.MeshStandardMaterial({ map })));
    const seen = new Set<object>();
    disposeTree(here, seen); disposeTree(there, seen);
    expect(c.sorted()).toEqual(['geometry', 'here', 'map', 'there']);
  });
});

describe('disposeMaterial (TECH-15)', () => {
  it('frees the material and its textures', () => {
    const c = counter();
    disposeMaterial(c.watch('material', new THREE.MeshStandardMaterial({ map: c.watch('map', new THREE.Texture()), roughnessMap: c.watch('roughnessMap', new THREE.Texture()) })));
    expect(c.sorted()).toEqual(['map', 'material', 'roughnessMap']);
  });

  it('does nothing to a material that the set already holds', () => {
    const c = counter();
    const mat = c.watch('material', new THREE.MeshStandardMaterial({ map: c.watch('map', new THREE.Texture()) }));
    const seen = new Set<object>();
    disposeMaterial(mat, seen); disposeMaterial(mat, seen);
    expect(c.sorted()).toEqual(['map', 'material']);
  });
});
