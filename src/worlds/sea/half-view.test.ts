// @vitest-environment happy-dom
/**
 * Pantsyr's halves are seen whole (2026-11-27): the camera of the task's frame stood over the hull of the sunken ship,
 * which hid half of the shell. Turned by HALF_TURN, nothing of the sea (the grey build's hull, its mast, the rocks and
 * kelp) stands between the camera and the shell or a valve, at any of the four sizes and with the most valves (4).
 */
import * as THREE from 'three';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { Spoken } from '../../core/audio';
import { createRng } from '../../core/rng';
import { createWorldScope } from '../../game/scope';
import { blockersOf } from '../../game/worldtasks/blockers';
import { taskFrame } from '../../game/worldtasks/core';
import { generateHalf, showHalfInWorld, type HalfPlace } from '../../game/worldtasks/half-show';
import type { SpokenKey } from '../../ui/strings';
import { FRIENDS, HALF_STEP, HALF_TURN, halfPlace } from './index';
import { buildScenery } from './scenery';
import { colliders, height } from './terrain';

// the world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed here
vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

const quick = () => Promise.resolve() as Spoken;
const hooks = { prompt() {}, good() {}, wrong: quick, hint: quick };
const LINES = { prompt: 'pantsyr_half_start', way: 'sea_half_hint_1', together: 'sea_half_hint_2' } as unknown as { prompt: SpokenKey; way: SpokenKey; together: SpokenKey };
/** The four sizes of the walkthrough: the width over the height, and the camera's fov there (src/core/renderer.ts). */
const SIZES = { mobile: 844 / 390, 'mobile-portrait': 390 / 844, desktop: 1280 / 720, 'desktop-tall': 1280 / 800 };

const turtle = FRIENDS.find((f) => f.id === 'pantsyr')!;
const sea = new THREE.Scene();
buildScenery(sea);
sea.updateMatrixWorld(true);
afterAll(() => { colliders.length = 0; });

/** What stands between the camera, once in the frame of the halves laid at `at`, and the shell or a valve. */
function blockers(at: HalfPlace, aspect: number) {
  const scene = sea;
  const show = showHalfInWorld(scene, generateHalf(5, createRng('half-view'), LINES), at, hooks, { groundY: height, reach: 60, scope: createWorldScope(new THREE.Scene()) });
  scene.updateMatrixWorld(true);
  const { cam } = taskFrame(show, { fov: aspect < 1 ? 70 : 55, aspect });
  // where src/game/camera.ts puts the camera for that frame, kept over the floor as it keeps it
  const eye = new THREE.Vector3(
    cam.target.x + Math.sin(cam.yaw) * Math.cos(cam.pitch) * cam.dist,
    cam.target.y + Math.sin(cam.pitch) * cam.dist,
    cam.target.z + Math.cos(cam.yaw) * Math.cos(cam.pitch) * cam.dist);
  eye.y = Math.max(eye.y, height(eye.x, eye.z) + 0.8);
  expect(show.targets()).toHaveLength(4);
  const names = blockersOf(scene, eye, show).map((b) => b.name);
  show.close();
  return names;
}

describe("Pantsyr's halves are seen whole (WORLD-18)", () => {
  it('his first step is the halves, played in the world before him', () => {
    expect(turtle.steps[0]).toBe(HALF_STEP);
  });

  it.each(Object.entries(SIZES))('%s: nothing between the camera and the shell or a valve', (_, aspect) => {
    expect(blockers(halfPlace(turtle.x, turtle.z, turtle.heading), aspect)).toEqual([]);
  });

  it('facing the turtle straight, the frame looks through the ship: the reason for the turn', () => {
    expect(HALF_TURN).not.toBe(0);
    expect(blockers(halfPlace(turtle.x, turtle.z, turtle.heading, 0), SIZES.desktop)).toContain('landmark-ship');
  });

  it('the turn keeps the hinge where it was: only the frame turns', () => {
    const straight = halfPlace(turtle.x, turtle.z, turtle.heading, 0), turned = halfPlace(turtle.x, turtle.z, turtle.heading);
    expect([turned.x, turned.z]).toEqual([straight.x, straight.z]);
  });
});
