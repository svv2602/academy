/** The red flowers of Pip's command (./red-flowers.ts): the pink flower planted in the beds, its heads tinted, its leaves not. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Part } from '../../core/assets';
import { RED_BED, RED_BEDS, redFlowers } from './en-places';
import { HEAD, RED_TINT, buildRedFlowers } from './red-flowers';

const part = (name: string): Part => ({ geo: new THREE.BoxGeometry(0.2, 0.5, 0.2), name, map: null, cutout: true });

describe('the red flowers of the valley', () => {
  const flower = [part(HEAD), part('Leaves')], scene = new THREE.Scene();
  const cells = buildRedFlowers(scene, (x, z) => x * 0.01 + z * 0.02, flower);
  const of = (p: Part) => cells.filter((c) => c.mesh.geometry === p.geo);
  const total = RED_BEDS.length * RED_BED.flowers;

  it('every flower of every bed is planted, head and leaves, where its bed is - on the ground', () => {
    for (const p of flower) expect(of(p).reduce((n, c) => n + c.mesh.count, 0), p.name).toBe(total);
    expect(cells.every((c) => c.mesh.parent === scene && c.mesh.name === 'red-flowers')).toBe(true);
    const all = redFlowers(), m = new THREE.Matrix4(), at = new THREE.Vector3();
    const seen = of(flower[0]).flatMap((c) => c.idx.map((idx, i) => { c.mesh.getMatrixAt(i, m); at.setFromMatrixPosition(m); return [idx, at.x, at.y, at.z]; }));
    expect(seen.map(([idx]) => idx).sort((a, b) => a - b)).toEqual(all.map((_, i) => i));
    for (const [idx, x, y, z] of seen) {
      expect(x).toBeCloseTo(all[idx].x, 5); expect(z).toBeCloseTo(all[idx].z, 5);     // a matrix keeps single precision
      expect(y).toBeCloseTo(all[idx].x * 0.01 + all[idx].z * 0.02 - 0.05, 6);
    }
  });

  it('the heads are tinted red, each of them; the leaves carry no colour of their own', () => {
    const tint = new THREE.Color(RED_TINT), c = new THREE.Color();
    expect(tint.r).toBeGreaterThan(0.9);
    expect(Math.max(tint.g, tint.b)).toBeLessThan(0.25);          // pink times it is red, not pink
    for (const { mesh } of of(flower[0])) {
      expect(mesh.instanceColor).not.toBeNull();
      for (let i = 0; i < mesh.count; i++) { mesh.getColorAt(i, c); expect(c.getHex()).toBe(tint.getHex()); }
    }
    expect(of(flower[1]).length).toBeGreaterThan(0);
    for (const { mesh } of of(flower[1])) expect(mesh.instanceColor).toBeNull();
  });

  it('they cast no shadow and are drawn from as far as the meadow\'s flowers: a bed is one cell or two, never the whole valley', () => {
    expect(cells.every((c) => !c.mesh.castShadow)).toBe(true);
    expect(of(flower[0]).length).toBeGreaterThanOrEqual(RED_BEDS.length);
    expect(of(flower[0]).length).toBeLessThanOrEqual(RED_BEDS.length * 4);
  });

  it('the scenery of the valley plants them, of its single pink flower', () => {
    const scenery = (import.meta.glob('./scenery.ts', { query: '?raw', import: 'default', eager: true }) as Record<string, string>)['./scenery.ts'];
    expect(scenery).toMatch(/\n {2}buildRedFlowers\(scene, height, flowerKinds\[PINK_SINGLE\]\);\n/);
    // the flowers of the meadow in their order: the pink single one is the one named
    const kinds = /Promise\.all\(\[(N\('Flower[^\]]*)\]\),/.exec(scenery)![1].split('), ').map((k) => /N\('(\w+)'/.exec(k)![1]);
    const at = Number(/const PINK_SINGLE = (\d+);/.exec(scenery)![1]);
    expect(kinds).toEqual(['Flower3Group', 'Flower4Single', 'Flower3Single', 'Flower4Single']);
    expect(kinds[at]).toBe('Flower3Single');
  });

  it('a flower without a head is an error, not a bed of leaves', () => {
    expect(() => buildRedFlowers(new THREE.Scene(), () => 0, [part('Leaves')])).toThrow(/has no part "Flowers"/);
  });
});
