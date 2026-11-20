import * as THREE from 'three';
import type { TreeStage } from './tree-look';

/**
 * The pet's shadow in the hub (the lead's decision of 2026-11-20, reversible): the pet that walks after her casts its
 * shadow on the stages 1-3; on the fourth the Tree is so rich that a fawn drawn once more in the pass of the shadows
 * (+7 calls) takes the hub past its 80 draw calls, so there it casts none and a soft round spot lies under it instead
 * (one draw call, no shadow pass). Tied to the stage of the hub, not to the kind of pet.
 */
export const petCastsShadow = (stage: TreeStage): boolean => stage < 4;

/** m: the radius of the spot under the pet. */
export const BLOB_R = 0.45;

/** The spot under the pet: hidden until `place` gets a position (null hides it again). */
export function petBlob(scene: THREE.Scene): { mesh: THREE.Mesh; place(at: THREE.Vector3 | null): void } {
  const mesh = new THREE.Mesh(
    new THREE.CircleGeometry(BLOB_R, 16).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: '#1d2a14', transparent: true, opacity: 0.28, depthWrite: false }),
  );
  mesh.name = 'pet-blob'; mesh.visible = false; mesh.renderOrder = 1;
  scene.add(mesh);
  return {
    mesh,
    place(at) {
      mesh.visible = at !== null;
      if (at) mesh.position.set(at.x, at.y + 0.02, at.z);
    },
  };
}
