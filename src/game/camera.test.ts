// @vitest-environment happy-dom
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { WATER_LIFT, WATER_SOFT, createCamera } from './camera';
import type { Game } from './context';

/** The parts of the game the camera reads; the heroine stands at (0, 0, 0), then is put 3 m away. */
function game(water = false) {
  const g = {
    hero: { root: new THREE.Object3D(), heading: 0 },
    cam: { yaw: 0, pitch: 0.36, dist: 6, target: new THREE.Vector3(0, 1.5, 0), focus: null as THREE.Vector3 | null },
    camera: new THREE.PerspectiveCamera(50, 844 / 390, 0.1, 500),
    groundY: () => 0, started: () => true, camTask: null, camOverride: null, camPitchMin: null,
    world: { move: water ? { kind: 'swim', height: 0.6 } : undefined },
  };
  return g as unknown as Game & typeof g;
}
/** `seconds` of frames of `dt` after the heroine has moved 3 m: where the camera is. */
function after(g: Game, dt: number, seconds: number) {
  const c = createCamera(g, () => 6.5);
  g.hero.root.position.set(3, 0, 0);
  for (let t = 0; t < seconds - 1e-9; t += dt) { c.look(); c.update(dt, t, 0); }
  return { pos: g.camera.position.clone(), pitch: g.cam.pitch, target: g.cam.target.clone() };
}

describe('the camera behind the heroine (ARCH-05): the same however many frames a second', () => {
  it('after the same game time it stands at the same place at 30 and at 144 frames a second (it glides by 1 - e^(-k dt))', () => {
    for (const water of [false, true]) {
      const slow = after(game(water), 1 / 30, 0.5), fast = after(game(water), 1 / 144, 0.5);
      expect(slow.pos.distanceTo(fast.pos), `water ${water}`).toBeLessThan(0.02);
      expect(Math.abs(slow.pitch - fast.pitch), `water ${water}`).toBeLessThan(0.002);
    }
  });
});

/**
 * Every other way the camera moves, at 20 frames a second (the slowest the loop hands on whole: src/game/loop.ts cuts dt
 * at 0.05 s, below that the game's time itself runs slower) and at 144: after the same game time, the same camera.
 */
describe('the camera of a task, of a conversation and of her walking: the same at 20 and at 144 frames a second', () => {
  const run = (setup: (g: Game & ReturnType<typeof game>) => void, dt: number, seconds: number, mag = 0) => {
    const g = game();
    const c = createCamera(g, () => 6.5);
    setup(g);
    // whole frames: 0.5 s is 10 frames at 20 a second and 72 at 144
    for (let i = 0, n = Math.round(seconds / dt); i < n; i++) { c.look(); c.update(dt, i * dt, mag); }
    return { pos: g.camera.position.clone(), yaw: g.cam.yaw, pitch: g.cam.pitch, dist: g.cam.dist };
  };
  const same = (setup: Parameters<typeof run>[0], seconds: number, mag = 0) => {
    const slow = run(setup, 1 / 20, seconds, mag), fast = run(setup, 1 / 144, seconds, mag);
    // and it did move: a test of a camera standing still would hold whatever the frames
    const start = run(setup, 1 / 144, 0, mag);
    expect(Math.abs(fast.yaw - start.yaw) + fast.pos.distanceTo(start.pos)).toBeGreaterThan(0.3);
    expect(slow.pos.distanceTo(fast.pos)).toBeLessThan(0.03);
    expect(Math.abs(slow.yaw - fast.yaw)).toBeLessThan(0.005);
    expect(Math.abs(slow.pitch - fast.pitch)).toBeLessThan(0.002);
    expect(Math.abs(slow.dist - fast.dist)).toBeLessThan(0.01);
  };

  it('glides to the frame of a task in the world (g.camTask): its spot, turn, tilt and distance', () => {
    same((g) => { g.camTask = { target: new THREE.Vector3(2, 0.5, -3), yaw: 2.2, pitch: 1.0, dist: 9, catAt: new THREE.Vector3() } as never; }, 0.5);
  });

  it('turns to a conversation (cam.focus) and comes nearer', () => {
    same((g) => { g.cam.focus = new THREE.Vector3(-2, 1, 4); g.hero.root.position.set(1, 0, 1); }, 0.5);
  });

  it('swings behind her while she walks with the stick, turned away from it', () => {
    same((g) => { g.hero.heading = Math.PI / 2; }, 1.5, 1);
  });
});

describe('under water (docs/worlds/world-3.md): higher and softer', () => {
  it(`it stands ${WATER_LIFT} m higher with the same tilt: the horizon stays where it is on the screen`, () => {
    const sea = after(game(true), 1 / 60, 5), land = after(game(false), 1 / 60, 5);
    expect(sea.pos.y - land.pos.y).toBeCloseTo(WATER_LIFT, 2);
    expect(sea.pitch).toBeCloseTo(land.pitch, 4);
  });
  it(`it follows her at ${WATER_SOFT} of its usual speed: a quarter second after she moved it is further behind`, () => {
    const land = after(game(false), 1 / 60, 0.25), sea = after(game(true), 1 / 60, 0.25);
    const left = (r: { target: THREE.Vector3 }) => 3 - r.target.x;
    expect(left(sea)).toBeGreaterThan(left(land) * 1.5);
    // and both come to her in the end
    expect(after(game(true), 1 / 60, 5).target.x).toBeCloseTo(3, 2);
  });
});
