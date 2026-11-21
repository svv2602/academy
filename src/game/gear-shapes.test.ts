/** The things built by code (./gear-shapes.ts): no file, the style's materials, as light as the loaded things. */
import { existsSync } from 'node:fs';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { BUILT } from './gear-shapes';
import { GEAR, MODEL_IDS } from './gear';
import { PET_GEAR, PET_GEAR_IDS } from './petgear';

const tris = (o: THREE.Object3D) => {
  let n = 0;
  o.traverse((m) => { const g = (m as THREE.Mesh).geometry; if (g) n += (g.index ? g.index.count : g.attributes.position.count) / 3; });
  return n;
};

describe('the things built by code (the gifts of a trade, PLAY-28)', () => {
  it('are the three gifts, each a thing of the heroine or of a pet hung under a bone of the head', () => {
    expect(Object.keys(BUILT).sort()).toEqual(['acorn_cap', 'fawn_leaf_bow', 'feather_crown']);
    for (const id of ['acorn_cap', 'feather_crown'] as const) { expect(GEAR[id]).toEqual({ slot: 'head', bone: 'Head' }); expect(MODEL_IDS).toContain(id); }
    expect(PET_GEAR.fawn_leaf_bow).toEqual({ pet: 'fawn', bone: 'Head' });
    expect(PET_GEAR_IDS).toContain('fawn_leaf_bow');
  });

  it('have no file: nothing for the budget of the core models (TECH-09)', () => {
    for (const p of ['public/models/items/acorn_cap.glb', 'public/models/items/feather_crown.glb', 'public/models/pet_items/fawn_leaf_bow.glb']) expect(existsSync(p), p).toBe(false);
  });

  it('are a mesh a material, of the style\'s materials, casting a shadow, under 1000 triangles', () => {
    for (const [id, build] of Object.entries(BUILT)) {
      const g = build(), meshes = g.children as THREE.Mesh[];
      expect(g.name).toBe(id);
      expect(new Set(meshes.map((m) => m.material)).size, id).toBe(meshes.length);
      for (const m of meshes) {
        expect((m.material as THREE.Material).name, id).toMatch(/^style:/);
        expect(m.castShadow).toBe(true);
      }
      expect(tris(g), id).toBeGreaterThan(50);
      expect(tris(g), id).toBeLessThan(1000);
    }
  });

  it('sit where a loaded thing of their wearer would (the model\'s axes, y up): on top of her head, by the fawn\'s ear', () => {
    const box = (id: string) => new THREE.Box3().setFromObject(BUILT[id]());
    for (const id of ['acorn_cap', 'feather_crown']) {
      const b = box(id);
      // the heroine's unscaled model: the head with its hair y 0.67-1.20, x ±0.31 (tools/items/items.py)
      expect(b.min.y, id).toBeGreaterThan(0.85);
      expect(b.max.y, id).toBeLessThan(1.45);
      expect(Math.max(-b.min.x, b.max.x), id).toBeLessThan(0.4);
    }
    const bow = box('fawn_leaf_bow');
    // the fawn's model: the top of its head z ~4.1 in Blender's axes, the face to -y there (to +z here)
    expect(bow.min.y).toBeGreaterThan(3.8);
    expect(bow.max.y).toBeLessThan(4.3);
    expect(bow.min.z).toBeGreaterThan(1.6);
  });
});
