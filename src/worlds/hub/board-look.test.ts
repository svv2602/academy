/** The magic board by the Great Tree (./board-look.ts, src/game/trainer.ts): where it stands, and drawn in the nests' call. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BOARD, boardGeometry } from './board-look';
import { CAULDRON } from './cauldron-look';
import { buildNestLook } from './arch-look';
import { PORTALS, arrivalAt, trunkR } from './layout';
import { inPassage, placeGlade } from './glade-look';
import { STUMP, stumpAt, treeShape } from './tree-look';
import { HUB_FLYOVER } from './flyover-path';

describe('the magic board by the roots', () => {
  it('off the passages, the spots she arrives at, the tips of the roots, the stump\'s ring, the bushes and rocks, the tour, the cauldron', () => {
    const { x, z, r } = BOARD;
    expect(Math.hypot(x, z)).toBeGreaterThan(trunkR(0) + 2);
    for (const a of PORTALS) expect(inPassage(a, x, z, r + 0.5)).toBe(false);
    for (const p of PORTALS) { const s = arrivalAt(p.shelf); expect(Math.hypot(x - s.x, z - s.z)).toBeGreaterThan(2.5); }
    for (const root of treeShape().roots) { const t = root[root.length - 1]; expect(Math.hypot(x - t.x, z - t.z)).toBeGreaterThan(1.2); }
    const st = stumpAt(); expect(Math.hypot(x - st.x, z - st.z)).toBeGreaterThan(STUMP.ring + 2);
    for (const c of placeGlade(PORTALS).colliders) expect(Math.hypot(x - c.x, z - c.z)).toBeGreaterThan(c.r + r + 0.3);
    for (const p of HUB_FLYOVER.points) if (p.pos[1] < 2.5) expect(Math.hypot(x - p.pos[0], z - p.pos[2])).toBeGreaterThan(1.5);
    // the two action spots (2.2 m each) do not overlap: near one, the button is never the other's
    expect(Math.hypot(x - CAULDRON.x, z - CAULDRON.z)).toBeGreaterThan(2.2 * 2);
  });

  it('its shape stands on the ground at its place, under two metres, its slate turned away from the trunk', () => {
    const geo = boardGeometry();
    const box = new THREE.Box3().setFromBufferAttribute(geo.getAttribute('position') as THREE.BufferAttribute);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.05);
    expect(box.max.y).toBeLessThan(2);
    const c = box.getCenter(new THREE.Vector3());
    expect(Math.hypot(c.x - BOARD.x, c.z - BOARD.z)).toBeLessThan(0.5);
    const front = new THREE.Vector3(0, 0, 1).applyAxisAngle(new THREE.Vector3(0, 1, 0), BOARD.face);
    expect(front.dot(new THREE.Vector3(BOARD.x, 0, BOARD.z).normalize())).toBeGreaterThan(0.9);
  });

  it('drawn in the nests\' mesh: no draw call of its own', () => {
    const count = (extra: THREE.BufferGeometry[]) => {
      const scene = new THREE.Scene(), look = buildNestLook(scene, { crystal: new THREE.OctahedronGeometry(0.3, 0) }, extra);
      let meshes = 0;
      scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes++; });
      return { meshes, tris: look.nestMesh.geometry.getAttribute('position').count / 3 };
    };
    const without = count([]), withBoard = count([boardGeometry()]);
    expect(withBoard.meshes).toBe(without.meshes);
    expect(withBoard.tris).toBeGreaterThan(without.tris);
  });
});
