import * as THREE from 'three';
import { gltf, type Rig } from '../core/assets';
import type { Sparks } from './fx';

/** Where an item is worn on the heroine (PLAY-04, PLAY-05). Each slot holds one item or none. */
export type GearSlot = 'head' | 'wand' | 'wings' | 'trail';

/** The items of the first shop and of the looks, and the bone that carries each modelled one (shared ids of the shop, the save and the screen). */
export const GEAR = {
  wand_star: { slot: 'wand', bone: 'hand_r' },
  wand_crystal: { slot: 'wand', bone: 'hand_r' },
  wreath: { slot: 'head', bone: 'Head' },
  crown: { slot: 'head', bone: 'Head' },
  wizard_hat: { slot: 'head', bone: 'Head' },
  earrings_star: { slot: 'head', bone: 'Head' },
  // The things of the four looks (PLAY-06, src/game/looks.ts): simple, free versions, never sold.
  tiara: { slot: 'head', bone: 'Head' },
  wizard_cap: { slot: 'head', bone: 'Head' },
  elf_ears: { slot: 'head', bone: 'Head' },
  wand_flower: { slot: 'wand', bone: 'hand_r' },
  wand_moon: { slot: 'wand', bone: 'hand_r' },
  wand_leaf: { slot: 'wand', bone: 'hand_r' },
  wings_butterfly: { slot: 'wings', bone: 'spine_03' },
  /** The procedural petals the heroine always had (src/worlds/fairy/characters.ts): free, worn by default. */
  wings_petals: { slot: 'wings', bone: null },
  /** Sparkles behind the walking heroine, from the shared burst pool: no model, no draw call of its own. */
  trail_sparkle: { slot: 'trail', bone: null },
} as const satisfies Record<string, { slot: GearSlot; bone: string | null }>;

export type GearId = keyof typeof GEAR;
/** The items that have a model: public/models/items/<id>.glb, all loaded with the world (tools/models-used.json). */
export type ModelId = { [K in GearId]: (typeof GEAR)[K]['bone'] extends string ? K : never }[GearId];
export const MODEL_IDS = (Object.keys(GEAR) as GearId[]).filter((id) => GEAR[id].bone !== null) as ModelId[];

/** What the heroine wears when nothing has been chosen: the petals, nothing else (she looks as she always did). */
export const DEFAULT_GEAR: Readonly<Record<GearSlot, GearId | null>> = { head: null, wand: null, wings: 'wings_petals', trail: null };

/** A modelled item hung under its bone (hidden until worn), and that bone. */
export interface GearPart { readonly object: THREE.Object3D; readonly bone: THREE.Bone }
export type GearModels = Readonly<Record<ModelId, GearPart>>;

/**
 * Loads every modelled item and hangs it, hidden, under its bone of the heroine's model. tools/items/items.py models an
 * item in the rest-pose space of the unscaled model, so it goes under the bone with the inverse of the bone's rest
 * matrix taken in model space (not world space: the model is scaled to the heroine's height, src/game/hero.ts), and
 * then grows with the model. Call it while the model is in its rest pose: right after buildHero, before any clip plays.
 */
export async function loadGear(rig: Rig): Promise<GearModels> {
  const { model } = rig;
  const bones: Record<string, THREE.Bone> = {};
  model.traverse((o) => { if ((o as THREE.Bone).isBone) bones[o.name] = o as THREE.Bone; });
  const loaded = await Promise.all(MODEL_IDS.map((id) => gltf(`items/${id}`)));
  model.updateMatrixWorld(true);
  const toModel = model.matrixWorld.clone().invert();
  const parts = {} as Record<ModelId, GearPart>;
  MODEL_IDS.forEach((id, i) => {
    const bone = bones[GEAR[id].bone];
    const object = loaded[i].scene.clone();
    object.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.transparent) { mat.depthWrite = false; mat.side = THREE.DoubleSide; }
    });
    object.applyMatrix4(toModel.clone().multiply(bone.matrixWorld).invert());   // inverse rest matrix of the bone in model space
    object.visible = false;
    object.name = id;
    bone.add(object);
    parts[id] = { object, bone };
  });
  return parts;
}

export interface Gear {
  /** Wears `id` in `slot` (null takes the slot's item off). An id of another slot throws. */
  set(slot: GearSlot, id: GearId | null): void;
  get(slot: GearSlot): GearId | null;
  /** The colour of her wings (PLAY-05): the petals take it as it is, the butterfly keeps its pattern under a tint of it. */
  tint(color: string): void;
  /** The colour last given to tint (the walkthrough reads it). */
  readonly color: string;
  /** The modelled items as they hang on the heroine (window.__game reads them in the walkthrough). */
  readonly parts: GearModels;
  /** After the heroine has moved: the butterfly wings beat (fast in the air), the trail sparkles while she walks. */
  update(time: number, grounded: boolean): void;
}

/** What the water hides while she swims (R86): the wand would go into her face, the petals stand across her body. */
const wetHidden = (id: GearId | null) => id === 'wings_petals' || (id !== null && GEAR[id].slot === 'wand');

/**
 * The heroine's items (PLAY-04, PLAY-05): `petals` are her procedural wings, shown while `wings_petals` is worn;
 * the trail bursts a few sparkles at her feet into the shared pool `sparks`. `water` - she swims now (a world that
 * declares it, src/game/player.ts `swimming`): the wand and the petals stay worn but hidden, and show again as she
 * leaves the water. It is read as the gear is made and after every move (`update`).
 */
export function createGear(rig: Rig, parts: GearModels, petals: readonly THREE.Object3D[], sparks: Sparks, water: () => boolean = () => false): Gear {
  const worn: Record<GearSlot, GearId | null> = { ...DEFAULT_GEAR };
  let wet = water();
  const show = (id: GearId | null, on: boolean) => {
    const visible = on && !(wet && wetHidden(id));
    if (id === 'wings_petals') for (const p of petals) p.visible = visible;
    else if (id && id in parts) parts[id as ModelId].object.visible = visible;
  };
  for (const id of MODEL_IDS) parts[id].object.visible = false;
  show('wings_petals', true);

  const butterfly = ['wing_l', 'wing_r'].map((n, i) => ({ node: parts.wings_butterfly.object.getObjectByName(n)!, side: i ? -1 : 1 }));
  const last = new THREE.Vector3().copy(rig.root.position), at = new THREE.Vector3();
  let lastTime = -1, sinceSpark = 0, sparkN = 0;
  // The butterfly's own materials, each with its colour as modelled: a tint mixes the chosen colour into that one.
  const own: { mat: THREE.MeshStandardMaterial; base: THREE.Color }[] = [];
  parts.wings_butterfly.object.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    const mat = (m.material as THREE.MeshStandardMaterial).clone();
    m.material = mat;
    own.push({ mat, base: mat.color.clone() });
  });
  let color = '';

  return {
    parts,
    get: (slot) => worn[slot],
    get color() { return color; },
    tint(c) {
      color = c;
      const to = new THREE.Color(c);
      for (const p of petals) ((p as THREE.Mesh).material as THREE.MeshBasicMaterial).color.copy(to);
      for (const o of own) o.mat.color.copy(o.base).lerp(to, 0.5);
    },
    set(slot, id) {
      if (id !== null && GEAR[id]?.slot !== slot) throw new Error(`gear: ${id} is not worn in the slot "${slot}"`);
      show(worn[slot], false);
      worn[slot] = id;
      show(id, true);
    },
    update(time, grounded) {
      if (water() !== wet) { wet = !wet; for (const slot of ['wand', 'wings'] as const) show(worn[slot], true); }
      const dt = lastTime < 0 ? 0 : Math.min(0.1, time - lastTime);
      lastTime = time;
      if (worn.wings === 'wings_butterfly') {
        for (const w of butterfly) w.node.rotation.y = w.side * (0.15 + Math.sin(time * (grounded ? 4 : 18)) * 0.3);
      }
      const pos = rig.root.position, moved = Math.hypot(pos.x - last.x, pos.z - last.z);
      last.copy(pos);
      if (worn.trail !== 'trail_sparkle' || moved < 0.002) return;
      // A couple of sparkles every few hundredths of a second, just behind the feet: the trail lives in the shared pool.
      if ((sinceSpark += dt) < 0.06) return;
      sinceSpark = 0;
      at.set(pos.x + (Math.random() - 0.5) * 0.3, pos.y + 0.15, pos.z + (Math.random() - 0.5) * 0.3);
      sparks.burst(at, sparkN++ % 2 ? '#ffe066' : '#ff9ed2', 2, 0.7);
    },
  };
}
