/**
 * The landmarks of the Sky Islands (./landmarks.ts, ./scenery.ts): each one named mesh where the grey tool looks for it,
 * standing at its landmark of the map and reaching up to its top - in the grey build's shapes and with the models of
 * step 6b (./props.ts, read from the world's packed files); the windmills' sails turn; the clock's hands stand until the
 * finale; the airship's deck is where she stands in its flight, its bow along its way.
 */
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { describe, expect, it } from 'vitest';
import { CAT_DECK, DECK, HELM } from './landmarks';
import { LANDMARKS, MILL, MILLS, OBSERVATORY, SHIP, ZONES } from './layout';
import { PROP_PATHS, type SkyProps } from './props';
import { buildScenery, placeRails, placeTrees } from './scenery';
import { colliders, onGround } from './terrain';

/** The names tools/sky-grey.mjs looks for, by the zone whose landmark each is. */
const NAMES: Record<keyof typeof ZONES, string> = {
  castle: 'landmark-castle', observatory: 'landmark-observatory', dragon: 'landmark-dragon', mills: 'landmark-mills', pier: 'landmark-pier', far: 'landmark-far',
};

function built(props?: Pick<SkyProps, 'airship' | 'windmill'>) {
  const scene = new THREE.Scene();
  colliders.length = 0;
  const s = buildScenery(scene, props);
  return { scene, s };
}
/** A model as the game has it: the world's packed file (worlds-data/sky/, npm run assets). */
const model = async (path: string) => {
  const b = readFileSync(`worlds-data/sky/models/${path}.glb`);
  return (await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).parseAsync(b.buffer.slice(b.byteOffset, b.byteOffset + b.length) as ArrayBuffer, '')).scene;
};
const models = async () => ({ airship: await model(PROP_PATHS.airship), windmill: await model(PROP_PATHS.windmill) });
const named = (scene: THREE.Scene, name: string) => { const out: THREE.Object3D[] = []; scene.traverse((o) => { if (o.name === name) out.push(o); }); return out; };

describe('the landmarks of the Sky Islands, the grey build', () => {
  it.each([['the grey shapes', false], ['the models', true]] as const)('each island has its landmark: one mesh, standing at its place, reaching up to its top (%s)', async (_, withModels) => {
    const { scene } = built(withModels ? await models() : undefined);
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

  it('the airship\'s Sail Ship: one mesh with the balloon, its deck at DECK amidships, as long as the grey hull, its bow +z; the windmills of the model with their sails on their fronts', async () => {
    const { scene, s } = built(await models());
    expect(s.ship.name).toBe('landmark-pier');
    expect(s.ship.parent).toBe(scene);
    const geo = s.ship.geometry;
    geo.computeBoundingBox();
    // (the balloon a little longer than the hull)
    expect(geo.boundingBox!.max.z - geo.boundingBox!.min.z).toBeGreaterThanOrEqual(SHIP.len - 1e-6);
    expect(geo.boundingBox!.max.z - geo.boundingBox!.min.z).toBeLessThan(SHIP.len + 0.5);
    expect(geo.boundingBox!.max.y).toBeCloseTo(SHIP.top, 1);
    // straight down onto the middle of the deck from over it, under the balloon: the deck where she stands in the flight
    const ray = new THREE.Raycaster(new THREE.Vector3(0, DECK + 1.2, 0.3), new THREE.Vector3(0, -1, 0));
    const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
    const hit = ray.intersectObject(mesh)[0];
    expect(hit).toBeTruthy();
    expect(Math.abs(hit.point.y - DECK)).toBeLessThan(0.1);
    // she and the cat in the flight (./ship.ts): on the poop deck, on its boards
    for (const at of [HELM, CAT_DECK]) {
      const r = new THREE.Raycaster(new THREE.Vector3(at.x, at.y + 1.5, at.z), new THREE.Vector3(0, -1, 0)).intersectObject(mesh)[0];
      expect(r, JSON.stringify(at)).toBeTruthy();
      expect(Math.abs(r.point.y - at.y), JSON.stringify(at)).toBeLessThan(0.05);
    }
    // the stern (the rudder's end) toward -z: the Sail Ship's poop deck there, higher than the deck amidships
    const high = (z: number) => { const r = new THREE.Raycaster(new THREE.Vector3(0, DECK + 2.5, z), new THREE.Vector3(0, -1, 0)); return r.intersectObject(mesh)[0]?.point.y ?? -Infinity; };
    expect(high(-SHIP.len * 0.38)).toBeGreaterThan(high(0.3) + 0.3);
    // the windmills: the tower MILL.towerH + roofH, the sails ≈ wingR long, on the side the mill faces, at its top
    const towers = [named(scene, 'landmark-mills')[0], ...named(scene, 'windmill-1'), ...named(scene, 'windmill-2')] as THREE.Mesh[];
    const sails = named(scene, 'mill-sails') as THREE.Mesh[];
    expect(towers).toHaveLength(3);
    MILLS.forEach((m, k) => {
      const box = new THREE.Box3().setFromObject(towers[k]), sail = new THREE.Box3().setFromObject(sails[k]);
      expect(box.max.y - towers[k].position.y).toBeCloseTo(MILL.towerH + MILL.roofH, 1);
      const r = sails[k].geometry.boundingSphere!.radius;
      expect(r).toBeGreaterThan(MILL.wingR * 0.9); expect(r).toBeLessThan(MILL.wingR * 1.2);
      const front = new THREE.Vector3(Math.sin(m.yaw), 0, Math.cos(m.yaw)), out = sails[k].position.clone().sub(towers[k].position).setY(0);
      expect(out.dot(front)).toBeGreaterThan(1);
      expect(sail.max.y).toBeGreaterThan(box.max.y);
    });
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
