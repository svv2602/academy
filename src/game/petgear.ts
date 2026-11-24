/**
 * The things of the pets (decision of 2026-11-20): the cat's, the fawn's, the owlet's and Bulchik's, modelled by tools/items/pet_items.py in the
 * rest-pose space of each pet's own unscaled model, each under a bone of it. They are loaded with the pets (the shared
 * load, src/game/boot.ts), while the models still stand in their rest pose, and hung hidden under their bones with the
 * inverse of the bone's rest matrix in model space - as the heroine's things (src/game/gear.ts) - so they grow with the
 * model's scale and move with its bones. One thing of a pet is shown at a time.
 */
import * as THREE from 'three';
import { gltf, type Rig } from '../core/assets';
import type { PetWearer } from './shop';
import { BUILT } from './gear-shapes';

export type { PetWearer };

/** Every thing: its pet and the bone it hangs under (printed by tools/items/pet_items.py). */
export const PET_GEAR = {
  cat_collar: { pet: 'cat', bone: 'neck1' },
  cat_bow: { pet: 'cat', bone: 'head' },
  cat_hat: { pet: 'cat', bone: 'head' },
  cat_gold_bell: { pet: 'cat', bone: 'neck1' },
  fawn_wreath: { pet: 'fawn', bone: 'Head' },
  fawn_ribbon: { pet: 'fawn', bone: 'Neck2' },
  fawn_bell: { pet: 'fawn', bone: 'Neck2' },
  fawn_star_crown: { pet: 'fawn', bone: 'Head' },
  fawn_leaf_bow: { pet: 'fawn', bone: 'Head' },
  // the owlet's (a model of the forest's files): round its neck, on its body - the head turns inside it
  owlet_leaf_scarf: { pet: 'owlet', bone: 'Body' },
  // Bulchik's (a model of the sea's files, Bulk's): round his neck, on his body - the head turns over it
  bulchik_coral_necklace: { pet: 'bulchik', bone: 'Body' },
} as const satisfies Record<string, { pet: PetWearer; bone: string }>;
export type PetGearId = keyof typeof PET_GEAR;
export const PET_GEAR_IDS = Object.keys(PET_GEAR) as PetGearId[];

/** The things hung on the pets, hidden; a pet whose model is missing has none of its things. */
export type PetGearModels = Partial<Record<PetGearId, THREE.Object3D>>;

/**
 * Loads every thing and hangs it, hidden, under its bone of its pet's model. Call it while the models are in their
 * rest pose: right after they are loaded, before any clip plays.
 */
export async function loadPetGear(rigs: Partial<Record<PetWearer, Rig>>): Promise<PetGearModels> {
  const ids = PET_GEAR_IDS.filter((id) => rigs[PET_GEAR[id].pet]);
  // a thing built by code (./gear-shapes.ts) has no file
  const loaded = await Promise.all(ids.map((id) => (BUILT[id] ? null : gltf(`pet_items/${id}`))));
  const out: PetGearModels = {};
  ids.forEach((id, i) => {
    const { model } = rigs[PET_GEAR[id].pet]!;
    let bone: THREE.Object3D | undefined;
    model.traverse((o) => { if ((o as THREE.Bone).isBone && o.name === PET_GEAR[id].bone) bone = o; });
    if (!bone) throw new Error(`the bone "${PET_GEAR[id].bone}" of ${id} is not in the model of the ${PET_GEAR[id].pet}`);
    model.updateMatrixWorld(true);
    const toModel = model.matrixWorld.clone().invert();
    const object = BUILT[id]?.() ?? loaded[i]!.scene.clone();
    object.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).castShadow = true; });
    object.applyMatrix4(toModel.multiply(bone.matrixWorld).invert());   // inverse rest matrix of the bone in model space
    object.visible = false;
    object.name = id;
    bone.add(object);
    out[id] = object;
  });
  return out;
}

/** The things hung on the models a world loads itself (`hangOwnGear`), and what each pet wears now (`wearPetGear`). */
const ownParts = new Set<PetGearModels>();
const worn: Partial<Record<PetWearer, PetGearId | null>> = {};
const show = (parts: PetGearModels, pet: PetWearer, id: PetGearId | null) => {
  for (const k of PET_GEAR_IDS) if (PET_GEAR[k].pet === pet && parts[k]) parts[k]!.visible = k === id;
};

/** Shows `id` on its pet (null: none) and hides the pet's other things - on the shared models and on a world's own. */
export function wearPetGear(parts: PetGearModels, pet: PetWearer, id: PetGearId | null): void {
  worn[pet] = id;
  for (const p of [parts, ...ownParts]) show(p, pet, id);
}

/**
 * Hangs the things of a pet whose model a world loads itself (the owlet, src/game/pets.ts `loadOwnPets`) on that model,
 * the one it wears now shown; returns the undo (the world's end forgets the model). A pet that wears nothing, or a model
 * without the bone of a thing: nothing hung, no error - the pet comes without its things.
 */
export async function hangOwnGear(pet: string, rig: Rig): Promise<() => void> {
  if (!PET_GEAR_IDS.some((k) => PET_GEAR[k].pet === pet)) return () => {};
  const parts = await loadPetGear({ [pet]: rig }).catch((e: unknown) => { console.warn(`the things of the ${pet} are not hung:`, e); return null; });
  if (!parts) return () => {};
  ownParts.add(parts);
  show(parts, pet as PetWearer, worn[pet as PetWearer] ?? null);
  return () => { ownParts.delete(parts); };
}
