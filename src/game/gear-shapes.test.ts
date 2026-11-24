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
  it('are the seven gifts, each a thing of the heroine or of a pet hung under a bone of the head (the owlet\'s and Bulchik\'s of the body)', () => {
    expect(Object.keys(BUILT).sort()).toEqual(['acorn_cap', 'bulchik_coral_necklace', 'fawn_leaf_bow', 'feather_crown', 'mushroom_hat', 'owlet_leaf_scarf', 'shell_tiara']);
    for (const id of ['acorn_cap', 'feather_crown', 'mushroom_hat', 'shell_tiara'] as const) { expect(GEAR[id]).toEqual({ slot: 'head', bone: 'Head' }); expect(MODEL_IDS).toContain(id); }
    expect(PET_GEAR.fawn_leaf_bow).toEqual({ pet: 'fawn', bone: 'Head' });
    expect(PET_GEAR.owlet_leaf_scarf).toEqual({ pet: 'owlet', bone: 'Body' });
    expect(PET_GEAR.bulchik_coral_necklace).toEqual({ pet: 'bulchik', bone: 'Body' });
    for (const id of ['fawn_leaf_bow', 'owlet_leaf_scarf', 'bulchik_coral_necklace'] as const) expect(PET_GEAR_IDS).toContain(id);
  });

  it('have no file: nothing for the budget of the core models (TECH-09)', () => {
    for (const id of ['acorn_cap', 'feather_crown', 'mushroom_hat', 'shell_tiara']) expect(existsSync(`public/models/items/${id}.glb`), id).toBe(false);
    for (const id of ['fawn_leaf_bow', 'owlet_leaf_scarf', 'bulchik_coral_necklace']) expect(existsSync(`public/models/pet_items/${id}.glb`), id).toBe(false);
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

  it('sit where a loaded thing of their wearer would (the model\'s axes, y up): on top of her head, by the fawn\'s ear, round the owlet\'s and Bulchik\'s necks', () => {
    const box = (id: string) => new THREE.Box3().setFromObject(BUILT[id]());
    for (const id of ['acorn_cap', 'feather_crown', 'mushroom_hat', 'shell_tiara']) {
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
    // the owlet's model (worlds-data/forest/models/forest/owlet.glb): y -0.97-0.95, x ±0.57, its Head bone at y 0.18;
    // the scarf round the neck, no wider than the owlet and a little, its end hanging in front (+z)
    const scarf = box('owlet_leaf_scarf');
    expect(scarf.min.y).toBeGreaterThan(-0.6);
    expect(scarf.max.y).toBeLessThan(0.25);
    expect(Math.max(-scarf.min.x, scarf.max.x)).toBeLessThan(0.7);
    expect(scarf.max.z).toBeGreaterThan(Math.abs(scarf.min.z));
    // Bulk's model (worlds-data/sea/models/sea/bulk.glb, Bulchik's): y 0-1.42, his neck the narrowest at y 0.5-0.56,
    // x ±0.23, z ±0.33, the head from y 0.7, the chest out to z 0.33 below; the necklace round it, under the head, its twig hanging in front (+z)
    const necklace = box('bulchik_coral_necklace');
    expect(necklace.min.y).toBeGreaterThan(0.3);
    expect(necklace.max.y).toBeLessThan(0.7);
    expect(Math.max(-necklace.min.x, necklace.max.x)).toBeLessThan(0.4);
    expect(necklace.min.x).toBeLessThan(-0.23);                       // wider than the neck: round it, not in it
    expect(necklace.max.x).toBeGreaterThan(0.23);
    expect(necklace.max.z).toBeGreaterThan(0.33);                     // past the front of the neck and the chest
    expect(necklace.max.z).toBeGreaterThan(Math.abs(necklace.min.z));
  });
});
