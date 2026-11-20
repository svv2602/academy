/**
 * The keepsakes of the Great Tree (./keepsakes.ts): read from the worlds' own parts of the save, whole or not at all,
 * at most seven a world; the fairy world's seven sit by its nest, on the bark and not in it, and stay in their budget.
 */
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { Save } from '../../core/save';
import type { ArtifactWorld } from '../../game/artifacts';
import { itemsOf } from '../../game/collections';
import { COLLECT } from '../fairy/collect';
import { KEEPSAKES_PER_WORLD, KEEPSAKE_BUDGET, keepsakeGeometry, keepsakesOf, type Keepsake } from './keepsakes';
import { NESTS } from './layout';
import { barkRadius, treeHollow } from './tree-look';

const FAIRY: ArtifactWorld = { id: 'fairy', shelf: 0, secrets: ['chest', 'glade', 'house'], collect: COLLECT };
const WORLDS: readonly ArtifactWorld[] = [FAIRY, { id: 'hub' }];
const saveOf = (worlds: Record<string, unknown>) => ({ worlds } as unknown as Save);
const ALL: Keepsake[] = [
  ...['chest', 'glade', 'house'].map((s) => ({ world: 'fairy', id: `secret:${s}` })),
  ...['mushroom', 'acorn', 'feather', 'butterfly'].map((k) => ({ world: 'fairy', id: `set:${k}` })),
];
const triangles = (g: THREE.BufferGeometry) => g.getAttribute('position').count / 3;

describe('which keepsakes the Tree shows', () => {
  it('none for a new save, and the save is not touched', () => {
    const save = saveOf({});
    expect(keepsakesOf(save, WORLDS)).toEqual([]);
    expect(save.worlds).toEqual({});
  });

  it('a secret found and a set gathered whole; a set of five of six gives nothing', () => {
    const acorns = itemsOf(COLLECT, 'acorn'), feathers = itemsOf(COLLECT, 'feather');
    const save = saveOf({ fairy: { flags: { glade: true, chest: false }, found: [...acorns, ...feathers.slice(0, 5)] } });
    expect(keepsakesOf(save, WORLDS).map((k) => k.id)).toEqual(['secret:glade', 'set:acorn']);
  });

  it('a broken part of the save gives nothing and breaks nothing', () => {
    expect(keepsakesOf(saveOf({ fairy: 'x' }), WORLDS)).toEqual([]);
    expect(keepsakesOf(saveOf({ fairy: { flags: null, found: 'x' } }), WORLDS)).toEqual([]);
  });

  it(`at most ${KEEPSAKES_PER_WORLD} a world; a world off the shelf gives none`, () => {
    const many: ArtifactWorld = { id: 'w', shelf: 1, secrets: Array.from({ length: 9 }, (_, i) => `s${i}`) };
    const flags = Object.fromEntries(many.secrets!.map((s) => [s, true]));
    const save = saveOf({ w: { flags }, hub: { flags } });
    expect(keepsakesOf(save, [many, { id: 'hub', secrets: many.secrets }])).toHaveLength(KEEPSAKES_PER_WORLD);
  });

  it('the whole fairy world: its seven', () => {
    const found = COLLECT.items.map((_, i) => i);
    const save = saveOf({ fairy: { flags: { chest: true, glade: true, house: true }, found } });
    expect(keepsakesOf(save, WORLDS)).toHaveLength(7);
  });
});

describe('how they hang on the Tree', () => {
  it(`the fairy world's seven: one piece within ${KEEPSAKE_BUDGET.triangles} triangles`, () => {
    const g = keepsakeGeometry(ALL, WORLDS)!;
    expect(triangles(g)).toBeLessThanOrEqual(KEEPSAKE_BUDGET.triangles);
    expect(g.getAttribute('color')).toBeTruthy();
  });

  it('each shows something of its own, and nothing for none', () => {
    expect(keepsakeGeometry([], WORLDS)).toBeNull();
    const sizes = ALL.map((k) => triangles(keepsakeGeometry([k], WORLDS)!));
    for (const s of sizes) expect(s).toBeGreaterThan(8);
  });

  it('each but the music box (in the hollow) has nothing in the bark, near the nest of its world, over the ground', () => {
    const nest = NESTS[0], hollow = treeHollow();
    for (const k of ALL) {
      const box = new THREE.Box3().setFromBufferAttribute(keepsakeGeometry([k], WORLDS)!.getAttribute('position') as THREE.BufferAttribute);
      const c = box.getCenter(new THREE.Vector3()), a = Math.atan2(c.x, c.z);
      expect(box.min.y, k.id).toBeGreaterThan(0.3);
      if (k.id === 'secret:house') {
        expect(Math.abs(Math.atan2(Math.sin(a - hollow.a), Math.cos(a - hollow.a))), k.id).toBeLessThan(0.15);
        expect(Math.abs(c.y - (hollow.y - hollow.h)), k.id).toBeLessThan(0.4);
        continue;
      }
      // no vertex deeper than 0.1 m in the bark (the shelf mushrooms sit in it a little), the middle by the nest
      const pos = keepsakeGeometry([k], WORLDS)!.getAttribute('position');
      let deepest = Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
        deepest = Math.min(deepest, Math.hypot(x, z) - barkRadius(y, Math.atan2(x, z)));
      }
      expect(deepest, k.id).toBeGreaterThan(-0.1);
      if (k.id === 'secret:chest') { expect(Math.abs(c.y - (nest.y - 1.2)), k.id).toBeLessThan(0.3); continue; }   // round the trunk
      const gap = a - nest.a;
      expect(Math.abs(Math.atan2(Math.sin(gap), Math.cos(gap))), k.id).toBeLessThan(1.3);
      expect(Math.abs(c.y - nest.y), k.id).toBeLessThan(2.6);
    }
  });

  it('a keepsake of a world not drawn yet: a bead by that world\'s nest', () => {
    const w: ArtifactWorld = { id: 'w', shelf: 2 };
    const g = keepsakeGeometry([{ world: 'w', id: 'secret:x' }], [w])!;
    const c = new THREE.Box3().setFromBufferAttribute(g.getAttribute('position') as THREE.BufferAttribute).getCenter(new THREE.Vector3());
    const gap = Math.atan2(c.x, c.z) - NESTS[2].a;
    expect(Math.abs(Math.atan2(Math.sin(gap), Math.cos(gap)))).toBeLessThan(0.8);
  });
});
