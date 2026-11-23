import * as THREE from 'three';
import { uTime } from '../../core/materials';
import { damp } from '../../core/util';
import type { Game } from '../../game/context';
import { PART_MAGIC, followMagic, partsMagic, partsTop, type Magic } from '../../game/magic';
import type { WorldScope } from '../../game/scope';
import type { CharacterDef, WorldSky } from '../../game/world';
import { HALF, SCALE, ZONES, type ZoneId } from './layout';
import { paintMaterial } from './landmarks';
import type { Scenery } from './scenery';

/**
 * The magic of the Sweet Land (WORLD-09, docs/worlds/world-4.md "Мир оживает"): every ruby given back - a chain of a
 * character finished, Imbir's and Kakao's with the ruby taken in the world (their step `part`) - adds PART_MAGIC, the
 * Ruby of joy restored on the candle brings it to 1. Read from the progress the save holds: nothing new is stored.
 *
 * With no magic the land is pastel and washed out, still light and sweet - only quiet: the chocolate river stands, the
 * carousel does not turn. The magic adds with what is already there - no model, no light more:
 * - 1-2 rubies: the zone of each character whose ruby is back has its full colour again, its glaze (the white icing,
 *   the cream) shines; the rest of the land a little less pale; the sky and the haze rosier, the light a little more;
 *   the river flows and the carousel turns, faster with each ruby;
 * - 3-4: the lollipop trees sway, the lollipops, the candies and the market's awnings glow, caramel butterflies flutter
 *   over the zones;
 * - the Ruby back: the whole land its full colour, sugar sparkling in the air, the characters dance a little.
 * The colour is taken off in the shaders of the land's own materials by where a thing stands (`ZONE_OF`), so one
 * uniform a zone does it for every mesh; the butterflies are the game's flock, the sparkle one mesh of points: the magic
 * adds two draw calls at most.
 */

/** How much of the change a magic `m` brings: more with the first rubies (three give two thirds), as the sea's. */
export const alive = (m: number) => Math.pow(Math.max(0, m), 0.6);
/** The zone of each character (./index.ts FRIENDS stand in them): its colour comes back with its ruby. */
export const ZONE_OF: Readonly<Record<string, ZoneId>> = { pastila: 'square', imbir: 'town', tyanuchka: 'market', kakao: 'mill', polosatik: 'garden' };
/** m: a zone has all of its own colour within the first radius from its middle, none of it past the second. */
export const ZONE_R: readonly [number, number] = [11 * SCALE, 15 * SCALE];
/** How much of their colour the land's things lose with no magic (0: none), and how much nearer white they go: pastel, light. */
export const PALE = 0.7, PALE_LIGHT = 0.32;
/** How much of its paleness the land out of the zones loses with all the rubies (the rest goes with the Ruby). */
export const NEUTRAL = 0.7;
/** The roughness of the glaze where it shines (it is 0.85 as made). */
export const GLAZE_ROUGH = 0.3;
/** How much richer than as made the land's colours go with the Ruby back (a paleness under 0). */
export const RICH = 0.18;
/** The cream hills around the land (./scenery.ts): cool and grey with no magic, as made with the rubies, rosy with the Ruby. */
/**
 * The ground of each zone takes a colour of its own as its ruby comes back - the big patches seen from above (the
 * customer, 2026-11-23: "сделать разницу на общем виде заметнее"): how much of it, and the rest of the land's with the Ruby.
 */
export const ZONE_TINT: Readonly<Record<ZoneId, string>> = { square: '#ffc4dc', town: '#f0c08e', market: '#ffc59e', mill: '#e2bf9f', garden: '#bfeccf', bridge: '#ffd9e8', palace: '#ffd9e8' } as Readonly<Record<ZoneId, string>>;
export const TINT = 0.8, REST_TINT = '#ffd3e6', REST = 0.45;
export const CREAM: readonly [string, string, string] = ['#dcdbe2', '#fff4ea', '#ffd9e4'];
/** The sky, the haze and the light: with no magic, with all the rubies (the grey build's as taken, ./index.ts SKY), with the Ruby back. */
type Steps = readonly [number, number, number];
export const BACKGROUND: readonly [string, string, string] = ['#f3edf2', '#ffd6ea', '#ffc0de'];
export const HAZE: readonly [string, string, string] = ['#e6e5ea', '#e6dcff', '#f4d2f2'];
export const SUN_POWER: Steps = [2.1, 2.4, 2.55];
export const HEMI_POWER: Steps = [1.4, 1.5, 1.6];
/** rad/s: the carousel with all the magic; m/s: the river's current. */
export const CAROUSEL_TURN = 0.7, FLOW = 1.2;
/** How hard the lollipop trees sway with all the magic: m at the top of one of 3.6 m. */
export const SWAY = 0.3;
/** The glow of the lollipops and the awnings (times their colour), of the candies (their emissive intensity). */
export const GLOW = 0.45, CANDY_GLOW = 0.35;
/** The caramel butterflies: with 4 rubies, and more with the Ruby. */
export const BUTTERFLIES = 8, BUTTERFLIES_RUBY = 2;
/** The grains of sugar sparkling in the air with the Ruby back; m: how big one is. */
export const SPARKLES = 600, SPARKLE_SIZE = 0.16;
/** m: how high a character hops as it dances; rad: how far it turns from side to side. */
export const DANCE_HOP = 0.12, DANCE_TURN = 0.3;

const clamp01 = (v: number) => THREE.MathUtils.clamp(v, 0, 1);

/** Whether `c`'s chain is done: every step of it taken, its ruby given back. */
export const chainDone = (ws: Pick<Game['ws'], 'quests'>, c: CharacterDef) => (ws.quests[c.id] ?? 0) >= c.steps.length;
/** The magic of the Sweet Land's part of the save: the rubies given back, the Ruby restored. */
export function sweetMagicOf(ws: Pick<Game['ws'], 'quests' | 'final'>, characters: readonly CharacterDef[]): number {
  return partsMagic(characters.filter((c) => chainDone(ws, c)).length, ws.final);
}

/** What a magic `m` makes of each thing it touches, `back` - whose rubies are back, by character (the unit test reads it; the world lays it on). */
export function sweetLook(m: number, back: readonly boolean[]) {
  const a = alive(m), top = partsTop(back.length);
  const ruby = clamp01((m - top) / (1 - top));
  // the 3-4 of the document: nothing with two rubies, half with three, all of it with four
  const lively = clamp01((m - 2 * PART_MAGIC) / (2 * PART_MAGIC));
  const step = (s: Steps) => s[0] + (s[1] - s[0]) * a + (s[2] - s[1]) * ruby;
  return {
    life: a, ruby, lively,
    /** how pale the land is out of the zones, and in each character's zone */
    pale: PALE * (1 - NEUTRAL * a) * (1 - ruby) - RICH * ruby,
    zones: back.map((b) => (b ? 0 : PALE * (1 - ruby)) - RICH * ruby),
    /** 0 - the grey cream, 1 - as made, 2 - rosy */
    cream: a + ruby,
    /** 0 - the pale sky, 1 - the sky taken, 2 - the Ruby's */
    sky: a + ruby,
    sun: step(SUN_POWER), hemi: step(HEMI_POWER),
    carousel: CAROUSEL_TURN * a, flow: FLOW * a,
    sway: lively,
    glow: 0.6 * lively + 0.4 * ruby,
    butterflies: BUTTERFLIES * lively + BUTTERFLIES_RUBY * ruby,
    sparkle: ruby, dance: ruby,
  };
}

/** The uniforms of the land's materials the magic changes (shared by all of them: no program is rebuilt). */
const U = {
  uSweetPale: { value: [0, 0, 0, 0, 0, 0] },                   // the five zones of FRIENDS' order, then the rest
  uSweetZones: { value: [0, 1, 2, 3, 4].map(() => new THREE.Vector2()) },
  uSweetSway: { value: 0 }, uSweetGlow: { value: 0 },
  uSweetFlow: { value: 0 }, uSweetStreak: { value: 0 },
  uSweetTint: { value: [0, 1, 2, 3, 4].map(() => new THREE.Color()) }, uSweetRest: { value: new THREE.Color(REST_TINT) },
};

/** What a material of the land does besides its colour: sway (instanced), glow where its colour is `glow`, flow (the river). */
interface Sweeten { sway?: boolean; glow?: string; flow?: boolean; tint?: boolean }

/** `base` cloned with the magic's colour by zone (and what `o` adds): the clone is the magic's, the base stays as it was. */
function sweetened(base: THREE.MeshStandardMaterial, name: string, o: Sweeten = {}): THREE.MeshStandardMaterial {
  const m = base.clone();
  m.name = `sweet-magic:${name}`;
  const key = new THREE.Color(o.glow ?? '#000000');
  m.defines = { ...m.defines, ...(o.sway ? { SWEET_SWAY: '' } : {}), ...(o.glow ? { SWEET_GLOW: '' } : {}), ...(o.flow ? { SWEET_FLOW: '' } : {}), ...(o.tint ? { SWEET_TINT: '' } : {}) };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U, { uTime, uSweetKey: { value: key } });
    sh.vertexShader = `uniform float uTime;\nuniform float uSweetSway;\nvarying vec2 vSweetAt;\n#ifdef SWEET_FLOW\nattribute vec2 flow;\nvarying vec2 vSweetFlow;\n#endif\n`
      + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        #if defined(SWEET_SWAY) && defined(USE_INSTANCING)
          // the top of a lollipop tree sways, its foot stays: each tree in its own time
          vec2 sweetRoot = instanceMatrix[3].xz;
          float sweetBend = uSweetSway * ${(SWAY / 13).toFixed(5)} * position.y * position.y;
          transformed.x += sin(uTime * 1.6 + sweetRoot.x * 0.4 + sweetRoot.y * 0.3) * sweetBend;
          transformed.z += cos(uTime * 1.2 + sweetRoot.y * 0.5) * sweetBend * 0.6;
        #endif
        #ifdef SWEET_FLOW
          vSweetFlow = flow;
        #endif`).replace('#include <project_vertex>', `#include <project_vertex>
        {
          vec4 sweetW = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            sweetW = instanceMatrix * sweetW;
          #endif
          vSweetAt = (modelMatrix * sweetW).xz;
        }`);
    sh.fragmentShader = `uniform float uTime;\nuniform float uSweetPale[6];\nuniform vec2 uSweetZones[5];\nuniform float uSweetGlow;\nuniform vec3 uSweetKey;\nuniform float uSweetFlow;\nuniform float uSweetStreak;\nuniform vec3 uSweetTint[5];\nuniform vec3 uSweetRest;\nvarying vec2 vSweetAt;\n#ifdef SWEET_FLOW\nvarying vec2 vSweetFlow;\n#endif\n`
      + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        // pale by where it stands: the zone of a character whose ruby is back has its colour, the rest washed toward white
        float sweetPale = uSweetPale[5];
        for (int i = 0; i < 5; i++) sweetPale = mix(sweetPale, uSweetPale[i], 1.0 - smoothstep(${ZONE_R[0].toFixed(1)}, ${ZONE_R[1].toFixed(1)}, distance(vSweetAt, uSweetZones[i])));
        float sweetShine = 1.0 - max(sweetPale, 0.0) / ${PALE.toFixed(3)};
        #ifdef SWEET_TINT
          // the light ground (not the golden ways) takes its zone's colour as the zone's ruby comes back
          float sweetLight = smoothstep(0.5, 0.7, diffuseColor.b); // the cream, not the golden ways (their blue is low)
          diffuseColor.rgb = mix(diffuseColor.rgb, uSweetRest, sweetLight * ${REST.toFixed(2)} * clamp(-uSweetPale[5] / ${RICH.toFixed(3)}, 0.0, 1.0));
          for (int i = 0; i < 5; i++) {
            float sweetIn = 1.0 - smoothstep(${ZONE_R[0].toFixed(1)}, ${ZONE_R[1].toFixed(1)}, distance(vSweetAt, uSweetZones[i]));
            diffuseColor.rgb = mix(diffuseColor.rgb, uSweetTint[i], sweetLight * sweetIn * ${TINT.toFixed(2)} * clamp(1.0 - uSweetPale[i] / ${PALE.toFixed(3)}, 0.0, 1.0));
          }
        #endif
        #ifdef SWEET_FLOW
          // the current: lighter streaks of chocolate running along the river toward the mill's pond
          float sweetStreak = smoothstep(0.55, 1.0, sin(vSweetFlow.x * 0.7 - uSweetFlow + sin(vSweetFlow.y * 2.5 + vSweetFlow.x * 0.3) * 1.2));
          diffuseColor.rgb *= 1.0 + uSweetStreak * sweetStreak * 0.6;
        #endif
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.299, 0.587, 0.114))), sweetPale);
        diffuseColor.rgb = clamp(diffuseColor.rgb, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), max(sweetPale, 0.0) * ${(PALE_LIGHT / PALE).toFixed(3)});`)
        .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        #ifdef USE_COLOR
          // the glaze - the white icing and the cream - shines where the colour is back
          roughnessFactor = mix(roughnessFactor, ${GLAZE_ROUGH.toFixed(2)}, sweetShine * smoothstep(0.75, 0.92, dot(vColor.rgb, vec3(0.299, 0.587, 0.114))));
        #endif`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        #if defined(SWEET_GLOW) && defined(USE_COLOR)
          totalEmissiveRadiance += vColor.rgb * uSweetGlow * ${GLOW.toFixed(2)} * (1.0 - smoothstep(0.12, 0.3, distance(vColor.rgb, uSweetKey)));
        #endif`);
  };
  m.customProgramCacheKey = () => `sweet-magic:${o.sway ? 's' : ''}${o.glow ? 'g' : ''}${o.flow ? 'f' : ''}${o.tint ? 't' : ''}`;
  return m;
}

/** The meshes that sway and glow as lollipops (./scenery.ts), the market's stalls whose awnings glow. */
const LOLLIPOPS = ['lollipops', 'garden-lollipops', 'landmark-garden'];
const LOLLIPOP_RED = '#e8364f', AWNING_YELLOW = '#ffd84a', CANDY_GLOW_COLOUR = '#ffb347';

const SPARKLE_VERTEX = `
uniform float uTime; uniform float uOpacity; uniform float uScale;
attribute float phase;
varying float vA;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position + vec3(0.0, sin(uTime * 0.7 + phase) * 0.3, 0.0), 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float tw = 0.5 + 0.5 * sin(uTime * 3.0 + phase * 7.0);
  vA = uOpacity * tw * tw;
  gl_PointSize = ${SPARKLE_SIZE.toFixed(2)} * (0.4 + 0.6 * tw) * uScale / -mvPosition.z;
  #include <fog_vertex>
}`;
const SPARKLE_FRAGMENT = `
varying float vA;
#include <common>
#include <fog_pars_fragment>
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float a = vA * (1.0 - d);
  #ifdef USE_FOG
    a *= 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
  #endif
  gl_FragColor = vec4(1.0, 0.97, 0.9, a);
}`;

/** The sugar in the air: one mesh of points over the land, hidden until the Ruby is back. */
export function buildSparkle(scene: THREE.Scene, groundY: (x: number, z: number) => number) {
  const pos = new Float32Array(SPARKLES * 3), phase = new Float32Array(SPARKLES);
  // deterministic: the same grains every entry
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  for (let i = 0; i < SPARKLES; i++) {
    const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * (HALF - 3), x = Math.cos(a) * r, z = Math.sin(a) * r;
    pos.set([x, groundY(x, z) + 0.6 + rnd() * 3.4, z], i * 3);
    phase[i] = rnd() * 100;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('phase', new THREE.BufferAttribute(phase, 1));
  const material = new THREE.ShaderMaterial({
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, { uOpacity: { value: 0 }, uScale: { value: 500 } }]),
    vertexShader: SPARKLE_VERTEX, fragmentShader: SPARKLE_FRAGMENT, fog: true,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  material.uniforms.uTime = uTime;
  material.name = 'sugar-sparkle';
  const points = new THREE.Points(geo, material);
  points.name = 'sugar-sparkle'; points.visible = false;
  // a grain is SPARKLE_SIZE m on any screen: the points' size in pixels follows the height of the picture drawn
  const size = new THREE.Vector2();
  points.onBeforeRender = (renderer, _s, camera) => {
    const fov = (camera as THREE.PerspectiveCamera).fov ?? 50;
    material.uniforms.uScale.value = renderer.getDrawingBufferSize(size).y / (2 * Math.tan(THREE.MathUtils.degToRad(fov) / 2));
  };
  scene.add(points);
  return { points, material };
}

/**
 * The magic of the Sweet Land: built after the scenery and the characters (it gives the land's meshes materials of its
 * own and turns the carousel), its `update` in the frame.
 */
export function createSweetMagic(g: Pick<Game, 'scene' | 'ws' | 'flies' | 'groundY'>, scope: WorldScope,
  o: { sky: WorldSky; scenery: Pick<Scenery, 'spin'>; characters: readonly CharacterDef[]; dancers: readonly THREE.Object3D[] }): Magic {
  const { scene, ws, flies } = g;
  o.characters.forEach((c, i) => { const z = ZONES[ZONE_OF[c.id]]; U.uSweetZones.value[i].set(z.x, z.z); U.uSweetTint.value[i].set(ZONE_TINT[ZONE_OF[c.id]]); });
  // the land's materials: the shared paint of the shapes, the lollipops', the stalls', the ground's, the river's, the candies'
  const paint = paintMaterial();
  const own = new Map<string, THREE.MeshStandardMaterial>();
  const mine = (key: string, make: () => THREE.MeshStandardMaterial) => own.get(key) ?? (own.set(key, make()), own.get(key)!);
  const was: { mesh: THREE.Mesh; material: THREE.Material | THREE.Material[] }[] = [];
  let candies: THREE.MeshStandardMaterial | null = null;
  const creams: { material: THREE.MeshStandardMaterial; was: THREE.Color }[] = [];
  let hemi: THREE.HemisphereLight | null = null;
  scene.traverse((x) => {
    if (x instanceof THREE.HemisphereLight) hemi = x;
    if (!(x instanceof THREE.Mesh) || !(x.material instanceof THREE.MeshStandardMaterial)) return;
    const base = x.material;
    if (x.name === 'cream-hills' || x.name === 'cream-rim') { creams.push({ material: base, was: base.color.clone() }); return; }
    let next: THREE.MeshStandardMaterial | null = null;
    if (base === paint) {
      next = LOLLIPOPS.includes(x.name) ? mine('lollipops', () => sweetened(paint, 'lollipops', { sway: true, glow: LOLLIPOP_RED }))
        : x.name === 'market-stalls' ? mine('stalls', () => sweetened(paint, 'stalls', { glow: AWNING_YELLOW }))
          : mine('paint', () => sweetened(paint, 'paint'));
    } else if (x.name === 'sweet-ground') next = mine('ground', () => sweetened(base, 'ground', { tint: true }));
    else if (x.name === 'chocolate-river') next = mine('river', () => sweetened(base, 'river', { flow: true }));
    else if (x.name === 'candies') {
      next = candies = mine('candies', () => { const c = sweetened(base, 'candies'); c.emissive.set(CANDY_GLOW_COLOUR); return c; });
    }
    if (!next) return;
    was.push({ mesh: x, material: x.material });
    x.material = next;
  });
  const bg = scene.background as THREE.Color, fog = scene.fog as THREE.Fog;
  const sunWas = { power: o.sky.sun.intensity }, hemiWas = (hemi as THREE.HemisphereLight | null)?.intensity;
  const bgWas = bg.clone(), fogWas = fog.color.clone();
  const [cream0, cream1, cream2] = CREAM.map((c) => new THREE.Color(c));
  const [bg0, bg1, bg2] = BACKGROUND.map((c) => new THREE.Color(c)), [haze0, haze1, haze2] = HAZE.map((c) => new THREE.Color(c));
  const sparkle = buildSparkle(scene, g.groundY);

  // the caramel butterflies: two over each character's zone, no size until the magic brings them
  const caramel = ['#e8a04a', '#f5c16c', '#d9822b', '#ffd27a', '#c97a3a'];
  const first = flies.flies.length;
  const bfs = Array.from({ length: BUTTERFLIES + BUTTERFLIES_RUBY }, (_, i) => {
    const c = o.characters[i % o.characters.length], z = ZONES[ZONE_OF[c.id]], a = i * 2.4;
    const id = flies.add(z.x + Math.cos(a) * 4, z.z + Math.sin(a) * 4, 3.5, caramel[i % caramel.length]);
    flies.flies[id].scale = 0;
    return flies.flies[id];
  });

  scope.own(() => {
    for (const { mesh, material } of was) mesh.material = material;
    for (const m of own.values()) m.dispose();
    sparkle.points.removeFromParent(); sparkle.points.geometry.dispose(); sparkle.material.dispose();
    o.sky.sun.intensity = sunWas.power;
    if (hemi && hemiWas !== undefined) (hemi as THREE.HemisphereLight).intensity = hemiWas;
    bg.copy(bgWas); fog.color.copy(fogWas);
    for (const c of creams) c.material.color.copy(c.was);
    flies.mesh.visible = true;
    for (const d of o.dancers) { d.position.y = 0; d.rotation.y = 0; }
    U.uSweetSway.value = 0; U.uSweetGlow.value = 0; U.uSweetStreak.value = 0;
  });

  // whose ruby is back; with a debug value of the magic (its pictures) as its rubies would bring it: the k-th
  // character's from the magic of k + 1 rubies
  let forced: number | null = null;
  const back = () => o.characters.map((c, k) => (forced !== null ? forced >= (k + 1) * PART_MAGIC - 1e-6 : chainDone(ws, c)));
  // a zone's colour comes back over a second or so (dt 0: at once - the first frame, the debug value)
  const zones = [0, 0, 0, 0, 0].map(() => -1);
  const magic = followMagic(() => sweetMagicOf(ws, o.characters), (m, dt) => {
    const l = sweetLook(m, back());
    const k = dt > 0 ? damp(1.5, dt) : 1;
    l.zones.forEach((p, i) => { zones[i] = zones[i] < 0 ? p : zones[i] + (p - zones[i]) * k; U.uSweetPale.value[i] = zones[i]; });
    U.uSweetPale.value[5] = l.pale;
    U.uSweetSway.value = l.sway; U.uSweetGlow.value = l.glow;
    U.uSweetFlow.value += dt * l.flow; U.uSweetStreak.value = l.life;
    if (candies) candies.emissiveIntensity = CANDY_GLOW * l.glow;
    bg.copy(bg0).lerp(bg1, Math.min(1, l.sky)).lerp(bg2, Math.max(0, l.sky - 1));
    for (const c of creams) c.material.color.copy(cream0).lerp(cream1, Math.min(1, l.cream)).lerp(cream2, Math.max(0, l.cream - 1));
    fog.color.copy(haze0).lerp(haze1, Math.min(1, l.sky)).lerp(haze2, Math.max(0, l.sky - 1));
    o.sky.sun.intensity = l.sun;
    if (hemi) (hemi as THREE.HemisphereLight).intensity = l.hemi;
    o.scenery.spin(dt, l.carousel);
    bfs.forEach((f, i) => { f.scale = clamp01(l.butterflies - i); });
    // the flock is drawn only while it has a butterfly of a size: the land has no others
    flies.mesh.visible = first > 0 || bfs.some((f) => f.scale > 0);
    sparkle.material.uniforms.uOpacity.value = l.sparkle;
    sparkle.points.visible = l.sparkle > 0;
    const t = uTime.value;
    o.dancers.forEach((d, i) => {
      d.position.y = DANCE_HOP * Math.abs(Math.sin(t * 4 + i * 1.3)) * l.dance;
      d.rotation.y = DANCE_TURN * Math.sin(t * 2 + i) * l.dance;
    });
  });
  return {
    get value() { return magic.value; },
    get target() { return magic.target; },
    update: (dt) => magic.update(dt),
    set: (v) => { forced = v === null ? null : clamp01(v); magic.set(v); },
  };
}

/** The uniforms as the magic last laid them (the unit test reads them). */
export const sweetUniforms = U;
