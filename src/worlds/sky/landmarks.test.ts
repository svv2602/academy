/**
 * The landmarks of the Sky Islands (./landmarks.ts, ./scenery.ts): each one named mesh where the grey tool looks for it,
 * standing at its landmark of the map and reaching up to its top; the windmills' sails turn; the clock's hands stand
 * until the finale.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { LANDMARKS, OBSERVATORY, ZONES } from './layout';
import { buildScenery, placeRails, placeTrees } from './scenery';
import { colliders, onGround } from './terrain';

/** The names tools/sky-grey.mjs looks for, by the zone whose landmark each is. */
const NAMES: Record<keyof typeof ZONES, string> = {
  castle: 'landmark-castle', observatory: 'landmark-observatory', dragon: 'landmark-dragon', mills: 'landmark-mills', pier: 'landmark-pier', far: 'landmark-far',
};

function built() {
  const scene = new THREE.Scene();
  colliders.length = 0;
  const s = buildScenery(scene);
  return { scene, s };
}
const named = (scene: THREE.Scene, name: string) => { const out: THREE.Object3D[] = []; scene.traverse((o) => { if (o.name === name) out.push(o); }); return out; };

describe('the landmarks of the Sky Islands, the grey build', () => {
  it('each island has its landmark: one mesh, standing at its place, reaching up to its top', () => {
    const { scene } = built();
    for (const [zone, name] of Object.entries(NAMES) as [keyof typeof ZONES, string][]) {
      const found = named(scene, name);
      expect(found.length, name).toBe(1);
      const m = found[0] as THREE.Mesh;
      const lm = LANDMARKS[zone], box = new THREE.Box3().setFromObject(m);
      expect(box.min.x - 0.05 <= lm.x && lm.x <= box.max.x + 0.05 && box.min.z - 0.05 <= lm.z && lm.z <= box.max.z + 0.05, name).toBe(true);
      expect(Math.hypot(m.position.x - lm.x, m.position.z - lm.z), name).toBeLessThan(0.01);
      expect(box.max.y - m.position.y, name).toBeGreaterThan(lm.top - 0.6);
      expect(box.max.y - m.position.y, name).toBeLessThan(lm.top + 0.6);
    }
    colliders.length = 0;
  });

  it('the observatory is the tallest thing of the world, seen from everywhere; its clock\'s hands still until the finale', () => {
    const { scene, s } = built();
    const tops = Object.values(LANDMARKS).map((l) => l.top);
    expect(LANDMARKS.observatory.top).toBe(Math.max(...tops));
    expect(LANDMARKS.observatory.top).toBe(OBSERVATORY.towerH + OBSERVATORY.domeR);
    expect(named(scene, 'clock-hands')).toHaveLength(1);
    expect(s.hands.rotation.z).toBe(0);
    expect(s.starTop.y).toBeGreaterThan(LANDMARKS.observatory.top);
    colliders.length = 0;
  });

  it('the windmills\' sails turn by code, stand still at 0', () => {
    const { scene, s } = built();
    const sails = named(scene, 'mill-sails') as THREE.Mesh[];
    expect(sails).toHaveLength(3);
    const q = sails[0].quaternion.clone();
    s.turn(1, 0);
    expect(sails[0].quaternion.equals(q)).toBe(true);
    s.turn(1, 0.5);
    expect(sails[0].quaternion.equals(q)).toBe(false);
    colliders.length = 0;
  });

  it('the rails stand on the edges, the trees inside the islands; the budget\'s 20 trees and 30 bushes at most', () => {
    const rails = placeRails();
    expect(rails.length).toBeGreaterThan(100);
    const { trees, bushes } = placeTrees();
    expect(trees.length).toBeLessThanOrEqual(20);
    expect(bushes.length).toBeLessThanOrEqual(30);
    for (const t of [...trees, ...bushes]) expect(onGround(t.x, t.z)).toBe(true);
    // deterministic
    expect(placeTrees()).toEqual({ trees, bushes });
  });
});
