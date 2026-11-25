// @vitest-environment happy-dom
/**
 * The magic of the Sky Islands (./magic.ts, WORLD-09): read from the rays the save holds (Mertsal's and Veterok's
 * taken in the world end their chains), pale and still with none; the rays bring the drifting clouds, the turning
 * windmills, the flowers of each island whose ray is back and the crystal's glow, the Star the sunset and the stars -
 * and never a sky, a haze or a sea of clouds lighter than as built (the bloom).
 */
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defaultSave, worldState } from '../../core/save';
import type { Game } from '../../game/context';
import { PART_MAGIC, partsTop } from '../../game/magic';
import { createWorldScope } from '../../game/scope';
import { FRIENDS, RAYS, SKY } from './index';
import { HALF } from './layout';
import { paintMaterial } from './landmarks';
import {
  BACKGROUND, CRYSTAL_GLOW, HAZE, ISLAND_OF, ISLES, PUFF_GOLD, SAILS, SEA_GOLD, SUN_POWER, HEMI_POWER, createSkyMagic, skyLook, skyMagicOf, skyUniforms,
} from './magic';
import { buildScenery } from './scenery';
import { buildGround, colliders } from './terrain';

vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

/** A save of the Sky Islands with the chains of `done` finished; a ray taken in the world ends its chain, as ./index.ts `take` does. */
function saveWith(done: readonly string[], final = false) {
  const s = defaultSave(), ws = worldState(s, 'sky');
  for (const id of done) {
    const c = FRIENDS.find((f) => f.id === id)!;
    ws.quests[id] = c.steps.length;
    const r = RAYS.find((x) => x.owner === id);
    if (r) { ws.flags[r.hint] = true; ws.flags[r.flag] = true; }
  }
  ws.final = final;
  return s;
}

/** The light a colour gives (linear): what the bloom reads. */
const luminance = (hex: string | THREE.Color) => { const c = typeof hex === 'string' ? new THREE.Color(hex) : hex; return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };

/** The islands as ./index.ts builds them: their sky, their ground and scenery, the turning sails counted. */
function islands(done: readonly string[] = [], final = false) {
  const save = saveWith(done, final), ws = worldState(save, 'sky');
  colliders.length = 0;
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(SKY.background);
  scene.fog = new THREE.Fog(SKY.haze, HALF * 0.8, HALF * 2.2);
  const sun = new THREE.DirectionalLight(SKY.sun, SKY.sunPower), hemi = new THREE.HemisphereLight(SKY.skyLight, SKY.groundLight, SKY.hemiPower);
  scene.add(sun, hemi, buildGround(4, 12));
  const built = buildScenery(scene);
  const turns: number[] = [];
  const scenery = { turn: (dt: number, speed: number) => { turns.push(speed); built.turn(dt, speed); } };
  const before = new Map<THREE.Object3D, THREE.Material | THREE.Material[]>();
  scene.traverse((x) => { if (x instanceof THREE.Mesh) before.set(x, x.material); });
  const scope = createWorldScope(scene);
  const g = { scene, ws, save } as unknown as Game;
  const magic = createSkyMagic(g, scope, { sky: { sun, sunOffset: new THREE.Vector3() }, scenery, characters: FRIENDS });
  const named = (name: string) => scene.getObjectByName(name) as THREE.Mesh;
  return { scene, ws, sun, hemi, scope, magic, before, named, turns };
}

describe('the magic of the Sky Islands (WORLD-09): read from the rays the save already holds', () => {
  afterEach(() => { colliders.length = 0; });

  it('is the walkthrough\'s rule: PART_MAGIC a ray given back, a ray that lies in the world counted once it is taken, 1 with the Star', () => {
    const of = (s: ReturnType<typeof saveWith>) => skyMagicOf(worldState(s, 'sky'), FRIENDS);
    expect(of(saveWith([]))).toBe(0);
    expect(of(saveWith(['lazur']))).toBeCloseTo(PART_MAGIC, 10);
    // Mertsal's ray seen in the clock but not taken: his chain is not done
    const waiting = saveWith(['lazur']), w = worldState(waiting, 'sky');
    w.quests.mertsal = FRIENDS[2].steps.indexOf('part'); w.flags.mertsal_hint = true;
    expect(of(waiting)).toBeCloseTo(PART_MAGIC, 10);
    expect(of(saveWith(['lazur', 'mertsal']))).toBeCloseTo(2 * PART_MAGIC, 10);
    expect(of(saveWith(FRIENDS.map((c) => c.id)))).toBeCloseTo(partsTop(5), 10);
    expect(of(saveWith(FRIENDS.map((c) => c.id), true))).toBe(1);
  });

  it('with no magic the sky is pale blue and still; the Star whole is all of it', () => {
    const none = skyLook(0);
    expect(none).toMatchObject({ life: 0, star: 0, lively: 0, sky: 0, drift: 0, sails: 0, glow: 0, night: 0, warm: 0 });
    expect(BACKGROUND[0]).toBe(SKY.background); expect(HAZE[0]).toBe(SKY.haze);
    const hsl = { h: 0, s: 0, l: 0 };
    new THREE.Color(BACKGROUND[0]).getHSL(hsl);
    expect(hsl.l).toBeGreaterThan(0.8); expect(hsl.h).toBeGreaterThan(0.5); expect(hsl.h).toBeLessThan(0.65);   // light, blue
    expect(none.sun / SUN_POWER[1]).toBeGreaterThan(0.9); expect(none.hemi / HEMI_POWER[1]).toBeGreaterThan(0.9);
    const all = skyLook(1);
    expect(all).toMatchObject({ life: 1, star: 1, lively: 1, sky: 2, glow: 1, night: 1, warm: 1 });
    expect(all.sails).toBeCloseTo(SAILS);
    // the sunset is gold: warmer than blue
    new THREE.Color(BACKGROUND[2]).getHSL(hsl);
    expect(hsl.h).toBeLessThan(0.15);
  });

  it('each ray brings more, never less: 1-2 the drift and the first turning, 3-4 the stronger sails and the glow, only the Star the sunset and the stars', () => {
    let was = skyLook(0);
    for (let k = 1; k <= 6; k++) {
      const l = skyLook(k === 6 ? 1 : k * PART_MAGIC);
      for (const key of ['life', 'star', 'lively', 'sky', 'sun', 'hemi', 'warm', 'drift', 'sails', 'glow', 'night'] as const) expect(l[key], `${k} ${key}`).toBeGreaterThanOrEqual(was[key]);
      was = l;
    }
    const two = skyLook(2 * PART_MAGIC);
    expect(two.drift).toBeGreaterThan(0); expect(two.sails).toBeGreaterThan(0);
    expect(two).toMatchObject({ lively: 0, glow: 0, night: 0, warm: 0 });
    expect(skyLook(3 * PART_MAGIC).lively).toBeCloseTo(0.5);
    expect(skyLook(4 * PART_MAGIC).sails).toBeGreaterThan(3 * two.sails);
    expect(skyLook(partsTop(5))).toMatchObject({ star: 0, night: 0, warm: 0 });
  });

  it('the sunset stays soft: no colour of the sky, the haze or the sea of clouds is lighter than as built', () => {
    for (const c of BACKGROUND) expect(luminance(c), c).toBeLessThanOrEqual(luminance(SKY.background) + 1e-9);
    for (const c of HAZE) expect(luminance(c), c).toBeLessThanOrEqual(luminance(SKY.haze) + 1e-9);
    const f = islands();
    const floor = (f.named('cloud-sea').material as THREE.MeshBasicMaterial).color.clone();
    const puff = ((f.named('cloud-puffs') as THREE.Mesh).material as THREE.MeshStandardMaterial).color.clone();
    expect(luminance(SEA_GOLD)).toBeLessThanOrEqual(luminance(floor)); expect(luminance(PUFF_GOLD)).toBeLessThanOrEqual(luminance(puff));
  });

  it('every character has an island of its own, the far islet Veterok\'s', () => {
    expect(Object.keys(ISLAND_OF).sort()).toEqual(FRIENDS.map((c) => c.id).sort());
    expect([...Object.values(ISLAND_OF).flat()].sort()).toEqual([...ISLES].sort());
  });

  it('in the world: the ground takes the flowers of the islands whose ray is back, the clouds drift, the sails turn, the crystal glows, the stars come with the Star', () => {
    const f = islands(['lazur']);
    expect((f.named('sky-ground').material as THREE.Material).name).toBe('sky-magic:ground');
    const crystal = f.named('landmark-far').material as THREE.MeshStandardMaterial;
    expect(crystal.name).toBe('sky-magic:crystal');
    expect(skyUniforms.uSkyBack.value[ISLES.indexOf('castle')]).toBe(1);
    expect(skyUniforms.uSkyBack.value[ISLES.indexOf('dragon')]).toBe(0);
    // the debug value lays a magic at once: none - still
    f.magic.set(0);
    const puffs = f.named('cloud-puffs'), drift = puffs.rotation.y;
    f.magic.update(1);
    expect(puffs.rotation.y).toBe(drift); expect(f.turns.at(-1)).toBe(0);
    expect(crystal.emissiveIntensity).toBe(0);
    expect(skyUniforms.uSkyBack.value.every((v) => v === 0)).toBe(true);
    expect((f.scene.getObjectByName('sky-stars') as THREE.Points).visible).toBe(false);
    // all of it
    f.magic.set(1);
    f.magic.update(1);
    expect(puffs.rotation.y).toBeGreaterThan(drift); expect(f.turns.at(-1)).toBeCloseTo(SAILS);
    expect(crystal.emissiveIntensity).toBeCloseTo(CRYSTAL_GLOW);
    expect(skyUniforms.uSkyBack.value.every((v) => v === 1)).toBe(true);
    expect((f.scene.getObjectByName('sky-stars') as THREE.Points).visible).toBe(true);
    expect((f.scene.background as THREE.Color).getHexString()).toBe(new THREE.Color(BACKGROUND[2]).getHexString());
    expect((f.scene.fog as THREE.Fog).color.getHexString()).toBe(new THREE.Color(HAZE[2]).getHexString());
    expect(f.sun.intensity).toBeCloseTo(SUN_POWER[2]);
    expect((f.named('cloud-sea').material as THREE.MeshBasicMaterial).color.getHexString()).toBe(new THREE.Color(SEA_GOLD).getHexString());
    f.magic.set(null);
    expect(f.magic.target).toBeCloseTo(PART_MAGIC, 10);
  });

  it('the ground\'s shader is patched where three.js has the places: where it stands, the flowers, their shine', () => {
    const f = islands();
    const m = f.named('sky-ground').material as THREE.MeshStandardMaterial;
    const sh = { uniforms: {}, vertexShader: THREE.ShaderLib.physical.vertexShader, fragmentShader: THREE.ShaderLib.physical.fragmentShader } as unknown as THREE.WebGLProgramParametersWithUniforms;
    m.onBeforeCompile(sh, undefined as unknown as THREE.WebGLRenderer);
    const s = sh as unknown as { uniforms: Record<string, unknown>; vertexShader: string; fragmentShader: string };
    expect(s.vertexShader).toContain('vSkyAt = (modelMatrix * vec4(transformed, 1.0)).xz;');
    expect(s.fragmentShader).toContain('diffuseColor.rgb = mix(diffuseColor.rgb, skyPetal, skyOn);');
    expect(s.fragmentShader).toContain('totalEmissiveRadiance += skyPetal * skyOn');
    expect(s.uniforms).toHaveProperty('uSkyBack'); expect(s.uniforms).toHaveProperty('uSkyIsles');
  });

  it('follows the save while the world is played, easing toward it; leaving the world gives every material, the sky and the clouds back', () => {
    const f = islands();
    expect(f.magic.value).toBe(0);
    f.ws.quests.chirika = FRIENDS[4].steps.length;
    expect(f.magic.target).toBeCloseTo(PART_MAGIC, 10);
    f.magic.update(0.1);
    expect(f.magic.value).toBeGreaterThan(0); expect(f.magic.value).toBeLessThan(PART_MAGIC);
    for (let i = 0; i < 400; i++) f.magic.update(0.05);
    expect(f.magic.value).toBeCloseTo(PART_MAGIC, 2);
    expect(skyUniforms.uSkyBack.value[ISLES.indexOf('mills')]).toBeGreaterThan(0.99);
    f.magic.set(1); f.magic.update(0.1);
    const meshes = [...f.before.keys()];
    f.scope.dispose();
    for (const m of meshes) expect((m as THREE.Mesh).material, m.name).toBe(f.before.get(m));
    expect((f.named('landmark-far').material)).toBe(paintMaterial());
    expect(f.sun.intensity).toBe(SKY.sunPower); expect(f.hemi.intensity).toBe(SKY.hemiPower);
    expect(f.sun.color.getHexString()).toBe(new THREE.Color(SKY.sun).getHexString());
    expect((f.scene.background as THREE.Color).getHexString()).toBe(new THREE.Color(SKY.background).getHexString());
    expect(f.named('cloud-puffs').rotation.y).toBe(0);
    expect(f.scene.getObjectByName('sky-stars')).toBeUndefined();
    expect(skyUniforms.uSkyBack.value.every((v) => v === 0)).toBe(true);
  });
});
