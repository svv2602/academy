/** The cauldron by the Great Tree (./cauldron-look.ts, PLAY-26): where it stands, and drawn in the keepsakes' call. */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { defaultSave } from '../../core/save';
import { CAULDRON, cauldronGeometry } from './cauldron-look';
import { buildKeepsakes } from './keepsakes';
import { PORTALS, arrivalAt, trunkR } from './layout';
import { inPassage, placeGlade } from './glade-look';
import { STUMP, stumpAt, treeShape } from './tree-look';
import { HUB_FLYOVER } from './flyover-path';

describe('the cauldron by the roots', () => {
  it('off the passages, the spots she arrives at, the tips of the roots, the stump\'s ring, the bushes and rocks, the tour', () => {
    const { x, z, r } = CAULDRON;
    expect(Math.hypot(x, z)).toBeGreaterThan(trunkR(0) + 2);
    for (const a of PORTALS) expect(inPassage(a, x, z, r + 0.5)).toBe(false);
    for (const p of PORTALS) { const s = arrivalAt(p.shelf); expect(Math.hypot(x - s.x, z - s.z)).toBeGreaterThan(2.5); }
    for (const root of treeShape().roots) { const t = root[root.length - 1]; expect(Math.hypot(x - t.x, z - t.z)).toBeGreaterThan(1.2); }
    const st = stumpAt(); expect(Math.hypot(x - st.x, z - st.z)).toBeGreaterThan(STUMP.ring + 2);
    for (const c of placeGlade(PORTALS).colliders) expect(Math.hypot(x - c.x, z - c.z)).toBeGreaterThan(c.r + r + 0.3);
    for (const p of HUB_FLYOVER.points) if (p.pos[1] < 2.5) expect(Math.hypot(x - p.pos[0], z - p.pos[2])).toBeGreaterThan(1.5);
  });

  it('its shape stands on the ground at its place, a metre tall, its steam over it', () => {
    const box = new THREE.Box3().setFromBufferAttribute(cauldronGeometry().getAttribute('position') as THREE.BufferAttribute);
    expect(box.min.y).toBeGreaterThanOrEqual(-0.01);
    expect(box.max.y).toBeLessThan(2);   // the pot 1.1 m, its steam over it
    const c = box.getCenter(new THREE.Vector3());
    expect(Math.hypot(c.x - CAULDRON.x, c.z - CAULDRON.z)).toBeLessThan(0.2);
  });

  it('drawn with the keepsakes in one mesh - also when there are no keepsakes', () => {
    const scene = new THREE.Scene();
    const { mesh, list } = buildKeepsakes(scene, defaultSave(), [], [cauldronGeometry()]);
    expect(list).toEqual([]);
    expect(mesh).not.toBeNull();
    expect(scene.children.filter((o) => (o as THREE.Mesh).isMesh)).toHaveLength(1);
  });
});
