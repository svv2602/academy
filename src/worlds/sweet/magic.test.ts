// @vitest-environment happy-dom
/**
 * The magic of the Sweet Land (./magic.ts, WORLD-09): read from the rubies the save holds (Imbir's and Kakao's taken in
 * the world end their chains), pale and still with none; each ruby brings back its zone's colour, three and four the
 * swaying lollipops, the glow and the butterflies, the Ruby the whole colour, the sugar in the air and the dance.
 */
import * as THREE from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, loadSave, storeSave, worldState } from '../../core/save';
import { Butterflies } from '../../game/butterflies';
import type { Game } from '../../game/context';
import { PART_MAGIC, partsTop } from '../../game/magic';
import { createWorldScope } from '../../game/scope';
import { FRIENDS, RUBIES, SKY } from './index';
import { ZONES } from './layout';
import { paintMaterial } from './landmarks';
import {
  BACKGROUND, BUTTERFLIES, BUTTERFLIES_RUBY, CAROUSEL_TURN, HEMI_POWER, PALE, SUN_POWER, ZONE_OF, ZONE_R, createSweetMagic, sweetLook, sweetMagicOf, sweetUniforms,
} from './magic';
import { buildScenery } from './scenery';
import { buildGround, colliders } from './terrain';

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

/** A save of the Sweet Land with the chains of `done` finished; a ruby taken in the world ends its chain, as ./index.ts `take` does. */
function saveWith(done: readonly string[], final = false) {
  const s = defaultSave(), ws = worldState(s, 'sweet');
  for (const id of done) {
    const c = FRIENDS.find((f) => f.id === id)!;
    ws.quests[id] = c.steps.length;
    const r = RUBIES.find((x) => x.owner === id);
    if (r) { ws.flags[r.hint] = true; ws.flags[r.flag] = true; }
  }
  ws.final = final;
  return s;
}

/** The magic the walkthrough expects (tools/world-pass.mjs `magicKept`): PART_MAGIC a chain done, 1 with the finale. */
const passWants = (done: number, final: boolean) => (final ? 1 : Math.min(1, done * PART_MAGIC));

/** The land as ./index.ts builds it: its sky, its ground and scenery, the characters' models that dance. */
function land(done: readonly string[] = [], final = false) {
  const save = saveWith(done, final), ws = worldState(save, 'sweet');
  colliders.length = 0;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY.background);
  scene.fog = new THREE.Fog(SKY.haze, 50, 150);
  const sun = new THREE.DirectionalLight(SKY.sun, SKY.sunPower), hemi = new THREE.HemisphereLight(SKY.skyLight, SKY.groundLight, SKY.hemiPower);
  scene.add(sun, hemi, buildGround(16));
  const scenery = buildScenery(scene);
  const dancers = FRIENDS.map(() => { const m = new THREE.Group(); scene.add(m); return m; });
  const flies = new Butterflies(scene, 96, () => 0);
  const g = { scene, ws, save, flies, groundY: () => 0 } as unknown as Game;
  const before = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
  scene.traverse((x) => { if (x instanceof THREE.Mesh) before.set(x, x.material); });
  const scope = createWorldScope(scene);
  const magic = createSweetMagic(g, scope, { sky: { sun, sunOffset: new THREE.Vector3() }, scenery, characters: FRIENDS, dancers });
  const named = (name: string) => scene.getObjectByName(name) as THREE.Mesh;
  return { scene, ws, sun, hemi, flies, scope, magic, dancers, before, named };
}

describe('the magic of the Sweet Land (WORLD-09): read from the rubies the save already holds', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', memoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); colliders.length = 0; });

  it('is the walkthrough\'s rule: PART_MAGIC a ruby given back, a ruby that lies in the world counted once it is taken, 1 with the Ruby', () => {
    const of = (s: ReturnType<typeof saveWith>) => sweetMagicOf(worldState(s, 'sweet'), FRIENDS);
    expect(of(saveWith([]))).toBe(0);
    expect(of(saveWith(['pastila']))).toBeCloseTo(passWants(1, false), 10);
    // Imbir's house assembled, his ruby seen in the doorway but not taken: his chain is not done, no ruby of his yet
    const waiting = saveWith(['pastila']), w = worldState(waiting, 'sweet');
    w.quests.imbir = FRIENDS[1].steps.indexOf('part'); w.flags.imbir_hint = true;
    expect(of(waiting)).toBeCloseTo(passWants(1, false), 10);
    // taken (./index.ts `take`: the flag and the step `part`): two rubies
    expect(of(saveWith(['pastila', 'imbir']))).toBeCloseTo(passWants(2, false), 10);
    expect(of(saveWith(['imbir', 'kakao']))).toBeCloseTo(passWants(2, false), 10);
    expect(of(saveWith(FRIENDS.map((c) => c.id)))).toBeCloseTo(passWants(5, false), 10);
    expect(of(saveWith(FRIENDS.map((c) => c.id), true))).toBe(1);
    // a chain half done gives nothing
    const half = saveWith([]); worldState(half, 'sweet').quests.kakao = 2;
    expect(of(half)).toBe(0);
  });

  it('after a reload of the page it is the same: nothing new is stored', () => {
    const s = saveWith(['pastila', 'kakao']);
    storeSave(s);
    const again = loadSave();
    expect(sweetMagicOf(worldState(again, 'sweet'), FRIENDS)).toBeCloseTo(sweetMagicOf(worldState(s, 'sweet'), FRIENDS), 10);
    expect(land(['pastila', 'kakao']).magic.target).toBeCloseTo(2 * PART_MAGIC, 10);
  });

  it('with no magic the land is pastel and still - not dark: no colour back, nothing turns, flows, sways, glows or flutters', () => {
    const l = sweetLook(0, FRIENDS.map(() => false));
    expect(l).toMatchObject({ life: 0, ruby: 0, lively: 0, carousel: 0, flow: 0, sway: 0, glow: 0, butterflies: 0, sparkle: 0, dance: 0, sky: 0 });
    expect(l.pale).toBeCloseTo(PALE); expect(l.zones.every((z) => z === PALE)).toBe(true);
    // light even so: the sun a little under the one taken, the sky's colour a pale pink, not grey or dark
    expect(l.sun / SUN_POWER[1]).toBeGreaterThan(0.85); expect(l.hemi / HEMI_POWER[1]).toBeGreaterThan(0.9);
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(BACKGROUND[0]).getHSL(hsl);
    expect(hsl.l).toBeGreaterThan(0.85);
    // and the Ruby back is all of it, unlike none
    const all = sweetLook(1, FRIENDS.map(() => true));
    expect(all).toMatchObject({ ruby: 1, lively: 1, pale: 0, sway: 1, glow: 1, sparkle: 1, dance: 1, sky: 2 });
    expect(all.zones.every((z) => z === 0)).toBe(true);
    expect(all.carousel).toBeCloseTo(CAROUSEL_TURN); expect(all.butterflies).toBe(BUTTERFLIES + BUTTERFLIES_RUBY);
  });

  it('each ruby brings more, never less; the zone of a ruby back has its colour, three and four bring the lollipops and the butterflies, only the Ruby the sugar and the dance', () => {
    let was = sweetLook(0, FRIENDS.map(() => false));
    for (let k = 1; k <= 6; k++) {
      const l = sweetLook(k === 6 ? 1 : k * PART_MAGIC, FRIENDS.map((_, i) => i < Math.min(k, 5)));
      for (const key of ['life', 'ruby', 'lively', 'sky', 'sun', 'hemi', 'carousel', 'flow', 'sway', 'glow', 'butterflies', 'sparkle', 'dance'] as const) expect(l[key], `${k} ${key}`).toBeGreaterThanOrEqual(was[key]);
      expect(l.pale, `${k} pale`).toBeLessThanOrEqual(was.pale);
      l.zones.forEach((z, i) => expect(z, `${k} zone ${i}`).toBeLessThanOrEqual(was.zones[i]));
      was = l;
    }
    const one = sweetLook(PART_MAGIC, [true, false, false, false, false]);
    expect(one.zones).toEqual([0, PALE, PALE, PALE, PALE]);
    expect(one.carousel).toBeGreaterThan(0); expect(one.flow).toBeGreaterThan(0);
    expect(sweetLook(2 * PART_MAGIC, FRIENDS.map((_, i) => i < 2))).toMatchObject({ lively: 0, butterflies: 0, sway: 0 });
    expect(sweetLook(3 * PART_MAGIC, FRIENDS.map((_, i) => i < 3)).lively).toBeCloseTo(0.5);
    expect(sweetLook(4 * PART_MAGIC, FRIENDS.map((_, i) => i < 4)).butterflies).toBeCloseTo(BUTTERFLIES);
    expect(sweetLook(partsTop(5), FRIENDS.map(() => true))).toMatchObject({ ruby: 0, sparkle: 0, dance: 0 });
  });

  it('every character stands in its zone, the one whose colour its ruby brings back', () => {
    expect(Object.keys(ZONE_OF).sort()).toEqual(FRIENDS.map((c) => c.id).sort());
    for (const c of FRIENDS) {
      const z = ZONES[ZONE_OF[c.id]];
      expect(Math.hypot(c.x - z.x, c.z - z.z), c.id).toBeLessThan(ZONE_R[0]);
    }
  });

  it('in the world: the land\'s meshes take the magic\'s materials, the zone of a ruby back is not pale, the carousel turns and the butterflies come with the magic', () => {
    const f = land(['pastila']);
    for (const name of ['sweet-ground', 'chocolate-river', 'candies', 'lollipops', 'garden-lollipops', 'market-stalls', 'landmark-palace', 'carousel-seats']) {
      expect((f.named(name).material as THREE.Material).name, name).toMatch(/^sweet-magic:/);
    }
    // the river flows: its ribbon knows the way along it
    expect(f.named('chocolate-river').geometry.getAttribute('flow').itemSize).toBe(2);
    expect(sweetUniforms.uSweetPale.value[0]).toBe(0);
    expect(sweetUniforms.uSweetPale.value[1]).toBeCloseTo(PALE);
    expect(sweetUniforms.uSweetZones.value[0].x).toBeCloseTo(ZONES.square.x);
    // the debug value lays a magic at once: none - still and pale; all - the carousel turns, the flock is there, the sugar sparkles
    f.magic.set(0);
    const seats = f.named('carousel-seats'), turned = seats.rotation.y;
    f.magic.update(1);
    expect(seats.rotation.y).toBe(turned);
    expect(f.flies.mesh.visible).toBe(false);
    expect(sweetUniforms.uSweetPale.value.every((p) => p >= PALE * 0.99)).toBe(true);
    f.magic.set(1);
    f.magic.update(1);
    expect(seats.rotation.y).toBeGreaterThan(turned);
    expect(f.flies.mesh.visible).toBe(true);
    expect((f.scene.getObjectByName('sugar-sparkle') as THREE.Points).visible).toBe(true);
    expect(sweetUniforms.uSweetPale.value.every((p) => p === 0)).toBe(true);
    expect(f.sun.intensity).toBeCloseTo(SUN_POWER[2]);
    expect((f.scene.background as THREE.Color).getHexString()).toBe(new THREE.Color(BACKGROUND[2]).getHexString());
    f.magic.set(null);
    expect(f.magic.target).toBeCloseTo(PART_MAGIC, 10);
  });

  it('the shaders of the magic\'s materials are patched where three.js has the places: the colour by zone, the glaze, the sway, the glow, the current', () => {
    const f = land();
    const patched = (name: string) => {
      const m = f.named(name).material as THREE.MeshStandardMaterial;
      const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
      m.onBeforeCompile(sh, undefined as unknown as THREE.WebGLRenderer);
      return { m, sh: sh as unknown as { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string } };
    };
    for (const name of ['sweet-ground', 'chocolate-river', 'candies', 'lollipops', 'market-stalls', 'landmark-palace']) {
      const { sh } = patched(name);
      expect(sh.vertexShader, name).toContain('vSweetAt = (modelMatrix * sweetW).xz;');
      expect(sh.fragmentShader, name).toContain('float sweetPale = uSweetPale[5];');
      expect(sh.fragmentShader, name).toContain('roughnessFactor = mix(roughnessFactor');
      expect(sh.uniforms, name).toHaveProperty('uSweetPale');
    }
    const lolly = patched('lollipops');
    expect(lolly.m.defines).toHaveProperty('SWEET_SWAY'); expect(lolly.m.defines).toHaveProperty('SWEET_GLOW');
    expect(lolly.sh.vertexShader).toContain('transformed.x += sin(uTime');
    expect(lolly.sh.fragmentShader).toContain('totalEmissiveRadiance += vColor.rgb * uSweetGlow');
    const river = patched('chocolate-river');
    expect(river.m.defines).toHaveProperty('SWEET_FLOW');
    expect(river.sh.vertexShader).toContain('vSweetFlow = flow;');
    expect(river.sh.fragmentShader).toContain('uSweetStreak * sweetStreak');
  });

  it('follows the save while the world is played, and leaving the world gives every material, the sky and the flock back', () => {
    const f = land();
    f.ws.quests.polosatik = FRIENDS[4].steps.length;
    expect(f.magic.target).toBeCloseTo(PART_MAGIC, 10);
    for (let i = 0; i < 400; i++) f.magic.update(0.05);
    expect(f.magic.value).toBeCloseTo(PART_MAGIC, 2);
    expect(sweetUniforms.uSweetPale.value[4]).toBeLessThan(0.01);
    f.magic.set(1); f.magic.update(0.1);
    const meshes = [...f.before.keys()];
    f.scope.dispose();
    for (const m of meshes) expect((m as THREE.Mesh).material, m.name).toBe(f.before.get(m));
    expect(meshes.filter((m) => m.name === 'lollipops').every((m) => (m as THREE.Mesh).material === paintMaterial())).toBe(true);
    expect(f.sun.intensity).toBe(SKY.sunPower); expect(f.hemi.intensity).toBe(SKY.hemiPower);
    expect((f.scene.background as THREE.Color).getHexString()).toBe(new THREE.Color(SKY.background).getHexString());
    expect(f.flies.mesh.visible).toBe(true);
    expect(f.dancers.every((d) => d.position.y === 0 && d.rotation.y === 0)).toBe(true);
    expect(sweetUniforms.uSweetSway.value).toBe(0); expect(sweetUniforms.uSweetGlow.value).toBe(0);
  });
});
