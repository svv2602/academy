import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { propMaterial, uSway } from '../../core/materials';
import { defaultSave, loadSave, storeSave, worldState } from '../../core/save';
import { MAGIC_MOTES, buildMotes } from './sky';
import { QUESTS } from './quests';
import { SHARD_MAGIC, magicOf } from './magic';

/** In-memory stand-in for localStorage: save.ts talks to the global directly and node has none. */
function memoryStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
  };
}

/** A save of the first world with these friends done (3 steps), one more half done, the crystal restored or not. */
function saveWith(done: number, final = false) {
  const s = defaultSave(), ws = worldState(s, 'fairy');
  QUESTS.slice(0, done).forEach((q) => { ws.quests[q.id] = 3; });
  if (done < QUESTS.length) ws.quests[QUESTS[done].id] = 2;       // a chain on its way gives no shard yet
  ws.final = final;
  return s;
}

describe('the magic of the first world (WORLD-09): read from the progress the save already holds', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it.each([
    [0, false, 0], [1, false, SHARD_MAGIC], [2, false, 2 * SHARD_MAGIC], [4, false, 4 * SHARD_MAGIC],
    [5, false, 5 * SHARD_MAGIC], [5, true, 1],
  ])('%i shards given back, the crystal restored: %s - magic %f', (done, final, want) => {
    expect(magicOf(worldState(saveWith(done, final), 'fairy'))).toBeCloseTo(want, 10);
  });

  it('every shard adds magic, the crystal brings it to 1 and nothing else does', () => {
    const steps = [0, 1, 2, 3, 4, 5].map((n) => magicOf(worldState(saveWith(n), 'fairy')));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    expect(steps[5]).toBeLessThan(1);
    expect(magicOf(worldState(saveWith(5, true), 'fairy'))).toBe(1);
    expect(magicOf(worldState(defaultSave(), 'fairy'))).toBe(0);
  });

  it('is the same after the save is stored and the page loads it again (no new field)', () => {
    for (const [done, final] of [[0, false], [3, false], [5, true]] as const) {
      const s = saveWith(done, final), before = magicOf(worldState(s, 'fairy'));
      storeSave(s);
      const again = loadSave();
      expect(magicOf(worldState(again, 'fairy'))).toBe(before);
      expect(Object.keys(again).sort()).toEqual(Object.keys(defaultSave()).sort());
      expect(Object.keys(worldState(again, 'fairy')).sort()).toEqual(Object.keys(worldState(defaultSave(), 'fairy')).sort());
    }
  });
});

describe('what the magic changes needs no new shader program', () => {
  it('the wind of every swaying material is one shared multiplier, 1 by default (bound when the shader is built)', () => {
    expect(uSway.value).toBe(1);
    for (const sway of [0.0035, 0.45]) {
      const m = propMaterial(sway);
      const sh = { uniforms: {} as Record<string, unknown>, vertexShader: '#include <begin_vertex>', fragmentShader: '' };
      m.onBeforeCompile(sh as unknown as THREE.WebGLProgramParametersWithUniforms, undefined as unknown as THREE.WebGLRenderer);
      expect(sh.uniforms.uSway).toBe(uSway);
      expect(sh.vertexShader).toMatch(/uniform float uSway;/);
      expect(sh.vertexShader).toMatch(/\* uSway;/);
      expect(m.customProgramCacheKey()).toBe('sway' + sway);
    }
  });

  it('the motes of the magic are in the buffer already: with no magic exactly the motes of before are drawn', () => {
    const scene = new THREE.Scene();
    buildMotes(scene, 100);
    const pts = scene.children.at(-1) as THREE.Points;
    expect(pts.geometry.drawRange.count).toBe(100);
    expect(pts.geometry.getAttribute('position').count).toBe(100 + Math.round(100 * MAGIC_MOTES));
    expect(pts.userData.magicCount).toEqual({ base: 100, full: 100 + Math.round(100 * MAGIC_MOTES) });
  });
});
