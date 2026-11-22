import * as THREE from 'three';
import { followMagic, partsMagic, partsTop, PART_MAGIC, type Magic } from '../../game/magic';
import type { Game } from '../../game/context';
import type { WorldScope } from '../../game/scope';
import type { CharacterDef } from '../../game/world';
import type { buildBubbles } from './bubbles';
import type { SeaCreatures } from './creatures';
import { uKelpSway } from './life';
import { liftedPaintMaterial } from './paint';

/**
 * The magic of the sea (WORLD-09, docs/worlds/world-3.md "Мир оживает"): every pearl given back - a chain of a
 * character finished - adds PART_MAGIC, the Pearl of the Deep restored at the throne brings it to 1. Read from the
 * progress the save holds: nothing new is stored.
 *
 * With no magic the sea is the one the customer took (2026-11-21/22), only fewer fish and fewer bubbles, the
 * jellyfish and the trench's lights dim; the magic adds with what is already there - no model, no light:
 * - 1-2 pearls: more bubbles in the columns;
 * - 3-4: the kelp sways more, the jellyfish and the lights of the trench glow, the schools fill up;
 * - the Pearl back: the shafts of light brighter, the castle glows, the water clear further.
 * As the forest's (src/worlds/forest/magic.ts), the change comes more with the first pearls (`alive`).
 */

/** How much of the change a magic `m` brings: more with the first pearls (three give two thirds). */
export const alive = (m: number) => Math.pow(Math.max(0, m), 0.6);
/** How much harder the kelp sways with all the magic (1: as it always did). */
export const MAGIC_SWAY = 1.6;
/** The trench's lights with no magic and with all of it. */
export const TRENCH_LIGHTS: readonly [string, string] = ['#3e9c96', '#8ffff2'];
/** The shafts' opacity: with no magic, with the pearls' magic, with the Pearl back (0.08 washed the picture white where a shaft stood before the camera: the pictures of step C, 2026-11-22). */
export const SHAFT_LIGHT: readonly [number, number, number] = [0.035, 0.04, 0.055];
/** How much the castle shines with the Pearl back (./paint.ts liftedPaintMaterial). */
export const CASTLE_LIFT = 0.16;
/**
 * How much further the haze begins and ends with the Pearl back: the far landmarks a little clearer. Where it begins
 * stays (the customer, 2026-11-21: the turquoise haze nearer) - pushed 1.6 times off with the far end 1.35 the sea went
 * pale (the pictures of step C, 2026-11-22).
 */
export const CLEAR_WATER = { near: 1, far: 1.15 };

const chainDone = (ws: Pick<Game['ws'], 'quests'>, c: CharacterDef) => (ws.quests[c.id] ?? 0) >= c.steps.length;
/** The magic of the sea's part of the save: the pearls given back, the Pearl restored. */
export function seaMagicOf(ws: Pick<Game['ws'], 'quests' | 'final'>, characters: readonly CharacterDef[]): number {
  return partsMagic(characters.filter((c) => chainDone(ws, c)).length, ws.final);
}

/** What a magic `m` makes of each thing it touches (the unit test reads it; the world lays it on). */
export function seaLook(m: number, characters = 5) {
  const a = alive(m), top = partsTop(characters);
  const pearl = THREE.MathUtils.clamp((m - top) / (1 - top), 0, 1);
  return {
    life: a,
    bubbles: THREE.MathUtils.clamp(m / (2 * PART_MAGIC), 0, 1),
    sway: 1 + (MAGIC_SWAY - 1) * a,
    lights: a,
    shafts: SHAFT_LIGHT[0] + (SHAFT_LIGHT[1] - SHAFT_LIGHT[0]) * a + (SHAFT_LIGHT[2] - SHAFT_LIGHT[1]) * pearl,
    castle: CASTLE_LIFT * pearl,
    near: 1 + (CLEAR_WATER.near - 1) * pearl,
    far: 1 + (CLEAR_WATER.far - 1) * pearl,
  };
}

/** The magic of the sea: built after the scenery, the shafts, the creatures and the bubbles. */
export function createSeaMagic(g: Pick<Game, 'scene' | 'ws'>, scope: WorldScope, o: { creatures: SeaCreatures; bubbles: ReturnType<typeof buildBubbles>; characters: readonly CharacterDef[] }): Magic {
  const { scene, ws } = g;
  const fog = scene.fog as THREE.Fog, near0 = fog.near, far0 = fog.far;
  const castle = scene.getObjectByName('castle') as THREE.Mesh | undefined;
  const shafts = scene.getObjectByName('light-shafts') as THREE.Mesh | undefined;
  const lights = scene.getObjectByName('trench-lights') as THREE.Mesh | undefined;
  const lift = { value: 0 };
  const castleWas = castle?.material;
  const lifted = liftedPaintMaterial(lift);
  if (castle) castle.material = lifted;
  const [dim, bright] = TRENCH_LIGHTS.map((c) => new THREE.Color(c));
  scope.own(() => {
    uKelpSway.value = 1; lifted.dispose();
    if (castle && castleWas) castle.material = castleWas;
  });
  return followMagic(() => seaMagicOf(ws, o.characters), (m) => {
    const l = seaLook(m, o.characters.length);
    o.creatures.life(l.life);
    o.bubbles.share(l.bubbles);
    uKelpSway.value = l.sway;
    if (lights) (lights.material as THREE.MeshBasicMaterial).color.copy(dim).lerp(bright, l.lights);
    if (shafts) (shafts.material as THREE.MeshBasicMaterial).opacity = l.shafts;
    lift.value = l.castle;
    fog.near = near0 * l.near; fog.far = far0 * l.far;
  });
}
