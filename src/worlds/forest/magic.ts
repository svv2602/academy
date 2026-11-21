import * as THREE from 'three';
import { uSway } from '../../core/materials';
import { damp, lerp } from '../../core/util';
import type { Game } from '../../game/context';
import { PART_MAGIC, followMagic, partsMagic, partsTop, type Magic } from '../../game/magic';
import type { WorldScope } from '../../game/scope';
import type { CharacterDef, WorldSky } from '../../game/world';
import type { buildFireflies } from './fireflies';
import { HALF, ZONES, type ZoneId } from './layout';
import { uBloom } from './undergrowth';

/**
 * The magic of the forest (WORLD-09, docs/worlds/world-2.md "Мир оживает"): every leaf of the Emerald given back - a
 * chain of a character finished - adds PART_MAGIC, the Emerald restored at the Old Oak brings it to 1. Read from the
 * progress the save holds: nothing new is stored.
 *
 * With no magic the forest is the evening the customer took (2026-11-21), its sky and light as they were; the magic
 * only adds to it, with what is already there - no model, no light:
 * - the sky a deeper gold, the haze further off, the sun and the sky light stronger;
 * - the paths glow: the lanterns, the windows of the village, the Oak's crown and the altar, dim with no magic;
 * - the fireflies of a glade wake when its character's chain is done (the owl's blue ones with Mudrena's), the ones
 *   along the paths with the magic (half of them with none);
 * - the wind bends the plants more, the flowers of the undergrowth open;
 * - butterflies over the glades from the third leaf;
 * - and once the Emerald is back, the rays of the evening through the crowns (the one draw the magic adds).
 */

/** The evening with no magic (the customer's, 2026-11-21: ./index.ts SKY) and with all of it. */
export const MAGIC_LOOK = {
  background: ['#f4c79a', '#f8d08c'], haze: ['#ecc6a0', '#f3d29e'], sun: ['#ffc685', '#ffd28e'],
  sunPower: [2.3, 2.8], hemiPower: [1.2, 1.45],
  /** m: where the haze begins (it ends where it did: the camera sees just past it). */
  fogNear: [HALF * 0.9, HALF * 1.2],
} as const;
/** The glow of the lights of the forest: with no magic and with all of it (all of it - as they were made). */
export const MAGIC_GLOW: Record<string, readonly [number, number]> = {
  'lantern-light': [0.15, 1.2], 'house-windows': [0.25, 0.8], 'oak-crown': [0.08, 0.5], altar: [0.15, 0.8],
};
/** Whose chain wakes the fireflies of a glade; the glades of no one wake with the magic, as the paths'. */
export const GLADE_OF: Partial<Record<ZoneId, string>> = { village: 'borovik', owl: 'mudrena', grove: 'shustrik', ash: 'yasen', maze: 'kolyuchka' };
/** How much of the fireflies of the paths float with no magic. */
export const PATH_FLIES = 0.5;
/** How much stronger the wind bends the plants with all the magic (1: as they always swayed). */
export const MAGIC_SWAY = 1.5;
/** How open the flowers are with no magic (1 with all of it). */
export const BLOOM = 0.4;
/** The butterflies the magic brings, from the third leaf (all of them with the fifth). */
export const MAGIC_BUTTERFLIES = 8;
export const BUTTERFLY_FROM = 2 * PART_MAGIC;
/** The rays through the crowns: over these glades, as bright as this with the Emerald back. */
export const RAY_GLADES: readonly ZoneId[] = ['center', 'oak', 'owl', 'village', 'grove', 'ash', 'stream'];
export const RAY_ALPHA = 0.35;

/** Whether `c`'s chain is done: every step of it taken (its leaf given back). */
export const chainDone = (ws: Pick<Game['ws'], 'quests'>, c: CharacterDef) => (ws.quests[c.id] ?? 0) >= c.steps.length;

/** The magic of the forest's part of the save: the leaves given back, the Emerald restored. */
export function forestMagicOf(ws: Pick<Game['ws'], 'quests' | 'final'>, characters: readonly CharacterDef[]): number {
  return partsMagic(characters.filter((c) => chainDone(ws, c)).length, ws.final);
}

/**
 * The rays of the evening (our own shape): an open cone from every glade of RAY_GLADES up toward the sun, narrow at
 * the crowns and wide on the glade, faded at both ends, laid on what is behind (additive): one instanced mesh, no
 * shadow, hidden until the Emerald is back.
 */
export function buildRays(scene: THREE.Scene, groundY: (x: number, z: number) => number, toSun: THREE.Vector3) {
  const len = 16, geo = new THREE.CylinderGeometry(1.3, 2.6, len, 10, 4, true).translate(0, len / 2, 0);
  // alpha by height: none where it meets the ground and the crowns, most a third of the way up
  const pos = geo.getAttribute('position'), col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) col.set([1, 1, 1, Math.sin(Math.PI * Math.pow(pos.getY(i) / len, 0.75))], i * 4);
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  const material = new THREE.MeshBasicMaterial({
    color: '#fff0c8', vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
  });
  const mesh = new THREE.InstancedMesh(geo, material, RAY_GLADES.length);
  const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), toSun.clone().normalize()), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  RAY_GLADES.forEach((id, i) => { const z = ZONES[id]; mesh.setMatrixAt(i, m.compose(new THREE.Vector3(z.x, groundY(z.x, z.z), z.z), q, one)); });
  mesh.computeBoundingSphere();
  mesh.name = 'forest-rays'; mesh.castShadow = false; mesh.receiveShadow = false; mesh.visible = false;
  scene.add(mesh);
  return { mesh, material };
}

/**
 * The magic of the forest: built after the scenery, the decor and the fireflies (it finds their lights by name and
 * gives each a material of its own - the style's are shared), before the frame updates the fireflies.
 */
export function createForestMagic(g: Game, scope: WorldScope, o: { sky: WorldSky; fireflies: ReturnType<typeof buildFireflies>; characters: readonly CharacterDef[] }): Magic {
  const { scene, ws, flies } = g;
  const bg = scene.background as THREE.Color, fog = scene.fog as THREE.Fog;
  let hemi: THREE.HemisphereLight | null = null;
  const glowing: { mat: THREE.MeshStandardMaterial; glow: readonly [number, number] }[] = [];
  const own = new Map<string, THREE.MeshStandardMaterial>();
  scene.traverse((x) => {
    if (x instanceof THREE.HemisphereLight) hemi = x;
    const glow = MAGIC_GLOW[x.name];
    if (!glow || !(x instanceof THREE.Mesh) || !(x.material instanceof THREE.MeshStandardMaterial)) return;
    const key = `${x.material.uuid}|${x.name}`;
    let mine = own.get(key);
    if (!mine) {
      mine = x.material.clone(); mine.name = `forest-magic:${x.name}`;
      own.set(key, mine); glowing.push({ mat: mine, glow });
    }
    x.material = mine;
  });
  const look = (k: 'background' | 'haze' | 'sun') => MAGIC_LOOK[k].map((c) => new THREE.Color(c));
  const [bg0, bg1] = look('background'), [haze0, haze1] = look('haze'), [sun0, sun1] = look('sun');
  const rays = buildRays(scene, g.groundY, o.sky.sunOffset);
  scope.own(() => {
    uSway.value = 1; uBloom.value = 1; flies.mesh.visible = true;
    for (const m of own.values()) m.dispose();
    rays.mesh.geometry.dispose(); rays.material.dispose();
  });

  // the fireflies: which wake with whose chain; the paths' ones by their rank (the first PATH_FLIES of them with none).
  // With a debug value of the magic (its pictures) a glade wakes as its chain's leaf would bring it: the k-th character's
  // glade from the magic of k + 1 leaves.
  const ff = o.fireflies, byId = new Map(o.characters.map((c) => [c.id, c]));
  const free = ff.flies.map((f, i) => (f.zone && GLADE_OF[f.zone] ? -1 : i)).filter((i) => i >= 0);
  const rank = new Float32Array(ff.flies.length);
  free.forEach((i, k) => { rank[i] = (k + 0.5) / free.length; });
  const flyTarget = (i: number, m: number) => {
    const z = ff.flies[i].zone, who = z ? GLADE_OF[z] : undefined;
    if (who) {
      const c = byId.get(who)!;
      if (forced) return m >= (o.characters.indexOf(c) + 1) * PART_MAGIC - 1e-6 ? 1 : 0;
      return chainDone(ws, c) ? 1 : 0;
    }
    return rank[i] <= PATH_FLIES + (1 - PATH_FLIES) * m ? 1 : 0;
  };

  // the butterflies of the magic: over the glades, no size until the magic brings them
  const colours = ['#ffd1ec', '#fff2a8', '#bfe8ff', '#e2ccff', '#ffffff'];
  const glades = Object.values(ZONES);
  const bfs = Array.from({ length: MAGIC_BUTTERFLIES }, (_, i) => {
    const z = glades[i % glades.length], a = i * 2.4;
    const id = flies.add(z.x + Math.cos(a) * 3, z.z + Math.sin(a) * 3, 3, colours[i % colours.length]);
    flies.flies[id].scale = 0;
    return flies.flies[id];
  });
  const first = flies.flies.length - MAGIC_BUTTERFLIES;
  const top = partsTop(o.characters.length);

  let forced = false;
  const magic = followMagic(() => forestMagicOf(ws, o.characters), (m, dt) => {
    bg.copy(bg0).lerp(bg1, m);
    fog.color.copy(haze0).lerp(haze1, m);
    fog.near = lerp(MAGIC_LOOK.fogNear[0], MAGIC_LOOK.fogNear[1], m);
    o.sky.sun.color.copy(sun0).lerp(sun1, m);
    o.sky.sun.intensity = lerp(MAGIC_LOOK.sunPower[0], MAGIC_LOOK.sunPower[1], m);
    if (hemi) (hemi as THREE.HemisphereLight).intensity = lerp(MAGIC_LOOK.hemiPower[0], MAGIC_LOOK.hemiPower[1], m);
    for (const { mat, glow } of glowing) mat.emissiveIntensity = lerp(glow[0], glow[1], m);
    uSway.value = lerp(1, MAGIC_SWAY, m);
    uBloom.value = lerp(BLOOM, 1, m);
    // a firefly comes and goes over half a second (dt 0: at once - the first frame, the debug value)
    const k = dt > 0 ? damp(4, dt) : 1;
    for (let i = 0; i < ff.lit.length; i++) ff.lit[i] += (flyTarget(i, m) - ff.lit[i]) * k;
    const shown = THREE.MathUtils.clamp((m - BUTTERFLY_FROM) / (top - BUTTERFLY_FROM), 0, 1) * MAGIC_BUTTERFLIES;
    bfs.forEach((f, i) => { f.scale = THREE.MathUtils.clamp(shown - i, 0, 1); });
    // the flock is drawn only while it has a butterfly of a size: the forest has no others
    flies.mesh.visible = first > 0 || bfs.some((f) => f.scale > 0);
    // the rays are the Emerald's: only over the magic the leaves cannot give
    const ray = THREE.MathUtils.clamp((m - top) / (1 - top), 0, 1);
    rays.material.opacity = ray * RAY_ALPHA;
    rays.mesh.visible = ray > 0;
  });
  return {
    get value() { return magic.value; },
    get target() { return magic.target; },
    update: (dt) => magic.update(dt),
    set: (v) => { forced = v !== null; magic.set(v); },
  };
}
