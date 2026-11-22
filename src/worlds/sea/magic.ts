import * as THREE from 'three';
import { followMagic, partsMagic, partsTop, PART_MAGIC, type Magic } from '../../game/magic';
import type { Game } from '../../game/context';
import type { WorldScope } from '../../game/scope';
import type { CharacterDef } from '../../game/world';
import type { buildBubbles } from './bubbles';
import type { SeaCreatures } from './creatures';
import { uKelpSway } from './life';
import { liftedPaintMaterial, type PaintLift } from './paint';
import { uCaustic, uMute } from './terrain';

/**
 * The magic of the sea (WORLD-09, docs/worlds/world-3.md "Мир оживает"): every pearl given back - a chain of a
 * character finished - adds PART_MAGIC, the Pearl of the Deep restored at the throne brings it to 1. Read from the
 * progress the save holds: nothing new is stored.
 *
 * With no magic the sea is muted - a colder, dimmer light, faint caustics, pale corals, fewer fish and bubbles, the
 * jellyfish and the trench's lights dim; the magic adds with what is already there - no model, no light more:
 * - 1-2 pearls: more bubbles in the columns;
 * - with each pearl the light warmer and brighter, the caustics and the shafts back, the corals' colours back;
 * - 3-4: the kelp sways more, the jellyfish and the lights of the trench glow, the schools fill up;
 * - the Pearl back: the light a little warmer still, the castle shimmers in mother-of-pearl, its windows lit far off.
 * The haze is never touched (the customer's).
 * As the forest's (src/worlds/forest/magic.ts), the change comes more with the first pearls (`alive`).
 */

/** How much of the change a magic `m` brings: more with the first pearls (three give two thirds). */
export const alive = (m: number) => Math.pow(Math.max(0, m), 0.6);
/**
 * A thing of the look with no magic, with all the pearls' and with the Pearl back: a cooler, dimmer, paler sea with
 * none (the customer, 2026-11-22: "сделать разницу с жемчужинами заметнее"), the one the customer took with the pearls,
 * a little more with the Pearl. The haze stays as it is (the customer's: 2026-11-21).
 */
type Steps = readonly [number, number, number];
/** The sun's strength, its colour (cold - as taken - warm) and the water's light from above. */
export const SUN_POWER: Steps = [1.5, 2.2, 2.3];
export const SUN_COLOUR: readonly [string, string, string] = ['#d4e4f2', '#fff7e8', '#fff0d4'];
export const HEMI_POWER: Steps = [1.1, 1.5, 1.55];
/** The caustics on the sand (./terrain.ts uCaustic; taken at 0.45). */
export const CAUSTICS: Steps = [0.12, 0.45, 0.5];
/** The shafts' opacity (0.055 and more washed the picture white where a shaft stood before the camera: the pictures of step C). */
export const SHAFT_LIGHT: Steps = [0.015, 0.035, 0.04];
/** How muted the floor and the kelp are (./terrain.ts uMute): grey-ish with none, as taken with the pearls, a little richer with the Pearl. */
export const MUTE: Steps = [0.5, 0, -0.12];
/** How much of their colour the corals and the anemones lose with no magic (0: none), and how much lighter they go. */
export const PALE = 0.65, PALE_LIGHT = 0.18;
/** How much harder the kelp sways with all the magic (1: as it always did). */
export const MAGIC_SWAY = 1.6;
/** The trench's lights with no magic and with all of it. */
export const TRENCH_LIGHTS: readonly [string, string] = ['#3e9c96', '#8ffff2'];
/** The castle with the Pearl back (./paint.ts PaintLift): its colours shining, the mother-of-pearl's shimmer, its windows and pearls lit (times more). */
export const CASTLE = { lift: 0.04, nacre: 0.6, lights: 1.5 } as const;

const chainDone = (ws: Pick<Game['ws'], 'quests'>, c: CharacterDef) => (ws.quests[c.id] ?? 0) >= c.steps.length;
/** The magic of the sea's part of the save: the pearls given back, the Pearl restored. */
export function seaMagicOf(ws: Pick<Game['ws'], 'quests' | 'final'>, characters: readonly CharacterDef[]): number {
  return partsMagic(characters.filter((c) => chainDone(ws, c)).length, ws.final);
}

/** What a magic `m` makes of each thing it touches (the unit test reads it; the world lays it on). */
export function seaLook(m: number, characters = 5) {
  const a = alive(m), top = partsTop(characters);
  const pearl = THREE.MathUtils.clamp((m - top) / (1 - top), 0, 1);
  const step = (s: Steps) => s[0] + (s[1] - s[0]) * a + (s[2] - s[1]) * pearl;
  return {
    life: a,
    bubbles: THREE.MathUtils.clamp(m / (2 * PART_MAGIC), 0, 1),
    sway: 1 + (MAGIC_SWAY - 1) * a,
    lights: a,
    /** 0 - the cold light, 1 - the light taken, 2 - the warm one */
    warmth: a + pearl,
    sun: step(SUN_POWER),
    hemi: step(HEMI_POWER),
    caustics: step(CAUSTICS),
    mute: step(MUTE),
    shafts: step(SHAFT_LIGHT),
    /** how much of their colour the corals lack */
    pale: PALE * (1 - a),
    pearl,
  };
}

/** The corals' and the anemones' instanced meshes (./scenery.ts): their colours the magic pales. */
const PALED = (name: string) => name.startsWith('reef-') || name.startsWith('corals-') || name === 'anemones';

/** The magic of the sea: built after the scenery, the shafts, the creatures and the bubbles. */
export function createSeaMagic(g: Pick<Game, 'scene' | 'ws'>, scope: WorldScope, o: { creatures: SeaCreatures; bubbles: ReturnType<typeof buildBubbles>; characters: readonly CharacterDef[] }): Magic {
  const { scene, ws } = g;
  const castle = scene.getObjectByName('castle') as THREE.Mesh | undefined;
  const shafts = scene.getObjectByName('light-shafts') as THREE.Mesh | undefined;
  const lights = scene.getObjectByName('trench-lights') as THREE.Mesh | undefined;
  let sun: THREE.DirectionalLight | undefined, hemi: THREE.HemisphereLight | undefined;
  const paled: { mesh: THREE.InstancedMesh; was: Float32Array }[] = [];
  scene.traverse((x) => {
    if (x instanceof THREE.DirectionalLight) sun = x;
    if (x instanceof THREE.HemisphereLight) hemi = x;
    if (x instanceof THREE.InstancedMesh && x.instanceColor && PALED(x.name)) paled.push({ mesh: x, was: (x.instanceColor.array as Float32Array).slice() });
  });
  const sunWas = sun ? { power: sun.intensity, colour: sun.color.clone() } : null, hemiWas = hemi?.intensity;
  const lift: PaintLift = { lift: { value: 0 }, nacre: { value: 0 }, lights: { value: 0 } };
  const castleWas = castle?.material;
  const lifted = liftedPaintMaterial(lift);
  if (castle) castle.material = lifted;
  const [dim, bright] = TRENCH_LIGHTS.map((c) => new THREE.Color(c));
  const [cold, taken, warm] = SUN_COLOUR.map((c) => new THREE.Color(c));
  const c = new THREE.Color(), hsl = { h: 0, s: 0, l: 0 };
  let paleWas = -1;
  const paleTo = (k: number) => {
    if (Math.abs(k - paleWas) < 1e-3) return;
    paleWas = k;
    for (const { mesh, was } of paled) {
      const arr = mesh.instanceColor!.array as Float32Array;
      for (let i = 0; i < was.length; i += 3) {
        c.setRGB(was[i], was[i + 1], was[i + 2]).getHSL(hsl);
        c.setHSL(hsl.h, hsl.s * (1 - k), hsl.l + (0.8 - hsl.l) * PALE_LIGHT * (k / PALE)).toArray(arr, i);
      }
      mesh.instanceColor!.needsUpdate = true;
    }
  };
  scope.own(() => {
    uKelpSway.value = 1; uCaustic.value = CAUSTICS[1]; uMute.value = 0; lifted.dispose();
    paleTo(0);
    if (sun && sunWas) { sun.intensity = sunWas.power; sun.color.copy(sunWas.colour); }
    if (hemi && hemiWas !== undefined) hemi.intensity = hemiWas;
    if (castle && castleWas) castle.material = castleWas;
  });
  return followMagic(() => seaMagicOf(ws, o.characters), (m) => {
    const l = seaLook(m, o.characters.length);
    o.creatures.life(l.life);
    o.bubbles.share(l.bubbles);
    uKelpSway.value = l.sway;
    uCaustic.value = l.caustics;
    uMute.value = l.mute;
    if (sun) { sun.intensity = l.sun; sun.color.copy(cold).lerp(taken, Math.min(1, l.warmth)).lerp(warm, Math.max(0, l.warmth - 1)); }
    if (hemi) hemi.intensity = l.hemi;
    paleTo(l.pale);
    if (lights) (lights.material as THREE.MeshBasicMaterial).color.copy(dim).lerp(bright, l.lights);
    if (shafts) (shafts.material as THREE.MeshBasicMaterial).opacity = l.shafts;
    lift.lift.value = CASTLE.lift * l.pearl; lift.nacre.value = CASTLE.nacre * l.pearl; lift.lights.value = CASTLE.lights * l.pearl;
  });
}
