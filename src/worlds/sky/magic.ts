import * as THREE from 'three';
import { uTime } from '../../core/materials';
import { damp, mulberry32 } from '../../core/util';
import type { Game } from '../../game/context';
import { PART_MAGIC, followMagic, partsMagic, partsTop, type Magic } from '../../game/magic';
import type { WorldScope } from '../../game/scope';
import type { CharacterDef, WorldSky } from '../../game/world';
import { ISLANDS, type ZoneId } from './layout';
import { paintMaterial } from './landmarks';
import type { Scenery } from './scenery';

/**
 * The magic of the Sky Islands (WORLD-09, docs/worlds/world-5.md "Мир оживает"): every ray given back - a chain of a
 * character finished, Mertsal's and Veterok's with the ray taken in the world (their step `part`) - adds PART_MAGIC, the
 * Star of time whole over the dome brings it to 1. Read from the progress the save holds: nothing new is stored.
 *
 * With no magic the sky is pale blue and still: the sea of clouds stands, the windmills do not turn. The magic changes
 * what is already there - no model, no light more:
 * - 1-2 rays: the sea of clouds below drifts slowly round the islands, the windmills begin to turn; the island of each
 *   character whose ray is back has flowers in its grass, a few of them shining; the sky a clearer blue;
 * - 3-4: the windmills turn stronger, the crystal of the far islet glows;
 * - the Star whole: the sunset's gold in the sky, the haze, the light and the sea of clouds, the stars come out in the
 *   sky (the clock goes: ./index.ts turns its hands with the finale).
 * The flowers are drawn in the shader of the islands' ground by where a point of it stands, one uniform an island; the
 * stars are one mesh of points: the magic adds one draw call at most. The sunset stays soft: no colour of the sky, the
 * haze or the sea of clouds is ever lighter than as built (the bloom of tier 2 begins near white, src/core/renderer.ts),
 * the gold is a warmer colour of the same light or less, never a brighter one.
 */

/** How much of the change a magic `m` brings: more with the first rays (three give two thirds), as the other worlds'. */
export const alive = (m: number) => Math.pow(Math.max(0, m), 0.6);
/** The island of each character: its flowers come with its ray. The far islet is Veterok's too - his ray lies there. */
export const ISLAND_OF: Readonly<Record<string, readonly ZoneId[]>> = {
  lazur: ['castle'], gromykhalo: ['dragon'], mertsal: ['observatory'], veterok: ['pier', 'far'], chirika: ['mills'],
};
/** The islands in the order of the uniforms (./layout.ts ISLANDS). */
export const ISLES = Object.keys(ISLANDS) as ZoneId[];
type Steps = readonly [number, number, number];
type Colours = readonly [string, string, string];
/**
 * The sky, the haze and the light: with no magic (the grey build's as taken, ./index.ts SKY), with all the rays, with the
 * Star whole - the sunset's gold. Each colour no lighter than the first (the unit test measures it).
 */
export const BACKGROUND: Colours = ['#cfe6ff', '#b4d8ff', '#f4d4a6'];
export const HAZE: Colours = ['#dcecff', '#c8e0fb', '#f0d8bc'];
export const SUN_POWER: Steps = [2.3, 2.45, 2.45];
export const HEMI_POWER: Steps = [1.5, 1.6, 1.6];
/** The sun's colour and the sky's light of the hemisphere as built, and at the sunset: warmer, not brighter. */
export const SUN_COLOUR: readonly [string, string] = ['#fff6e6', '#ffdcb0'];
export const SKY_LIGHT: readonly [string, string] = ['#f0f7ff', '#fbe4cc'];
/** The sea of clouds at the sunset: its floor and its puffs a warm grey-gold, darker than as built (./scenery.ts SEA_FLOOR, SEA_PUFF). */
export const SEA_GOLD = '#e2cdb8', PUFF_GOLD = '#c4ad9a';
/** rad/s: the sea of clouds turning round the middle of the map with all the magic (its far puffs some 1.5 m/s). */
export const DRIFT = 0.007;
/** rad/s: the windmills' sails with all the magic, a little faster than the finale of the grey build turned them (0.6). */
export const SAILS = 0.9;
/** How much of the sails' speed comes with the first rays (the rest with three and four). */
export const SAILS_EARLY = 0.3;
/** The glow of the far islet's crystal (its emissive intensity with all the magic), and its colour. */
export const CRYSTAL_GLOW = 0.6, CRYSTAL_COLOUR = '#b48cff';
/** The flowers in the grass of an island whose ray is back: m a cell holding at most one, the share of cells that do, m a flower's radius. */
export const FLOWER_CELL = 0.9, FLOWERS = 0.22, FLOWER_R = 0.13;
/** How much a shining flower glows at most (times its colour), and how much greener the grass goes where the ray is back. */
export const SHINE = 0.3, GREEN = 0.5;
/** The colours of the flowers: pink, yellow, violet, saturated and under the bloom's threshold lit. */
export const PETALS: readonly [string, string, string] = ['#f27aa6', '#f2c230', '#a06cf0'];
/** The stars of the sunset: how many, how far (beyond the haze, inside the camera's far plane), px of a star on a 1000 px tall picture. */
export const STARS = 260, STAR_FAR = 480, STAR_SIZE = 3.2, STAR_OPACITY = 0.85;

const clamp01 = (v: number) => THREE.MathUtils.clamp(v, 0, 1);

/** Whether `c`'s chain is done: every step of it taken, its ray given back. */
export const chainDone = (ws: Pick<Game['ws'], 'quests'>, c: CharacterDef) => (ws.quests[c.id] ?? 0) >= c.steps.length;
/** The magic of the Sky Islands' part of the save: the rays given back, the Star whole. */
export function skyMagicOf(ws: Pick<Game['ws'], 'quests' | 'final'>, characters: readonly CharacterDef[]): number {
  return partsMagic(characters.filter((c) => chainDone(ws, c)).length, ws.final);
}

/** What a magic `m` makes of each thing it touches (the unit test reads it; the world lays it on). */
export function skyLook(m: number) {
  const a = alive(m), top = partsTop(5);
  const star = clamp01((m - top) / (1 - top));
  // the 3-4 of the document: nothing with two rays, half with three, all of it with four
  const lively = clamp01((m - 2 * PART_MAGIC) / (2 * PART_MAGIC));
  const step = (s: Steps) => s[0] + (s[1] - s[0]) * a + (s[2] - s[1]) * star;
  return {
    life: a, star, lively,
    /** 0 - the pale sky, 1 - the clear blue of the rays, 2 - the sunset's gold */
    sky: a + star,
    sun: step(SUN_POWER), hemi: step(HEMI_POWER),
    /** 0 - the light's colours as built, 1 - the sunset's; the sea of clouds the same */
    warm: star,
    drift: DRIFT * a,
    sails: SAILS * (SAILS_EARLY * a + (1 - SAILS_EARLY) * lively),
    glow: 0.7 * lively + 0.3 * star,
    night: star,
  };
}

/** The uniforms of the ground's material the magic changes: each island's middle and radius, how much its flowers are out. */
const U = {
  uSkyIsles: { value: ISLES.map((id) => new THREE.Vector3(ISLANDS[id].x, ISLANDS[id].z, ISLANDS[id].r)) },
  uSkyBack: { value: ISLES.map(() => 0) },
};

/** The islands' ground cloned with the flowers of the rays back: the clone is the magic's, the ground's own stays as it was. */
function flowered(base: THREE.MeshStandardMaterial): THREE.MeshStandardMaterial {
  const m = base.clone();
  m.name = 'sky-magic:ground';
  const [p0, p1, p2] = PETALS.map((c) => new THREE.Color(c));
  const v3 = (c: THREE.Color) => `vec3(${c.r.toFixed(4)}, ${c.g.toFixed(4)}, ${c.b.toFixed(4)})`;
  const n = ISLES.length;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uTime });
    sh.vertexShader = 'varying vec2 vSkyAt;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
        vSkyAt = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    sh.fragmentShader = `uniform float uTime;\nuniform vec3 uSkyIsles[${n}];\nuniform float uSkyBack[${n}];\nvarying vec2 vSkyAt;\nfloat skyOn;\nvec3 skyPetal;\nfloat skyTwinkle;\n`
      + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        // how much the flowers are out where this point stands: its island's ray back or not
        float skyBack = 0.0;
        for (int i = 0; i < ${n}; i++) skyBack = max(skyBack, uSkyBack[i] * (1.0 - step(uSkyIsles[i].z, distance(vSkyAt, uSkyIsles[i].xy))));
        // the grass only (its green over its blue), not the white ways or the stone of the edge
        float skyGrass = smoothstep(0.0, 0.06, diffuseColor.g - diffuseColor.b);
        diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(0.9, 1.0, 0.84), skyBack * skyGrass * ${GREEN.toFixed(2)});
        // a flower in some cells of the grass, somewhere in its cell, of one of three colours
        vec2 skyCell = floor(vSkyAt / ${FLOWER_CELL.toFixed(2)});
        vec2 skyH = fract(sin(vec2(dot(skyCell, vec2(127.1, 311.7)), dot(skyCell, vec2(269.5, 183.3)))) * 43758.5453);
        float skyPick = fract(skyH.x * 7.13 + skyH.y * 3.71);
        vec2 skyAt = (skyCell + 0.2 + 0.6 * skyH) * ${FLOWER_CELL.toFixed(2)};
        float skyDot = 1.0 - smoothstep(${(FLOWER_R * 0.6).toFixed(3)}, ${FLOWER_R.toFixed(3)}, distance(vSkyAt, skyAt));
        skyOn = step(${(1 - FLOWERS).toFixed(3)}, skyPick) * skyDot * skyGrass * skyBack;
        skyPetal = skyH.x < 0.33 ? ${v3(p0)} : skyH.x < 0.66 ? ${v3(p1)} : ${v3(p2)};
        skyTwinkle = max(0.0, sin(uTime * 2.0 + skyH.y * 40.0));
        diffuseColor.rgb = mix(diffuseColor.rgb, skyPetal, skyOn);`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // the shine: now and then a flower glints
        totalEmissiveRadiance += skyPetal * skyOn * skyTwinkle * skyTwinkle * ${SHINE.toFixed(2)};`);
  };
  m.customProgramCacheKey = () => 'sky-magic:ground';
  return m;
}

const STAR_VERTEX = `
uniform float uTime; uniform float uOpacity; uniform float uScale;
attribute float phase;
varying float vA;
void main() {
  // fixed in the sky: the direction of a star turns with the view, its place does not move with the camera
  vec3 v = mat3(viewMatrix) * position;
  gl_Position = projectionMatrix * vec4(v, 1.0);
  float tw = 0.7 + 0.3 * sin(uTime * 1.3 + phase * 5.0);
  vA = uOpacity * tw;
  gl_PointSize = ${STAR_SIZE.toFixed(2)} * (0.6 + 0.4 * fract(phase)) * uScale;
}`;
const STAR_FRAGMENT = `
varying float vA;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  gl_FragColor = vec4(1.0, 0.98, 0.9, vA * (1.0 - d * d));
}`;

/** The stars of the sunset: one mesh of points on the upper half of the sky, hidden until the Star is whole. */
export function buildStars(scene: THREE.Scene) {
  const pos = new Float32Array(STARS * 3), phase = new Float32Array(STARS);
  // deterministic: the same stars every entry
  const rnd = mulberry32(11);
  for (let i = 0; i < STARS; i++) {
    // over the haze of the horizon: from some 12 degrees up to the top
    const a = rnd() * Math.PI * 2, up = 0.2 + rnd() * 0.8, flat = Math.sqrt(1 - up * up);
    pos.set([Math.cos(a) * flat * STAR_FAR, up * STAR_FAR, Math.sin(a) * flat * STAR_FAR], i * 3);
    phase[i] = rnd() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: 0 }, uScale: { value: 1 } },
    vertexShader: STAR_VERTEX, fragmentShader: STAR_FRAGMENT,
    transparent: true, depthWrite: false, fog: false,
  });
  material.uniforms.uTime = uTime;
  material.name = 'sky-stars';
  const points = new THREE.Points(geo, material);
  points.name = 'sky-stars'; points.visible = false; points.frustumCulled = false;
  // a star is the same few pixels on a picture of any height: STAR_SIZE on one of 1000
  const size = new THREE.Vector2();
  points.onBeforeRender = (renderer) => { material.uniforms.uScale.value = renderer.getDrawingBufferSize(size).y / 1000; };
  scene.add(points);
  return { points, material };
}

/**
 * The magic of the Sky Islands: built after the scenery and the characters (it gives the ground and the crystal
 * materials of their own, drifts the sea of clouds and turns the windmills), its `update` in the frame.
 */
export function createSkyMagic(g: Pick<Game, 'scene' | 'ws'>, scope: WorldScope,
  o: { sky: WorldSky; scenery: Pick<Scenery, 'turn'>; characters: readonly CharacterDef[] }): Magic {
  const { scene, ws } = g;
  const was: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
  const own: THREE.Material[] = [];
  const swap = (mesh: THREE.Mesh, next: THREE.MeshStandardMaterial) => { was.push({ mesh, material: mesh.material }); mesh.material = next; own.push(next); return next; };
  let hemi: THREE.HemisphereLight | null = null, crystal: THREE.MeshStandardMaterial | null = null;
  let seaFloor: THREE.MeshBasicMaterial | null = null, seaPuffs: THREE.MeshStandardMaterial | null = null, puffs: THREE.Object3D | null = null;
  scene.traverse((x) => {
    if (x instanceof THREE.HemisphereLight) hemi = x;
    if (!(x instanceof THREE.Mesh)) return;
    if (x.name === 'sky-ground' && x.material instanceof THREE.MeshStandardMaterial) swap(x, flowered(x.material));
    else if (x.name === 'landmark-far' && x.material === paintMaterial()) {
      crystal = swap(x, paintMaterial().clone());
      crystal.name = 'sky-magic:crystal'; crystal.emissive.set(CRYSTAL_COLOUR); crystal.emissiveIntensity = 0;
    } else if (x.name === 'cloud-sea' && x.material instanceof THREE.MeshBasicMaterial) seaFloor = x.material;
    else if (x.name === 'cloud-puffs' && x.material instanceof THREE.MeshStandardMaterial) { seaPuffs = x.material; puffs = x; }
  });
  const h = hemi as THREE.HemisphereLight | null, floor = seaFloor as THREE.MeshBasicMaterial | null;
  const puffMat = seaPuffs as THREE.MeshStandardMaterial | null, cloud = puffs as THREE.Object3D | null;
  const glowing = crystal as THREE.MeshStandardMaterial | null;
  const bg = scene.background as THREE.Color, fog = scene.fog as THREE.Fog, sun = o.sky.sun;
  const before = {
    bg: bg.clone(), fog: fog.color.clone(), sun: sun.intensity, sunColour: sun.color.clone(),
    hemi: h?.intensity, hemiColour: h?.color.clone(), floor: floor?.color.clone(), puff: puffMat?.color.clone(), drift: cloud?.rotation.y ?? 0,
  };
  const [bg0, bg1, bg2] = BACKGROUND.map((c) => new THREE.Color(c)), [haze0, haze1, haze2] = HAZE.map((c) => new THREE.Color(c));
  const [sun0, sun1] = SUN_COLOUR.map((c) => new THREE.Color(c)), [light0, light1] = SKY_LIGHT.map((c) => new THREE.Color(c));
  const floor0 = before.floor ?? new THREE.Color(), floor1 = new THREE.Color(SEA_GOLD);
  const puff0 = before.puff ?? new THREE.Color(), puff1 = new THREE.Color(PUFF_GOLD);
  const stars = buildStars(scene);

  scope.own(() => {
    for (const { mesh, material } of was) mesh.material = material;
    for (const m of own) m.dispose();
    stars.points.removeFromParent(); stars.points.geometry.dispose(); stars.material.dispose();
    bg.copy(before.bg); fog.color.copy(before.fog);
    sun.intensity = before.sun; sun.color.copy(before.sunColour);
    if (h && before.hemi !== undefined && before.hemiColour) { h.intensity = before.hemi; h.color.copy(before.hemiColour); }
    if (floor && before.floor) floor.color.copy(before.floor);
    if (puffMat && before.puff) puffMat.color.copy(before.puff);
    if (cloud) cloud.rotation.y = before.drift;
    U.uSkyBack.value.fill(0);
  });

  // whose ray is back; with a debug value of the magic (its pictures) as its rays would bring it: the k-th
  // character's from the magic of k + 1 rays, all of them with the Star
  let forced: number | null = null;
  const back = (c: CharacterDef, k: number) => (forced !== null ? forced >= (k + 1) * PART_MAGIC - 1e-6 : chainDone(ws, c) || ws.final);
  const isleWants = () => ISLES.map((id) => (o.characters.some((c, k) => ISLAND_OF[c.id]?.includes(id) && back(c, k)) ? 1 : 0));
  // an island's flowers come out over a second or so (dt 0: at once - the first frame, the debug value)
  const isles = ISLES.map(() => -1);
  const magic = followMagic(() => skyMagicOf(ws, o.characters), (m, dt) => {
    const l = skyLook(m);
    const k = dt > 0 ? damp(1.5, dt) : 1;
    isleWants().forEach((want, i) => { isles[i] = isles[i] < 0 ? want : isles[i] + (want - isles[i]) * k; U.uSkyBack.value[i] = isles[i]; });
    bg.copy(bg0).lerp(bg1, Math.min(1, l.sky)).lerp(bg2, Math.max(0, l.sky - 1));
    fog.color.copy(haze0).lerp(haze1, Math.min(1, l.sky)).lerp(haze2, Math.max(0, l.sky - 1));
    sun.intensity = l.sun; sun.color.copy(sun0).lerp(sun1, l.warm);
    if (h) { h.intensity = l.hemi; h.color.copy(light0).lerp(light1, l.warm); }
    if (floor) floor.color.copy(floor0).lerp(floor1, l.warm);
    if (puffMat) puffMat.color.copy(puff0).lerp(puff1, l.warm);
    if (cloud) cloud.rotation.y += dt * l.drift;
    o.scenery.turn(dt, l.sails);
    if (glowing) glowing.emissiveIntensity = CRYSTAL_GLOW * l.glow;
    stars.material.uniforms.uOpacity.value = STAR_OPACITY * l.night;
    stars.points.visible = l.night > 0;
  });
  return {
    get value() { return magic.value; },
    get target() { return magic.target; },
    update: (dt) => magic.update(dt),
    set: (v) => { forced = v === null ? null : clamp01(v); magic.set(v); },
  };
}

/** The uniforms as the magic last laid them (the unit test reads them). */
export const skyUniforms = U;
