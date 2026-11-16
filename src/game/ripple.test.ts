import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { RIPPLE_TIME, createRipple } from './ripple';

describe('the tap ripple', () => {
  it('is not drawn until a tap, plays where the tap landed and hides itself when it ends', () => {
    const scene = new THREE.Scene(), r = createRipple(scene);
    expect(scene.children).toContain(r.mesh);
    expect(r.mesh.visible).toBe(false);
    r.play(new THREE.Vector3(3, 1, -2));
    expect(r.playing).toBe(true);
    expect(r.mesh.position.x).toBe(3); expect(r.mesh.position.z).toBe(-2);
    expect(r.mesh.position.y).toBeGreaterThan(1);           // just above the ground, not in it
    for (let t = 0; t < RIPPLE_TIME - 0.05; t += 0.05) r.update(0.05);
    expect(r.playing).toBe(true);
    r.update(0.1);
    expect(r.playing).toBe(false);
  });

  it('a new tap restarts it at the new point', () => {
    const r = createRipple(new THREE.Scene());
    r.play(new THREE.Vector3(0, 0, 0)); r.update(RIPPLE_TIME * 0.8);
    r.play(new THREE.Vector3(5, 0, 5)); r.update(RIPPLE_TIME * 0.8);
    expect(r.playing).toBe(true);
    expect(r.mesh.position.x).toBe(5);
  });

  it('runs on the time it is given: a slow frame does not skip it, a paused one does not move it', () => {
    const r = createRipple(new THREE.Scene()), u = (r.mesh.material as THREE.ShaderMaterial).uniforms.uP;
    r.play(new THREE.Vector3());
    r.update(0); expect(u.value).toBe(0);
    r.update(0.05); expect(u.value).toBeCloseTo(0.05 / RIPPLE_TIME);
  });
});
