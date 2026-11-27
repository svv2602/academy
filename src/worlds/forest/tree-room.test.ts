// @vitest-environment happy-dom
/**
 * The room in Shustrik's tree (./tree-room.ts; the customer's word of 2026-11-27): a round room far past the map behind
 * a little door in the grove's great tree, there once his chain is done; in and out under a fade, the find the first time
 * in; while she is in it the camera sees a short way only, and its floor and wall are the ground, not the forest's rim.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWorldScope } from '../../game/scope';
import { HALF, LANDMARKS, TREE_ROOM, ZONES } from './layout';
import { DOOR_IN, DOOR_OUT, EXIT_OUT, ROOM_CAM, ROOM_FAR, createTreeRoom, roomGeometry, roomGlowGeometry, roomOf, treeDoorOf } from './tree-room';
import { TREE_ROOM_CAMERA_REACH, colliders, height, inTreeRoom, resolve } from './terrain';

function game(open: () => boolean) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(55, 2, 0.3, 600);
  const flags: Record<string, boolean> = {};
  let firsts = 0;
  const g = {
    scene, camera, busy: false, camOverride: null as number | null,
    hero: { root: new THREE.Object3D(), heading: 0 }, cat: { root: new THREE.Object3D() }, pets: { follower: null },
    cam: { target: new THREE.Vector3(), yaw: 0 },
  };
  const scope = createWorldScope(scene);
  const room = createTreeRoom(g as unknown as Parameters<typeof createTreeRoom>[0], scope, {
    open, lit: new THREE.MeshBasicMaterial(), glow: new THREE.MeshBasicMaterial(), told: () => flags.hollow === true,
    inFirst: () => { firsts++; flags.hollow = true; },
  });
  const spot = (label: string) => room.spots.find((s) => s.label === label)!;
  return { g, room, scope, spot, firsts: () => firsts, hp: g.hero.root.position };
}
const near = () => true;

describe('the room in Shustrik\'s tree', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); colliders.length = 0; });

  it('lies far past the map at any stretch of it, its floor flat as far as the camera goes, not the rim', () => {
    expect(Math.hypot(TREE_ROOM.x, TREE_ROOM.z)).toBeGreaterThan(HALF + 100);
    expect(TREE_ROOM.z).toBe(-(HALF + 150));
    for (const [dx, dz] of [[0, 0], [TREE_ROOM.r, 0], [0, -(TREE_ROOM.r + TREE_ROOM_CAMERA_REACH - 0.1)]]) expect(height(TREE_ROOM.x + dx, TREE_ROOM.z + dz)).toBe(TREE_ROOM.y);
    // past the camera's reach the rim again
    expect(height(TREE_ROOM.x, TREE_ROOM.z + TREE_ROOM.r + TREE_ROOM_CAMERA_REACH + 5)).toBeGreaterThan(3);
  });

  it('its wall holds her in, the edge of the forest does not pull her back to the map', () => {
    const p = { x: TREE_ROOM.x + TREE_ROOM.r + 1, z: TREE_ROOM.z };
    resolve(p, 0.4);
    expect(p.x).toBeCloseTo(TREE_ROOM.x + TREE_ROOM.r - 0.4);
    expect(p.z).toBeCloseTo(TREE_ROOM.z);
    const mid = { x: TREE_ROOM.x + 1, z: TREE_ROOM.z - 1 };
    resolve(mid, 0.4);
    expect(mid).toEqual({ x: TREE_ROOM.x + 1, z: TREE_ROOM.z - 1 });
    expect(inTreeRoom(TREE_ROOM.x, TREE_ROOM.z)).toBe(true);
    expect(inTreeRoom(LANDMARKS.grove.x, LANDMARKS.grove.z)).toBe(false);
  });

  it('the door is on the grove\'s great tree, turned to Shustrik\'s glade; she stands before it clear of the trunk', () => {
    const d = treeDoorOf();
    expect(d.tree).toEqual({ x: LANDMARKS.grove.x, z: LANDMARKS.grove.z });
    const toGlade = Math.atan2(ZONES.grove.x - d.tree.x, ZONES.grove.z - d.tree.z);
    expect(Math.abs(Math.atan2(Math.sin(d.face - toGlade), Math.cos(d.face - toGlade)))).toBeLessThan(1e-9);
    expect(Math.hypot(d.door.x - d.tree.x, d.door.z - d.tree.z)).toBeLessThan(1.05);
    // the trunk's collider is 1.1 m (./scenery.ts): she stands outside it with her own radius
    expect(Math.hypot(d.stand.x - d.tree.x, d.stand.z - d.tree.z)).toBeCloseTo(DOOR_OUT);
    expect(DOOR_OUT).toBeGreaterThan(1.1 + 0.4);
  });

  it('the door leads in only once his chain is done: in under the fade, the find once, the camera close and short-sighted', async () => {
    let open = false;
    const t = game(() => open);
    t.room.update(near);
    expect(t.spot('forest_hollow').on()).toBe(false);
    expect((t.g.scene.getObjectByName('forest-tree-door') as THREE.Mesh).visible).toBe(false);
    open = true;
    t.room.update(near);
    expect((t.g.scene.getObjectByName('forest-tree-door') as THREE.Mesh).visible).toBe(true);
    expect(t.spot('forest_hollow').on()).toBe(true);
    t.hp.copy(t.room.doorOut);
    t.spot('forest_hollow').run();
    expect(t.g.busy).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect([t.hp.x, t.hp.z]).toEqual([roomOf().doorIn.x, roomOf().doorIn.z]);
    expect(t.hp.z).toBeCloseTo(TREE_ROOM.z + TREE_ROOM.r - DOOR_IN);
    expect(t.g.busy).toBe(false);
    expect(t.firsts()).toBe(1);
    t.room.update(near);
    expect([t.room.inside(), t.g.camera.far, t.g.camOverride]).toEqual([true, ROOM_FAR, ROOM_CAM]);
    expect(t.g.scene.getObjectByName('forest-tree-room')!.visible).toBe(true);
    expect((t.g.scene.getObjectByName('forest-tree-door') as THREE.Mesh).visible).toBe(false);
    // out by its door inside: before the tree's door, facing away from the trunk; the camera as it was
    t.spot('forest_out').run();
    await vi.advanceTimersByTimeAsync(600);
    expect(Math.hypot(t.hp.x - LANDMARKS.grove.x, t.hp.z - LANDMARKS.grove.z)).toBeCloseTo(EXIT_OUT);
    t.room.update(near);
    expect([t.room.inside(), t.g.camera.far, t.g.camOverride]).toEqual([false, 600, null]);
    expect(t.g.scene.getObjectByName('forest-tree-room')!.visible).toBe(false);
    // in again: no find again
    t.spot('forest_hollow').run();
    await vi.advanceTimersByTimeAsync(600);
    expect(t.firsts()).toBe(1);
    t.scope.dispose();
    expect(t.g.camera.far).toBe(600);
  });

  it('brought in not by the door (the walkthrough\'s teleport), the camera follows her place; far, the door is not drawn', () => {
    const t = game(() => true);
    t.hp.set(TREE_ROOM.x, TREE_ROOM.y, TREE_ROOM.z);
    t.room.update(near);
    expect([t.g.camera.far, t.g.camOverride]).toEqual([ROOM_FAR, ROOM_CAM]);
    t.hp.set(0, 0, 0);
    t.room.update(() => false);
    expect([t.g.camera.far, t.g.camOverride]).toEqual([600, null]);
    expect((t.g.scene.getObjectByName('forest-tree-door') as THREE.Mesh).visible).toBe(false);
  });

  it('from the camera behind her at the door inside (outside the wall) nothing of the room stands between it and her', () => {
    const mesh = new THREE.Mesh(roomGeometry(), new THREE.MeshBasicMaterial());
    const her = new THREE.Vector3(roomOf().doorIn.x, TREE_ROOM.y + 1.0, roomOf().doorIn.z);
    for (const side of [-0.6, 0, 0.6]) {
      // the camera ROOM_CAM m behind her, toward the door, a little up and to a side
      const cam = new THREE.Vector3(her.x + side, her.y + 1.2, her.z + ROOM_CAM);
      const dir = her.clone().sub(cam), far = dir.length();
      const hits = new THREE.Raycaster(cam, dir.normalize(), 0, far).intersectObject(mesh);
      expect(hits.map((h) => h.distance)).toEqual([]);
    }
  });

  it('the store and the bed stand inside, clear of the door; the room is two meshes, no shadow cast, a few thousand triangles', () => {
    const r = roomOf();
    expect(Math.hypot(r.bed.x - TREE_ROOM.x, r.bed.z - TREE_ROOM.z)).toBeLessThan(TREE_ROOM.r - 0.9);
    expect(Math.hypot(r.bed.x - r.doorIn.x, r.bed.z - r.doorIn.z)).toBeGreaterThan(3);
    for (const n of r.niches) expect(Math.abs(Math.atan2(Math.sin(n.a), Math.cos(n.a)))).toBeGreaterThan(1);   // not over the door (at 0)
    expect(roomGeometry().getAttribute('position').count / 3 + roomGlowGeometry().getAttribute('position').count / 3).toBeLessThan(5000);
    const t = game(() => true);
    const meshes: THREE.Mesh[] = [];
    t.g.scene.getObjectByName('forest-tree-room')!.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes.length).toBe(2);
    expect(meshes.some((m) => m.castShadow)).toBe(false);
  });
});
