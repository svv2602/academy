/**
 * The landmarks of the sea, step B of its look (./landmarks.ts, ./paint.ts): each one painted shape - one draw call -
 * light, standing where the grey build had it, the throne's lid opening, the ship drawn without its file too.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { buildLandmarks } from './landmarks';
import { LANDMARKS } from './layout';
import { Paint, paintMaterial } from './paint';
import { colliders } from './terrain';

const LANDMARK_NAMES = ['castle', 'landmark-reef', 'landmark-grotto', 'landmark-trench', 'landmark-garden', 'landmark-ship', 'landmark-square'];

function built() {
  const scene = new THREE.Scene();
  colliders.length = 0;
  const throne = buildLandmarks(scene, null);
  return { scene, throne };
}

describe('the landmarks of the sea (the look, step B)', () => {
  it('a landmark is one mesh of the shared painted material, light', () => {
    const { scene } = built();
    for (const name of LANDMARK_NAMES) {
      const found: THREE.Mesh[] = [];
      scene.traverse((o) => { if (o.name === name) found.push(o as THREE.Mesh); });
      expect(found.length, name).toBe(1);
      const m = found[0];
      expect(m.children.length, name).toBe(0);
      expect(m.material, name).toBe(paintMaterial());
      const tris = m.geometry.getAttribute('position').count / 3;
      expect(tris, name).toBeLessThanOrEqual(12_000);
      for (const a of ['color', 'glow', 'normal']) expect(m.geometry.getAttribute(a), `${name} ${a}`).toBeTruthy();
    }
  });

  it('each stands at its landmark of the grey build and reaches up to its top', () => {
    const { scene } = built();
    const at: Record<string, keyof typeof LANDMARKS> = { 'landmark-reef': 'reef', 'landmark-grotto': 'grotto', 'landmark-trench': 'trench', 'landmark-garden': 'garden', castle: 'throne' };
    for (const [name, key] of Object.entries(at)) {
      const box = new THREE.Box3().setFromObject(scene.getObjectByName(name)!), L = LANDMARKS[key];
      expect(box.containsPoint(new THREE.Vector3(L.x, box.min.y + 0.01, L.z)) || name === 'castle', name).toBe(true);
      expect(box.max.y - box.min.y, name).toBeGreaterThanOrEqual(L.top * 0.9);
    }
  });

  it('the throne opens its lid, and only between shut and open', () => {
    const { scene, throne } = built();
    const lid = scene.getObjectByName('throne-lid')!.parent!;
    throne.open(0); expect(lid.rotation.x).toBe(0);
    throne.open(0.5); const half = lid.rotation.x;
    throne.open(1); expect(lid.rotation.x).toBeGreaterThan(half);
    throne.open(3); const open = lid.rotation.x;
    throne.open(1); expect(lid.rotation.x).toBe(open);
    expect(half).toBeGreaterThan(0);
  });

  it('the hall\'s columns keep the way from the gate to the throne open', () => {
    built();
    const gate = LANDMARKS.gate, throne = LANDMARKS.throne;
    // a column of the hall: a collider inside the ring but not a tower's; none within 1.5 m of the line gate - throne
    for (const c of colliders.filter((c) => Math.hypot(c.x - throne.x, c.z - throne.z) < 5.5)) {
      const t = Math.max(0, Math.min(1, ((c.x - gate.x) * (throne.x - gate.x) + (c.z - gate.z) * (throne.z - gate.z)) / ((throne.x - gate.x) ** 2 + (throne.z - gate.z) ** 2)));
      expect(Math.hypot(c.x - (gate.x + (throne.x - gate.x) * t), c.z - (gate.z + (throne.z - gate.z) * t))).toBeGreaterThan(1.5);
    }
  });

  it('a painted part seen both ways has its faces twice, turned', () => {
    const one = new Paint().add(new THREE.PlaneGeometry(1, 1), '#fff').geometry(), two = new Paint().add(new THREE.PlaneGeometry(1, 1), '#fff', 0, undefined, true).geometry();
    expect(two.getAttribute('position').count).toBe(one.getAttribute('position').count * 2);
    const n = two.getAttribute('normal');
    expect(n.getZ(0)).toBeCloseTo(-n.getZ(6));
  });
});
