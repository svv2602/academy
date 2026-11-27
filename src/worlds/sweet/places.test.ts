// @vitest-environment happy-dom
/**
 * The secret places of the Sweet Land (plan idea/proposal/sweet-secrets-2026-11-27): the cave behind the chocolate
 * waterfall (./cave.ts) and Imbir's room (./room.ts) - where they stand, what they draw, the find once, the room's door
 * only after ruby 2, the way in and out with the cat and the pet.
 */
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createWorldScope } from '../../game/scope';
import { CAVE, EASEL, EDGE, HALF, HOUSE, HOUSE_DOOR, MILL, MILLSTONE, RIVER, RIVER_HALF, ROOM, SPAWN, ZONES } from './layout';
import { CAVE_CAM, FIND_R, SHOW_NEAR, caveGeometry, caveOf, caveStones, createChocoCave, curtainGeometry } from './cave';
import { DOOR_IN, ROOM_CAM, ROOM_FAR, ROOM_TOLD, createSweetRoom, roomGeometry, roomOf } from './room';
import { colliders, height, inRoom, lineDist, pathDist, resolve, riverDist } from './terrain';
import { COLLECT } from './collect';
import { SWEET_FLYOVER } from './flyover-path';

vi.mock('../../core/audio', () => ({ speaking: () => false }));

const scopes: ReturnType<typeof createWorldScope>[] = [];
afterEach(() => { for (const s of scopes.splice(0)) s.dispose(); colliders.length = 0; vi.useRealTimers(); });

describe('the cave behind the chocolate waterfall', () => {
  it('stands just past the river\'s end, its mouth toward the river, dry before it; off the ways, the mill, the finds and the tour', () => {
    const c = caveOf(), end = RIVER[RIVER.length - 1];
    expect(Math.hypot(CAVE.x, CAVE.z) + CAVE.r + 1).toBeLessThan(HALF - EDGE);
    // the mouth faces the river's end, a strip of dry bank between them
    expect(Math.hypot(c.mouth.x - end.x, c.mouth.z - end.z)).toBeLessThan(RIVER_HALF + 2);
    expect(riverDist(c.mouth.x, c.mouth.z)).toBeGreaterThan(RIVER_HALF + 0.5);
    for (const s of caveStones()) expect(riverDist(s.x, s.z)).toBeGreaterThan(RIVER_HALF);
    expect(pathDist(CAVE.x, CAVE.z)).toBeGreaterThan(CAVE.r + 3);
    for (const p of [MILL, MILLSTONE, EASEL, SPAWN, ZONES.mill]) expect(Math.hypot(p.x - CAVE.x, p.z - CAVE.z)).toBeGreaterThan(CAVE.r + 3);
    for (const f of COLLECT.items) expect(Math.hypot(f.x - CAVE.x, f.z - CAVE.z), `find at ${f.x},${f.z}`).toBeGreaterThan(CAVE.r + 1);
    for (const p of SWEET_FLYOVER.points) if (p.pos[1] < CAVE.h + 2) expect(Math.hypot(p.pos[0] - CAVE.x, p.pos[2] - CAVE.z)).toBeGreaterThan(CAVE.r + 2);
    // the basket at the back, the find in the middle
    expect(Math.hypot(c.basket.x - CAVE.x, c.basket.z - CAVE.z)).toBeLessThan(CAVE.r);
    void lineDist;
  });

  it('its wall stones stop her, its mouth lets her in: from the mouth she walks to the find', () => {
    const scope = createWorldScope(new THREE.Scene()); scopes.push(scope);
    const g = { scene: new THREE.Scene(), hero: { root: new THREE.Object3D() }, camOverride: null as number | null };
    createChocoCave(g as never, scope, () => {});
    const c = caveOf(), p = { x: c.mouth.x + c.out.x * 1.5, z: c.mouth.z + c.out.z * 1.5 };
    for (let k = 0; k <= 40; k++) { p.x += (c.find.x - p.x) * 0.1; p.z += (c.find.z - p.z) * 0.1; resolve(p, 0.4); }
    expect(Math.hypot(p.x - c.find.x, p.z - c.find.z)).toBeLessThan(0.3);
    // from behind the cave she cannot walk through its back wall
    const q = { x: CAVE.x - c.out.x * (CAVE.r + 1.5), z: CAVE.z - c.out.z * (CAVE.r + 1.5) };
    for (let k = 0; k <= 40; k++) { q.x += (CAVE.x - q.x) * 0.1; q.z += (CAVE.z - q.z) * 0.1; resolve(q, 0.4); }
    expect(Math.hypot(q.x - CAVE.x, q.z - CAVE.z)).toBeGreaterThan(CAVE.r - 0.8);
  });

  it('two meshes, no shadow; the pouring drawn only near; walking up to the basket finds it; the camera comes close inside', () => {
    const scene = new THREE.Scene(), scope = createWorldScope(scene); scopes.push(scope);
    const g = { scene, hero: { root: new THREE.Object3D() }, camOverride: null as number | null };
    const found: THREE.Vector3[] = [];
    const cave = createChocoCave(g as never, scope, (at) => { found.push(at); });
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes.map((m) => m.name).sort()).toEqual(['choco-cave', 'choco-fall']);
    for (const m of meshes) expect(m.castShadow).toBe(false);
    const hp = g.hero.root.position, c = caveOf();
    hp.set(CAVE.x + SHOW_NEAR + 5, 0, CAVE.z); cave.update(0);
    expect(cave.debug.curtain.visible).toBe(false);
    // at the mouth, under the pouring: not found yet
    hp.set(c.mouth.x + c.out.x * 0.5, 0, c.mouth.z + c.out.z * 0.5); cave.update(0.1);
    expect([cave.debug.curtain.visible, found.length, g.camOverride]).toEqual([true, 0, null]);
    hp.set(c.find.x, 0, c.find.z); cave.update(0.2);
    expect(found).toHaveLength(1);
    expect(g.camOverride).toBe(CAVE_CAM);
    hp.set(c.mouth.x + c.out.x * 4, 0, c.mouth.z + c.out.z * 4); cave.update(0.3);
    expect(g.camOverride).toBeNull();
    expect(FIND_R).toBeLessThan(CAVE.r);
    // light: a few thousand triangles
    const tris = [caveGeometry(), curtainGeometry()].reduce((n, geo) => n + geo.getAttribute('position').count / 3, 0);
    expect(tris).toBeLessThan(6000);
    // leaving the world takes them away
    scope.dispose(); scopes.length = 0;
    expect(scene.getObjectByName('choco-cave')).toBeUndefined();
  });
});

describe('Imbir\'s room', () => {
  it('far past the map, its floor ground, its walls keeping her; the map\'s edge does not pull her back from it', () => {
    expect(ROOM.z).toBeLessThan(-(HALF + 100));
    expect(height(ROOM.x, ROOM.z)).toBe(ROOM.y);
    expect(inRoom(ROOM.x, ROOM.z)).toBe(true);
    expect(inRoom(0, 0)).toBe(false);
    const p = { x: ROOM.x + ROOM.half + 1, z: ROOM.z };
    resolve(p, 0.4);
    expect(p.x).toBeCloseTo(ROOM.x + ROOM.half - 0.4);
    expect(p.z).toBe(ROOM.z);
  });

  /** A game of what the room reads, its door before Imbir's house. */
  function make(open = false) {
    vi.useFakeTimers();
    const scene = new THREE.Scene(), scope = createWorldScope(scene); scopes.push(scope);
    const said: string[] = [], jarRuns: number[] = [];
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 500);
    const g = {
      scene, camera, hero: { root: new THREE.Object3D(), heading: 0 }, cat: { root: new THREE.Object3D() }, pets: { follower: { root: new THREE.Object3D() } },
      ws: { flags: {} as Record<string, unknown> }, busy: false, camOverride: null as number | null,
      cam: { target: new THREE.Vector3(), yaw: 0 }, groundY: (x: number, z: number) => height(x, z), persist: () => {},
      speech: { line: (k: string) => { said.push(k); return Promise.resolve(); } },
    };
    const state = { open };
    const door = new THREE.Vector3(HOUSE_DOOR.x, height(HOUSE_DOOR.x, HOUSE_DOOR.z), HOUSE_DOOR.z);
    const room = createSweetRoom(g as never, scope, { door, facing: Math.PI / 2, open: () => state.open, jar: { label: 'open', on: () => true, run: () => { jarRuns.push(1); } } });
    return { g, room, state, said, jarRuns, scene, camera };
  }

  it('the door leads in only once ruby 2 is taken; in and out under the fade, the cat and the pet beside her; the cat\'s word once', () => {
    const t = make(false);
    const enter = t.room.spots.find((s) => s.label === 'sweet_room')!, leave = t.room.spots.find((s) => s.label === 'sweet_out')!;
    expect(enter.on()).toBe(false);
    t.state.open = true;
    expect(enter.on()).toBe(true);
    enter.run();
    expect(t.g.busy).toBe(true);
    vi.advanceTimersByTime(600);
    const hp = t.g.hero.root.position;
    expect(inRoom(hp.x, hp.z)).toBe(true);
    expect(Math.hypot(hp.x - roomOf().doorIn.x, hp.z - roomOf().doorIn.z)).toBeLessThan(0.01);
    expect(Math.hypot(t.g.cat.root.position.x - hp.x, t.g.cat.root.position.z - hp.z)).toBeLessThan(1.5);
    expect(inRoom(t.g.pets.follower.root.position.x, t.g.pets.follower.root.position.z)).toBe(true);
    expect([t.g.busy, t.g.camOverride, t.said, t.g.ws.flags[ROOM_TOLD]]).toEqual([false, ROOM_CAM, ['sweet_room_in'], true]);
    t.room.update();
    expect([t.scene.getObjectByName('sweet-room')!.visible, t.camera.far]).toEqual([true, ROOM_FAR]);
    // out by its door: before the house, facing away from it; the word not said again on the next visit
    leave.run(); vi.advanceTimersByTime(600); t.room.update();
    expect(inRoom(hp.x, hp.z)).toBe(false);
    expect(hp.x).toBeGreaterThan(HOUSE.x + HOUSE.w / 2);
    expect([t.scene.getObjectByName('sweet-room')!.visible, t.camera.far, t.g.camOverride]).toEqual([false, 500, null]);
    enter.run(); vi.advanceTimersByTime(600);
    expect(t.said).toEqual(['sweet_room_in']);
  });

  it('the jar\'s action is its spot by the cupboard; one mesh drawn only with her inside', () => {
    const t = make(true);
    const jar = t.room.spots.find((s) => s.label === 'open')!;
    expect(Math.hypot(jar.pos.x - roomOf().cupboard.x, jar.pos.z - roomOf().cupboard.z)).toBeLessThan(1.6);
    jar.run();
    expect(t.jarRuns).toEqual([1]);
    const meshes: THREE.Mesh[] = [];
    t.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
    expect(meshes.map((m) => m.name)).toEqual(['sweet-room']);
    t.room.update();
    expect(meshes[0].visible).toBe(false);
    expect(roomGeometry().getAttribute('position').count / 3).toBeLessThan(8000);
    expect(DOOR_IN).toBeLessThan(ROOM.half);
  });
});
