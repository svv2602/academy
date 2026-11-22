/**
 * The landmarks of the Sweet Land (./landmarks.ts, ./scenery.ts): each one named mesh where the grey tool looks for it,
 * standing at its landmark of the map and reaching up to its top; the mill's wings turn; the candle's flame is dark
 * until the finale.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { CAKE, LANDMARKS, MILL, ZONES } from './layout';
import { buildScenery } from './scenery';
import { colliders } from './terrain';

/** The names tools/sweet-grey.mjs looks for, by the zone whose landmark each is. */
const NAMES: Record<keyof typeof ZONES, string> = {
  square: 'landmark-square', palace: 'landmark-palace', garden: 'landmark-garden', town: 'landmark-town', market: 'landmark-market', mill: 'landmark-mill', bridge: 'landmark-bridge',
};

function built() {
  const scene = new THREE.Scene();
  colliders.length = 0;
  const s = buildScenery(scene);
  return { scene, s };
}
const named = (scene: THREE.Scene, name: string) => { const out: THREE.Object3D[] = []; scene.traverse((o) => { if (o.name === name) out.push(o); }); return out; };

describe('the landmarks of the Sweet Land, the grey build', () => {
  it('each zone has its landmark: one mesh, standing at its place, reaching up to its top', () => {
    const { scene } = built();
    for (const [zone, name] of Object.entries(NAMES) as [keyof typeof ZONES, string][]) {
      const found = named(scene, name);
      expect(found.length, name).toBe(1);
      const m = found[0] as THREE.Mesh;
      expect(m.isMesh, name).toBe(true);
      const lm = LANDMARKS[zone], box = new THREE.Box3().setFromObject(m);
      // the point the grey tool aims at is the landmark's own (the bridge's: one of its posts, its deck open between them)
      expect(box.min.x - 0.05 <= lm.x && lm.x <= box.max.x + 0.05 && box.min.z - 0.05 <= lm.z && lm.z <= box.max.z + 0.05, name).toBe(true);
      if (zone !== 'bridge') expect(Math.hypot(m.position.x - lm.x, m.position.z - lm.z), name).toBeLessThan(0.01);
      expect(box.max.y - m.position.y, name).toBeGreaterThan(lm.top - 0.6);
      expect(box.max.y - m.position.y, name).toBeLessThan(lm.top + 0.6);
    }
    colliders.length = 0;
  });

  it('the cake palace: three tiers and a candle tower of 18 m; its flame dark until the finale lights it', () => {
    const { scene, s } = built();
    expect(CAKE.tiers).toHaveLength(3);
    const cake = named(scene, 'landmark-palace')[0];
    expect(new THREE.Box3().setFromObject(cake).max.y - cake.position.y).toBeCloseTo(18, 0);
    expect(s.flame.visible).toBe(false);
    expect(s.candleTop.y).toBeGreaterThan(cake.position.y + 17);
    colliders.length = 0;
  });

  it('the mill\'s wings, ≈12 m across, turn by code; the carousel turns its seats', () => {
    const { scene, s } = built();
    const wings = named(scene, 'mill-wings')[0] as THREE.Mesh;
    wings.geometry.computeBoundingBox();
    const b = wings.geometry.boundingBox!;
    expect(b.max.y - b.min.y).toBeGreaterThan(MILL.wingR * 2 - 0.5);
    const a = wings.rotation.x;
    s.turn(1, 0.5);
    expect(wings.rotation.x).toBeCloseTo(a + 0.5);
    const seats = named(scene, 'carousel-seats')[0];
    s.spin(2, 0.5);
    expect(seats.rotation.y).toBeCloseTo(1);
    s.spin(1, 0);
    expect(seats.rotation.y).toBeCloseTo(1);
    colliders.length = 0;
  });

  it('the scenery is light: few meshes, each kind of scattered sweet one instanced mesh', () => {
    const { scene } = built();
    let meshes = 0, tris = 0;
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      meshes++;
      const g = m.geometry, n = g.index ? g.index.count / 3 : g.getAttribute('position').count / 3;
      tris += n * ((m as THREE.InstancedMesh).isInstancedMesh ? (m as THREE.InstancedMesh).count : 1);
    });
    expect(meshes).toBeLessThanOrEqual(30);
    expect(tris).toBeLessThan(250_000);
    colliders.length = 0;
  });
});
