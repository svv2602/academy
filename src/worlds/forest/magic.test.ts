// @vitest-environment happy-dom
/** The magic of the forest (WORLD-09, ./magic.ts): read from the save, laid on the evening the customer took. */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { uSway } from '../../core/materials';
import { mat } from '../../core/style';
import { defaultSave, loadSave, storeSave, worldState } from '../../core/save';
import { Butterflies } from '../../game/butterflies';
import type { Game } from '../../game/context';
import { PART_MAGIC } from '../../game/magic';
import { createWorldScope } from '../../game/scope';
import { buildFireflies } from './fireflies';
import { FRIENDS, SKY } from './index';
import { BLOOM, GLADE_OF, MAGIC_BUTTERFLIES, MAGIC_GLOW, MAGIC_LOOK, MAGIC_SWAY, PATH_FLIES, RAY_ALPHA, createForestMagic, forestMagicOf } from './magic';
import { uBloom } from './undergrowth';

vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

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

/** A save of the forest with the chains of its first `done` characters finished, the next one half done. */
function saveWith(done: number, final = false) {
  const s = defaultSave(), ws = worldState(s, 'forest');
  FRIENDS.slice(0, done).forEach((c) => { ws.quests[c.id] = c.steps.length; });
  if (done < FRIENDS.length) ws.quests[FRIENDS[done].id] = 1;       // a chain on its way gives no leaf yet
  ws.final = final;
  return s;
}

/** The forest's evening as ./index.ts builds it, its lights named as the scenery names them, and its fireflies. */
function forest(done: number, final = false) {
  const save = saveWith(done, final), ws = worldState(save, 'forest');
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY.background);
  scene.fog = new THREE.Fog(SKY.haze, MAGIC_LOOK.fogNear[0], 100);
  const sun = new THREE.DirectionalLight(SKY.sun, SKY.sunPower), hemi = new THREE.HemisphereLight(SKY.skyLight, SKY.groundLight, SKY.hemiPower);
  scene.add(sun, hemi);
  const shared = mat.glow('gold', 1.2);
  for (const name of Object.keys(MAGIC_GLOW)) { const m = new THREE.Mesh(new THREE.BoxGeometry(), shared); m.name = name; scene.add(m); }
  const fireflies = buildFireflies(scene);
  const flies = new Butterflies(scene, 96, () => 0);
  const g = { scene, ws, save, flies, groundY: () => 0 } as unknown as Game;
  const scope = createWorldScope(scene);
  const magic = createForestMagic(g, scope, { sky: { sun, sunOffset: new THREE.Vector3(-30, 24, 18) }, fireflies, characters: FRIENDS });
  const lit = (pick: (i: number) => boolean) => [...fireflies.lit].filter((_, i) => pick(i));
  return { scene, ws, sun, hemi, shared, fireflies, flies, scope, magic, lit, rays: scene.getObjectByName('forest-rays') as THREE.InstancedMesh };
}

describe('the magic of the forest (WORLD-09): read from the progress the save already holds', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); uSway.value = 1; uBloom.value = 1; });

  it.each([[0, false, 0], [2, false, 2 * PART_MAGIC], [3, false, 0.48], [5, false, 5 * PART_MAGIC], [5, true, 1]])(
    '%i leaves given back, the Emerald restored: %s - magic %f', (done, final, want) => {
      expect(forestMagicOf(worldState(saveWith(done, final), 'forest'), FRIENDS)).toBeCloseTo(want, 10);
    });

  it('every leaf adds magic, the Emerald brings it to 1; the same after the save is stored and loaded again', () => {
    const steps = [0, 1, 2, 3, 4, 5].map((n) => forestMagicOf(worldState(saveWith(n), 'forest'), FRIENDS));
    for (let i = 1; i < steps.length; i++) expect(steps[i]).toBeGreaterThan(steps[i - 1]);
    expect(steps[5]).toBeLessThan(1);
    for (const [done, final] of [[0, false], [3, false], [5, true]] as const) {
      const s = saveWith(done, final), before = forestMagicOf(worldState(s, 'forest'), FRIENDS);
      storeSave(s);
      const again = loadSave();
      expect(forestMagicOf(worldState(again, 'forest'), FRIENDS)).toBe(before);
      expect(Object.keys(worldState(again, 'forest')).sort()).toEqual(Object.keys(worldState(defaultSave(), 'forest')).sort());
    }
  });

  it('with no magic the evening is the customer\'s: its sky, haze and lights as ./index.ts SKY', () => {
    const f = forest(0);
    expect(f.magic.value).toBe(0);
    expect('#' + (f.scene.background as THREE.Color).getHexString()).toBe(SKY.background);
    expect('#' + (f.scene.fog as THREE.Fog).color.getHexString()).toBe(SKY.haze);
    expect('#' + f.sun.color.getHexString()).toBe(SKY.sun);
    expect(f.sun.intensity).toBe(SKY.sunPower);
    expect(f.hemi.intensity).toBe(SKY.hemiPower);
    expect(MAGIC_LOOK.background[0]).toBe(SKY.background);
    expect(MAGIC_LOOK.haze[0]).toBe(SKY.haze);
    expect(MAGIC_LOOK.sun[0]).toBe(SKY.sun);
    expect(MAGIC_LOOK.sunPower[0]).toBe(SKY.sunPower);
    expect(MAGIC_LOOK.hemiPower[0]).toBe(SKY.hemiPower);
    expect(uSway.value).toBe(1);
    expect(uBloom.value).toBe(BLOOM);
  });

  it('the magic adds: a brighter sun and sky light, the lights glow, the wind bends more, the flowers open', () => {
    const f = forest(5, true);
    expect(f.magic.value).toBe(1);
    expect(f.sun.intensity).toBe(MAGIC_LOOK.sunPower[1]);
    expect(f.hemi.intensity).toBe(MAGIC_LOOK.hemiPower[1]);
    expect(uSway.value).toBe(MAGIC_SWAY);
    expect(uBloom.value).toBe(1);
    for (const [name, glow] of Object.entries(MAGIC_GLOW)) {
      const m = (f.scene.getObjectByName(name) as THREE.Mesh).material as THREE.MeshStandardMaterial;
      expect(m.emissiveIntensity).toBe(glow[1]);
    }
  });

  it('the lights get materials of their own: the style\'s shared glow is left as it was', () => {
    const f = forest(0);
    expect(f.shared.emissiveIntensity).toBe(1.2);
    const mats = Object.keys(MAGIC_GLOW).map((n) => (f.scene.getObjectByName(n) as THREE.Mesh).material);
    for (const m of mats) expect(m).not.toBe(f.shared);
    // one of its own for every light, though they shared one: each has its own glow
    expect(new Set(mats).size).toBe(Object.keys(MAGIC_GLOW).length);
  });

  it('the fireflies of a glade wake with its character\'s chain; of the paths\' ones half with no magic, all with all of it', () => {
    const f = forest(2);
    const glade = (who: string) => (i: number) => { const z = f.fireflies.flies[i].zone; return z !== null && GLADE_OF[z] === who; };
    expect(f.lit(glade('borovik')).every((v) => v === 1)).toBe(true);
    expect(f.lit(glade('mudrena')).every((v) => v === 1)).toBe(true);
    for (const who of ['shustrik', 'yasen', 'kolyuchka']) expect(f.lit(glade(who)).every((v) => v === 0)).toBe(true);
    const paths = (i: number) => { const z = f.fireflies.flies[i].zone; return !z || !GLADE_OF[z]; };
    const on = f.lit(paths).filter((v) => v === 1).length, all = f.lit(paths).length;
    expect(on / all).toBeCloseTo(PATH_FLIES + (1 - PATH_FLIES) * 2 * PART_MAGIC, 1);
    f.magic.set(0);
    expect(f.lit(paths).filter((v) => v === 1).length / all).toBeCloseTo(PATH_FLIES, 1);
    // the debug value wakes the glades as the leaves would: 0.48 - the first three characters'
    f.magic.set(0.48);
    expect(f.lit(glade('shustrik')).every((v) => v === 1)).toBe(true);
    expect(f.lit(glade('yasen')).every((v) => v === 0)).toBe(true);
    f.magic.set(1);
    expect(f.lit(() => true).every((v) => v === 1)).toBe(true);
  });

  it('a firefly that wakes comes over a moment, not at once', () => {
    const f = forest(0);
    f.ws.quests.borovik = FRIENDS[0].steps.length;
    f.magic.update(0.05);
    const i = f.fireflies.flies.findIndex((x) => x.zone === 'village');
    expect(f.fireflies.lit[i]).toBeGreaterThan(0);
    expect(f.fireflies.lit[i]).toBeLessThan(1);
  });

  it('butterflies from the third leaf, all of them with the fifth; the flock hidden while none has a size', () => {
    const own = (f: ReturnType<typeof forest>) => f.flies.flies.slice(-MAGIC_BUTTERFLIES).filter((b) => b.scale > 0).length;
    const two = forest(2);
    expect(own(two)).toBe(0);
    expect(two.flies.mesh.visible).toBe(false);
    expect(own(forest(3))).toBeGreaterThan(0);
    expect(forest(3).flies.mesh.visible).toBe(true);
    expect(own(forest(5))).toBe(MAGIC_BUTTERFLIES);
  });

  it('the rays through the crowns only once the Emerald is back', () => {
    expect(forest(5).rays.visible).toBe(false);
    const f = forest(5, true);
    expect(f.rays.visible).toBe(true);
    expect((f.rays.material as THREE.MeshBasicMaterial).opacity).toBeCloseTo(RAY_ALPHA, 10);
    expect(f.rays.castShadow).toBe(false);
  });

  it('follows the save while the world is played, and leaving the world gives the wind, the flowers and the flock back', () => {
    const f = forest(0);
    f.ws.quests.borovik = FRIENDS[0].steps.length;
    expect(f.magic.target).toBeCloseTo(PART_MAGIC, 10);
    for (let i = 0; i < 400; i++) f.magic.update(0.05);
    expect(f.magic.value).toBeCloseTo(PART_MAGIC, 2);
    f.magic.set(1);
    expect(f.magic.value).toBe(1);
    f.magic.set(null);
    expect(f.magic.target).toBeCloseTo(PART_MAGIC, 10);
    f.scope.dispose();
    expect(uSway.value).toBe(1);
    expect(uBloom.value).toBe(1);
    expect(f.flies.mesh.visible).toBe(true);
  });
});
