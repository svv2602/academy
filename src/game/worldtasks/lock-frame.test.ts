/**
 * The shell lock in its frame (./lock.ts, ./core.ts taskFrame) on a phone: the number over the gate stands under the
 * bubble of the line (its top quarter of the screen), the shells on the floor are in the picture and big enough for a
 * finger (tools/world-pass.mjs MIN_TAP_PX). The 2026-11-21 picture had the number cut off by the top of the screen.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { createRng } from '../../core/rng';
import { createWorldScope } from '../scope';
import { taskFrame } from './core';
import { generateLock, showLockInWorld } from './lock';

/** The share of the screen's height from its top (0 - the top edge, 1 - the bottom one). */
function framed(w: number, h: number) {
  const cam = new THREE.PerspectiveCamera(55, w / h, 0.3, 600);       // the game's camera (src/core/renderer.ts)
  const hooks = { prompt() {}, number() {}, good() {}, wrong: () => Promise.resolve(), hint: () => Promise.resolve() } as never;
  const show = showLockInWorld(new THREE.Scene(), generateLock(5, createRng('frame')), { x: 0, z: 49, facing: 0 }, hooks, { groundY: () => 0, reach: 60, scope: createWorldScope(new THREE.Scene()) });
  const { cam: c } = taskFrame(show, cam);
  cam.position.set(c.target.x + Math.sin(c.yaw) * Math.cos(c.pitch) * c.dist, c.target.y + Math.sin(c.pitch) * c.dist, c.target.z + Math.cos(c.yaw) * Math.cos(c.pitch) * c.dist);
  cam.lookAt(c.target); cam.updateMatrixWorld();
  const down = (p: THREE.Vector3) => 0.5 - p.clone().project(cam).y * 0.5;
  const px = (p: THREE.Vector3) => { const q = p.clone().project(cam); return new THREE.Vector2(q.x * w / 2, q.y * h / 2); };
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
  const plate = show.sign.children[0] as THREE.Mesh<THREE.CircleGeometry>;
  const top = show.sign.position.clone().setY(show.sign.position.y + plate.geometry.parameters.radius);
  return {
    signTop: down(top),
    shells: show.shells.map((m) => down(m.position)),
    tap: show.targets().map((t) => 2 * px(t.pos).distanceTo(px(t.pos.clone().addScaledVector(right, t.r!)))),
  };
}

describe('the shell lock in its frame on a phone', () => {
  it.each([[844, 390], [390, 844]])('%ix%i: the number over the gate under the bubble, the shells in the picture and big enough to tap', (w, h) => {
    const f = framed(w, h);
    expect(f.signTop).toBeGreaterThan(0.25);
    for (const y of f.shells) expect(y).toBeLessThan(0.9);
    for (const t of f.tap) expect(t).toBeGreaterThanOrEqual(48);
  });
});
