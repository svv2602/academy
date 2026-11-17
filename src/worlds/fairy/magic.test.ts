import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { propMaterial, uSway } from '../../core/materials';
import { defaultSave, loadSave, storeSave, worldState } from '../../core/save';
import { MAGIC_MOTES, buildMotes, type buildSky } from './sky';
import { QUESTS } from './quests';
import { MAGIC_BUTTERFLIES, SHARD_MAGIC, createMagic, magicOf } from './magic';
import type { FairyLoads } from './load';
import type { Game } from '../../game/context';
import { Butterflies } from '../../game/butterflies';

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

describe('the small living things grow with the magic (WORLD-09): flowers, motes, butterflies', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  /** A first world in small: two cells of flowers marked as ./scenery.ts marks them, the motes of ./sky.ts, a flock. */
  function world() {
    const scene = new THREE.Scene();
    const cells = [{ base: 5, full: 9 }, { base: 0, full: 4 }].map((n) => {
      const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(), new THREE.MeshBasicMaterial(), n.full);
      mesh.userData.magicCount = n; mesh.count = n.base;
      scene.add(mesh);
      return mesh;
    });
    buildMotes(scene, 100);
    const motes = scene.children.at(-1) as THREE.Points;
    const flies = new Butterflies(scene, 96, () => 0);
    for (let i = 0; i < 6; i++) flies.add(i, i, 1, '#ffffff');        // the ambient ones, there with no magic
    const g = { scene, ws: worldState(saveWith(0), 'fairy'), flies } as unknown as Game;
    const sky = {
      sky: new THREE.Mesh(new THREE.BufferGeometry(), new THREE.ShaderMaterial({ uniforms: { uGlow: { value: 0 } } })),
      fog: new THREE.Fog('#ffffff', 70, 300), hemi: new THREE.HemisphereLight(), sun: new THREE.DirectionalLight(),
    } as unknown as ReturnType<typeof buildSky>;
    const magic = createMagic(g, { rainbowAlpha: { value: 0 } } as unknown as FairyLoads, sky);
    const count = () => ({
      flowers: cells.reduce((s, m) => s + m.count, 0),
      motes: motes.geometry.drawRange.count,
      butterflies: flies.flies.filter((f) => f.scale > 0).length,
    });
    return { magic, count };
  }

  it('none of them falls as the magic grows, and with all of it there are more of each than with none', () => {
    const { magic, count } = world();
    const at = [0, 0.25, 0.5, 0.75, 1].map((m) => { magic.set(m); return count(); });
    for (let i = 1; i < at.length; i++) {
      for (const k of ['flowers', 'motes', 'butterflies'] as const) expect(at[i][k], `${k} at step ${i}`).toBeGreaterThanOrEqual(at[i - 1][k]);
    }
    for (const k of ['flowers', 'motes', 'butterflies'] as const) expect(at[4][k], k).toBeGreaterThan(at[0][k]);
    expect(at[0]).toEqual({ flowers: 5, motes: 100, butterflies: 6 });
    expect(at[4]).toEqual({ flowers: 13, motes: 100 + Math.round(100 * MAGIC_MOTES), butterflies: 6 + MAGIC_BUTTERFLIES });
  });
});
