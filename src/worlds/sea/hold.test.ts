// @vitest-environment happy-dom
/**
 * The hold of the sunken ship (./hold.ts; the customer's word of 2026-11-27): a room far past the map behind the cabin's
 * door, open once Pantsyr's pearl is back; in and out under a fade, the cat's word the first time in; while she is in it
 * the camera sees a short way only, and its floor and walls are the ground, not the sea's rim.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorldScope } from '../../game/scope';
import { CABIN, HALF, HOLD, SHIP } from './layout';
import { DOOR_IN, EXIT_OUT, HOLD_CAM, HOLD_FAR, HOLD_TOLD, createSeaHold, holdGeometry, holdOf } from './hold';
import { HOLD_CAMERA_REACH, colliders, height, inHold, resolve } from './terrain';

vi.mock('../../core/audio', () => ({ speaking: () => false }));

function game(open: () => boolean) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 2, 0.3, 600);
  const said: string[] = [];
  const g = {
    scene, camera, busy: false, camOverride: null as number | null,
    hero: { root: new THREE.Object3D(), heading: 0 }, cat: { root: new THREE.Object3D() }, pets: { follower: null },
    cam: { target: new THREE.Vector3(), yaw: 0 }, ws: { flags: {} as Record<string, unknown> }, persist: () => {},
    groundY: height, speech: { line: (k: string) => { said.push(k); return Promise.resolve(); } },
  };
  const scope = createWorldScope(scene);
  const door = new THREE.Vector3(CABIN.x, height(CABIN.x, CABIN.z), CABIN.z);
  const facing = Math.atan2(CABIN.x - SHIP.x, CABIN.z - SHIP.z);
  const hold = createSeaHold(g as unknown as Parameters<typeof createSeaHold>[0], scope, { door, facing, open });
  const spot = (label: string) => hold.spots.find((s) => s.label === label)!;
  return { g, hold, scope, said, spot, door, facing, hp: g.hero.root.position };
}

describe('the hold of the sunken ship', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); colliders.length = 0; });

  it('lies far past the map at any stretch of it, its floor flat as far as the camera goes, not the rim', () => {
    expect(Math.hypot(HOLD.x, HOLD.z)).toBeGreaterThan(HALF + 100);
    expect(HOLD.z).toBe(-(HALF + 150));
    for (const [dx, dz] of [[0, 0], [HOLD.half, -HOLD.half], [-(HOLD.half + HOLD_CAMERA_REACH - 0.1), HOLD.half]]) expect(height(HOLD.x + dx, HOLD.z + dz)).toBe(HOLD.y);
    // past the camera's reach the rim again
    expect(height(HOLD.x, HOLD.z + HOLD.half + HOLD_CAMERA_REACH + 5)).toBeGreaterThan(5);
  });

  it('its walls hold her in, the edge of the sea does not pull her back to the map', () => {
    const p = { x: HOLD.x + HOLD.half + 1, z: HOLD.z - HOLD.half - 1 };
    resolve(p, 0.4);
    expect(p).toEqual({ x: HOLD.x + HOLD.half - 0.4, z: HOLD.z - HOLD.half + 0.4 });
    const mid = { x: HOLD.x + 1, z: HOLD.z + 1 };
    resolve(mid, 0.4);
    expect(mid).toEqual({ x: HOLD.x + 1, z: HOLD.z + 1 });
    expect(inHold(HOLD.x, HOLD.z)).toBe(true);
    expect(inHold(CABIN.x, CABIN.z)).toBe(false);
  });

  it('the door leads in only once the pearl is back: in under the fade, the cat\'s word once, the camera close and short-sighted', async () => {
    let open = false;
    const t = game(() => open);
    expect(t.spot('sea_hold').on()).toBe(false);
    open = true;
    t.hp.set(t.door.x, t.door.y, t.door.z);
    t.spot('sea_hold').run();
    expect(t.g.busy).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect([t.hp.x, t.hp.z]).toEqual([holdOf().doorIn.x, holdOf().doorIn.z]);
    expect(t.hp.z).toBeCloseTo(HOLD.z + HOLD.half - DOOR_IN);
    expect(t.g.busy).toBe(false);
    t.hold.update(1 / 30, 0);
    expect([t.hold.inside(), t.g.camera.far, t.g.camOverride]).toEqual([true, HOLD_FAR, HOLD_CAM]);
    expect((t.g.scene.getObjectByName('sea-hold') as THREE.Mesh).visible).toBe(true);
    expect([t.said, t.g.ws.flags[HOLD_TOLD]]).toEqual([['sea_hold_in'], true]);
    // out by its door inside: before the cabin's door, facing away from the ship; the camera as it was
    t.spot('sea_out').run();
    await vi.advanceTimersByTimeAsync(600);
    expect(Math.hypot(t.hp.x - t.door.x, t.hp.z - t.door.z)).toBeCloseTo(EXIT_OUT);
    t.hold.update(1 / 30, 0);
    expect([t.hold.inside(), t.g.camera.far, t.g.camOverride]).toEqual([false, 600, null]);
    expect((t.g.scene.getObjectByName('sea-hold') as THREE.Mesh).visible).toBe(false);
    // in again: no word again
    t.spot('sea_hold').run();
    await vi.advanceTimersByTimeAsync(600);
    expect(t.said).toEqual(['sea_hold_in']);
    t.scope.dispose();
    expect(t.g.camera.far).toBe(600);
  });

  it('brought in not by the door (the walkthrough\'s teleport), the camera follows her place', () => {
    const t = game(() => true);
    t.hp.set(HOLD.x, HOLD.y, HOLD.z);
    t.hold.update(1 / 30, 0);
    expect([t.g.camera.far, t.g.camOverride]).toEqual([HOLD_FAR, HOLD_CAM]);
    t.hp.set(CABIN.x, 0, CABIN.z);
    t.hold.update(1 / 30, 0);
    expect([t.g.camera.far, t.g.camOverride]).toEqual([600, null]);
  });

  it('the chest and the barrels stand inside, clear of the door; the room is one light mesh with no shadow', () => {
    const h = holdOf();
    for (const p of [h.chest, ...h.barrels]) {
      expect(Math.abs(p.x - HOLD.x)).toBeLessThan(HOLD.half - 0.6);
      expect(Math.abs(p.z - HOLD.z)).toBeLessThan(HOLD.half - 0.6);
      expect(Math.hypot(p.x - h.doorIn.x, p.z - h.doorIn.z)).toBeGreaterThan(3);
    }
    expect(holdGeometry().getAttribute('position').count / 3).toBeLessThan(4000);
    const t = game(() => true);
    expect((t.g.scene.getObjectByName('sea-hold') as THREE.Mesh).castShadow).toBe(false);
  });
});
