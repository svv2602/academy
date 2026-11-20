// @vitest-environment happy-dom
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Save } from './save';

/**
 * The quality tier across a change of world (TECH-15, src/core/renderer.ts): the sun of the new world gets the
 * shadows of the tier, and the slow frames behind the closed frame do not lower the tier. The renderer is a stand-in
 * (no WebGL here); the tiers used have no bloom, so nothing of it is asked for a render target.
 */
const fakeRenderer = () => ({
  setPixelRatio: vi.fn(), setSize: vi.fn(), render: vi.fn(), shadowMap: { enabled: false },
  info: { reset: vi.fn(), render: { triangles: 0, calls: 0 } }, domElement: { width: 800, height: 400 }, autoClear: true,
}) as unknown as THREE.WebGLRenderer;

async function quality(o: { param: string | null; tier: number; last?: number; pin?: number | null }) {
  vi.resetModules();   // the transition is one per page
  const [{ createQuality }, { transition }] = await Promise.all([import('./renderer'), import('../game/transition')]);
  const save = { tier: o.tier, launches: 1, pinTier: o.pin ?? null, ...(o.last !== undefined ? { session: { min: 3, last: o.last, quiet: 0 } } : {}) } as unknown as Save;
  const sun = new THREE.DirectionalLight();
  const scene = new THREE.Scene();
  scene.add(sun);
  const q = createQuality({ renderer: fakeRenderer(), scene, camera: new THREE.PerspectiveCamera(), sun, save, param: o.param, touch: true, debug: false });
  q.apply();
  return { q, sun, save, transition };
}
/** `seconds` of slow frames: 20 a second, well under what the fallback takes for slow. */
function slowFrames(q: { meter(dt: number, persist: () => void): void }, seconds: number, each: () => void = () => {}) {
  for (let i = 0; i < seconds * 20; i++) { each(); q.meter(0.05, () => {}); }
}

/** `seconds` of good frames: 60 a second. */
function fastFrames(q: { meter(dt: number, persist: () => void): void }, seconds: number, each: () => void = () => {}) {
  for (let i = 0; i < seconds * 60; i++) { each(); q.meter(1 / 60, () => {}); }
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('the sun of the world played (TECH-15)', () => {
  it('the new sun casts the shadows of the tier', async () => {
    const { q } = await quality({ param: '1', tier: 1 });
    const next = new THREE.DirectionalLight();
    next.castShadow = false;
    q.setSun(next);
    expect(next.castShadow).toBe(true);
    expect(next.shadow.mapSize.toArray()).toEqual([1024, 1024]);
  });

  it('a tier without shadows: the new sun casts none, whatever its world set', async () => {
    const { q } = await quality({ param: '0', tier: 0 });
    const next = new THREE.DirectionalLight();
    next.castShadow = true;
    q.setSun(next);
    expect(next.castShadow).toBe(false);
  });

  it('from then on the tier is applied to the new sun, and the sun of the world left is not touched again', async () => {
    const { q, sun } = await quality({ param: '1', tier: 1 });
    const next = new THREE.DirectionalLight();
    q.setSun(next);
    const map = { dispose: vi.fn() };
    next.shadow.map = map as unknown as THREE.WebGLRenderTarget;
    const old = { dispose: vi.fn() };
    sun.shadow.map = old as unknown as THREE.WebGLRenderTarget;
    sun.castShadow = false;                 // the world left is gone: its sun is nobody's
    q.apply();                              // a turn of the phone, a pinned tier
    expect(map.dispose).toHaveBeenCalledTimes(1);
    expect(next.shadow.map).toBeNull();
    expect(next.castShadow).toBe(true);
    expect(old.dispose).not.toHaveBeenCalled();
    expect(sun.castShadow).toBe(false);
  });
});

describe('the automatic fallback of the tier and the change of world (TECH-15, TECH-04)', () => {
  it('slow frames of the game lower the tier (the check below is not blind)', async () => {
    const { q, save } = await quality({ param: null, tier: 1 });
    expect(q.tier).toBe(1);
    slowFrames(q, 9);
    expect(q.tier).toBe(0);
    expect(save.tier).toBe(0);
  });

  it('frames slower than 20 a second (7 fps, swiftshader): lowered within 12 s of them, not after 28 (meterTime)', async () => {
    // the game cuts its own time of a frame to 0.05 s; with that, a "second" of the meter was 20 frames (2026-11-20)
    const { meterTime } = await import('./quality');
    const { q } = await quality({ param: null, tier: 1 });   // q2 asks for the bloom: not in the stand-in
    for (let i = 0; i < 84; i++) q.meter(meterTime(1 / 7, false), () => {});   // 12 s of frames
    expect(q.tier).toBe(0);
  });

  it('while the frame is closed for a change of world slow frames lower nothing, however long the world loads', async () => {
    const { q, transition } = await quality({ param: null, tier: 1 });
    slowFrames(q, 6);                       // warmed up, two slow seconds counted already
    transition.start();
    slowFrames(q, 30, () => { transition.frame(0.05); });
    expect(transition.phase).toBe('hold');
    expect(q.tier).toBe(1);
  });

  it('after the change the count starts over: no slow second of the loading is carried into the new world', async () => {
    const { q, transition } = await quality({ param: null, tier: 1 });
    slowFrames(q, 6);
    transition.start();
    slowFrames(q, 10, () => { transition.frame(0.05); });
    transition.ready();
    slowFrames(q, 2, () => { transition.frame(0.05); });
    expect(transition.active).toBe(false);
    // Four seconds of warming up, then three slow seconds in a row: nothing before the seventh second.
    slowFrames(q, 5);
    expect(q.tier).toBe(1);
    slowFrames(q, 4);
    expect(q.tier).toBe(0);
  });
});

describe('the game raises its own tier (TECH-16)', () => {
  it('only while the frame of a change of world is fully closed, after three good minutes; the change is stored', async () => {
    // 0 -> 1: the stand-in renderer has no bloom (tier 2); the wiring is the same for each tier
    const { q, save, transition } = await quality({ param: null, tier: 0 });
    fastFrames(q, 200);                       // past the 3 minutes and the 30 good seconds
    expect(q.tier).toBe(0);                   // no change of world: no raise
    transition.start();
    fastFrames(q, 0.2, () => { transition.frame(1 / 60); });
    expect(transition.phase).toBe('closing');
    expect(q.tier).toBe(0);                   // closing: the change would show in the frame still seen
    fastFrames(q, 1, () => { transition.frame(1 / 60); });
    expect(transition.closed).toBe(true);
    expect(q.tier).toBe(1);
    expect(save.tier).toBe(1);
  });

  it('real frames that dip now and then (the phone of 2026-11-20): still raised at the change of world', async () => {
    const { q, transition } = await quality({ param: null, tier: 0 });
    // 200 seconds at 60 fps, every 20th of them at 57 (a dip of the phone), the frames of each second as they come
    for (let s = 0; s < 200; s++) { const fps = s % 20 === 19 ? 57 : 60; for (let i = 0; i < fps; i++) q.meter(1 / fps, () => {}); }
    transition.start();
    fastFrames(q, 1.5, () => { transition.frame(1 / 60); });
    expect(transition.closed).toBe(true);
    expect(q.tier).toBe(1);
  });

  it('a tier fixed by ?q= or by the parent is never raised', async () => {
    for (const o of [{ param: '0', tier: 0 }, { param: null, tier: 0, pin: 0 }]) {
      const { q, transition } = await quality(o);
      fastFrames(q, 200);
      transition.start();
      fastFrames(q, 2, () => { transition.frame(1 / 60); });
      expect(q.tier).toBe(0);
    }
  });

  it('a launch half an hour after the last frame of play starts one tier higher; a sooner one does not', async () => {
    expect((await quality({ param: null, tier: 0, last: Date.now() - 31 * 60_000 })).q.tier).toBe(1);
    expect((await quality({ param: null, tier: 0, last: Date.now() - 10 * 60_000 })).q.tier).toBe(0);
    expect((await quality({ param: null, tier: 0 })).q.tier).toBe(0);
  });
});
