import * as THREE from 'three';
import { uSway } from '../../core/materials';
import { damp, lerp } from '../../core/util';
import type { Game } from '../../game/context';
import type { FairyLoads } from './load';
import { QUESTS } from './quests';
import { SKY_LOOK, type buildSky } from './sky';

/**
 * The magic of the kingdom (WORLD-09): one number from 0 to 1, read from the progress the save already holds - nothing
 * new is stored. Every shard given back adds SHARD_MAGIC; the Crystal of Light restored brings it to 1 (decision Q11).
 */
export const SHARD_MAGIC = 0.16;

/** The magic of the world's part of the save: the shards given back, the crystal restored. */
export function magicOf(ws: Pick<Game['ws'], 'quests' | 'final'>): number {
  if (ws.final) return 1;
  const shards = QUESTS.filter((q) => (ws.quests[q.id] ?? 0) >= 3).length;
  return Math.min(1, shards * SHARD_MAGIC);
}

/** Objects of which the magic draws more: `base` of them with no magic, `full` with all of it (InstancedMesh, Points). */
export interface MagicCount { base: number; full: number }
/** A glowing material: its emissive intensity with no magic and with all of it. */
export interface MagicGlow { base: number; full: number }

/** Butterflies the magic brings over the meadow, on top of the ambient ones (./butterflies-task.ts). */
export const MAGIC_BUTTERFLIES = 10;
/** How much stronger the wind bends the plants with all the magic back (1: as they always swayed). */
export const MAGIC_SWAY = 1.7;

export interface Magic {
  /** The magic shown now: it follows `target` smoothly. */
  readonly value: number;
  /** The magic of the save (or the debug value). */
  readonly target: number;
  /** One frame: follows the save, then lays the value onto the sky, the light, the wind, the glow and the counts. */
  update(dt: number): void;
  /** Debug (?debug only, through window.__game.setMagic): show this magic at once; null - the save's again. */
  set(v: number | null): void;
}

/**
 * The magic of the first world. Its objects are the ones already built - the sky, its two lights, the haze, the
 * rainbow, the glowing materials, the motes, the flowers (marked by ./sky.ts and ./scenery.ts) and a few butterflies
 * of the shared flock: no model and no light is added. With no magic everything is as the world always looked.
 * Created before the ambient butterflies (./butterflies-task.ts), so the task's ones stay the last of the flock.
 */
export function createMagic(g: Game, L: FairyLoads, sky: ReturnType<typeof buildSky>): Magic {
  const { scene, ws, flies } = g;
  const counted: { obj: THREE.InstancedMesh | THREE.Points; n: MagicCount }[] = [];
  const glowing = new Map<THREE.MeshStandardMaterial, MagicGlow>();
  scene.traverse((o) => {
    const n = o.userData.magicCount as MagicCount | undefined;
    if (n && (o instanceof THREE.InstancedMesh || o instanceof THREE.Points)) counted.push({ obj: o, n });
    const m = (o as THREE.Mesh).material;
    for (const mat of Array.isArray(m) ? m : m ? [m] : []) {
      const gl = mat.userData.magicGlow as MagicGlow | undefined;
      if (gl && mat instanceof THREE.MeshStandardMaterial) glowing.set(mat, gl);
    }
  });
  // The butterflies of the magic: over the meadows around the spawn, hidden (no size) until the magic brings them.
  const palette = ['#ffd1ec', '#fff2a8', '#bfe8ff', '#e2ccff', '#ffffff'];
  const own = Array.from({ length: MAGIC_BUTTERFLIES }, (_, i) => {
    const a = i * 2.1 + 0.7, r = 9 + (i * 23) % 30;
    const id = flies.add(Math.cos(a) * r, Math.sin(a) * r - 4, 2.5, palette[i % palette.length]);
    flies.flies[id].scale = 0;
    return flies.flies[id];
  });
  const skyMat = sky.sky.material as THREE.ShaderMaterial;
  const fog0 = new THREE.Color(SKY_LOOK.fog[0]), fog1 = new THREE.Color(SKY_LOOK.fog[1]);
  let forced: number | null = null;
  let value = magicOf(ws);

  function apply(m: number) {
    skyMat.uniforms.uGlow.value = m;
    sky.fog.color.copy(fog0).lerp(fog1, m);
    sky.fog.far = lerp(SKY_LOOK.fogFar[0], SKY_LOOK.fogFar[1], m);
    sky.hemi.intensity = lerp(SKY_LOOK.hemi[0], SKY_LOOK.hemi[1], m);
    sky.sun.intensity = lerp(SKY_LOOK.sun[0], SKY_LOOK.sun[1], m);
    uSway.value = lerp(1, MAGIC_SWAY, m);
    // the rainbow is the crystal's: it shows only over the magic the shards cannot give (they stop at 5 x SHARD_MAGIC)
    const shardsTop = QUESTS.length * SHARD_MAGIC;
    L.rainbowAlpha.value = THREE.MathUtils.clamp((m - shardsTop) / (1 - shardsTop), 0, 1);
    for (const [mat, gl] of glowing) mat.emissiveIntensity = lerp(gl.base, gl.full, m);
    for (const { obj, n } of counted) {
      const k = Math.round(lerp(n.base, n.full, m));
      if (obj instanceof THREE.InstancedMesh) obj.count = k; else obj.geometry.setDrawRange(0, k);
    }
    own.forEach((f, i) => { f.scale = THREE.MathUtils.clamp(m * MAGIC_BUTTERFLIES - i, 0, 1); });
  }
  apply(value);

  return {
    get value() { return value; },
    get target() { return forced ?? magicOf(ws); },
    update(dt) {
      const target = forced ?? magicOf(ws);
      value = Math.abs(target - value) < 0.002 ? target : lerp(value, target, damp(0.8, dt));
      apply(value);
    },
    set(v) {
      forced = v === null ? null : THREE.MathUtils.clamp(v, 0, 1);
      if (forced !== null) { value = forced; apply(value); }
    },
  };
}
