/**
 * The style of the shapes (./style.ts): the materials are shared - the same kind and colour is one material however
 * many shapes ask for it, and the parts reuse them and their geometries; `own` is a fresh one each time; the rule of
 * facets grows with the size and stays in its bounds.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { PALETTE, facets, mat, parts } from './style';

const materialsOf = (o: THREE.Object3D) => { const s = new Set<THREE.Material>(); o.traverse((x) => { if ((x as THREE.Mesh).isMesh) s.add((x as THREE.Mesh).material as THREE.Material); }); return s; };
const geometriesOf = (o: THREE.Object3D) => { const s = new Set<THREE.BufferGeometry>(); o.traverse((x) => { if ((x as THREE.Mesh).isMesh) s.add((x as THREE.Mesh).geometry); }); return s; };

describe('the style of the shapes', () => {
  it('a material of a kind and a colour is made once, whoever asks', () => {
    expect(mat.stone()).toBe(mat.stone());
    expect(mat.stone()).toBe(mat.stone('stone'));
    expect(mat.stone()).toBe(mat.stone(PALETTE.stone));
    expect(mat.wood('door')).toBe(mat.wood('#9a6a4c'));
    expect(mat.glow('petal', 0.6, { emissive: 'petalGlow' })).toBe(mat.glow('petal', 0.6, { emissive: 'petalGlow' }));
    // a different kind, colour or strength is another material
    expect(mat.cloth('stone')).not.toBe(mat.stone());
    expect(mat.wood()).not.toBe(mat.wood('woodDark'));
    expect(mat.glow('gold', 0.6)).not.toBe(mat.glow('gold', 0.7));
  });

  it('the kinds keep their shading: stone and moss faceted, wood and cloth smooth; a glow is the material\'s own', () => {
    expect([mat.stone().flatShading, mat.moss().flatShading, mat.wood().flatShading, mat.cloth().flatShading]).toEqual([true, true, false, false]);
    const g = mat.glow('gold', 0.9, { emissive: 'goldGlow' });
    expect(g.emissiveIntensity).toBe(0.9);
    expect('#' + g.emissive.getHexString()).toBe(PALETTE.goldGlow);
  });

  it('"own" is a fresh material of the same look each time - for one that changes as it plays', () => {
    const a = mat.own('glow', 'gold', 0.35, { emissive: 'goldGlow' }), b = mat.own('glow', 'gold', 0.35, { emissive: 'goldGlow' });
    expect(a).not.toBe(b);
    expect(a).not.toBe(mat.glow('gold', 0.35, { emissive: 'goldGlow' }));
    expect(a.color.getHex()).toBe(b.color.getHex());
    expect(mat.own('stone').flatShading).toBe(true);
  });

  it('a hundred eyes, ears, paws and caps make no new material or geometry after the first of each', () => {
    const first = new THREE.Group().add(parts.eye(), parts.ear(), parts.paw(), parts.cap(0.3, 'rose', 0.4));
    const many = new THREE.Group();
    for (let i = 0; i < 100; i++) many.add(parts.eye(), parts.ear(), parts.paw(), parts.cap(0.3, 'rose', 0.4));
    expect(materialsOf(many)).toEqual(materialsOf(first));
    expect(geometriesOf(many)).toEqual(geometriesOf(first));
    expect(materialsOf(first).size).toBeLessThanOrEqual(8);
  });

  it('the facets grow with the size, from 6 to 24', () => {
    expect(facets(0)).toBe(6);
    expect(facets(0.25)).toBe(10);
    expect(facets(1.5)).toBe(16);
    expect(facets(100)).toBe(24);
    for (let s = 0; s < 5; s += 0.1) expect(facets(s + 0.1)).toBeGreaterThanOrEqual(facets(s));
  });
});
