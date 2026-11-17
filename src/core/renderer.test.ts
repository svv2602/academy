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

async function quality(o: { param: string | null; tier: number }) {
  vi.resetModules();   // the transition is one per page
  const [{ createQuality }, { transition }] = await Promise.all([import('./renderer'), import('../game/transition')]);
  const save = { tier: o.tier, launches: 1, pinTier: null } as unknown as Save;
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
