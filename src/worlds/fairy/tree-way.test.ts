// @vitest-environment happy-dom
/**
 * The way to the Great Tree in the first world (./tree-way.ts, WORLD-01): where the arch stands, where she comes out of
 * it from the hub, and whether she has been to the hub.
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../../core/save';
import { CHEST, HOUSE, SHOP_SIGN, SPAWN, TREE_WAY } from './layout';
import { FROM_HUB, HUB, OUT, hubVisited, treeCalls } from './tree-way';

describe('the way to the Great Tree', () => {
  it('the arch stands at the end of the path behind the spawn, clear of the shop sign, the house and the chest', () => {
    expect(TREE_WAY.z).toBeGreaterThan(SPAWN.z);
    for (const p of [SPAWN, SHOP_SIGN, HOUSE, CHEST]) expect(Math.hypot(p.x - TREE_WAY.x, p.z - TREE_WAY.z)).toBeGreaterThan(6);
  });

  it('back from the hub she comes out in front of the arch, facing the valley (-z), between it and the spawn', () => {
    expect(Math.hypot(FROM_HUB.x - TREE_WAY.x, FROM_HUB.z - TREE_WAY.z)).toBeCloseTo(OUT);
    // the camera behind her in a landscape window (camDist 6.2 at the pitch 0.36: 5.8 m back) stands in front of the arch
    expect(FROM_HUB.z + 6.2 * Math.cos(0.36)).toBeLessThan(TREE_WAY.z - 0.5);
    expect(FROM_HUB.z).toBeLessThan(TREE_WAY.z);
    expect(FROM_HUB.z).toBeGreaterThan(SPAWN.z);
    expect(Math.cos(FROM_HUB.facing!)).toBeCloseTo(-1);   // heading pi: facing -z
  });

  it('she has been to the hub once its part of the save exists; asking creates nothing', () => {
    const s: Save = defaultSave();
    expect(hubVisited(s)).toBe(false);
    expect(Object.keys(s.worlds)).toEqual([]);
    (s.worlds as Record<string, unknown>)[HUB] = { quests: {}, final: false, starsTaken: [], flags: {}, pos: null };
    expect(hubVisited(s)).toBe(true);
  });

  it('the Great Tree calls while the crystal is whole, the way open and the hub not visited; else the shared words', () => {
    const s: Save = defaultSave();
    expect(treeCalls({ final: true }, s, true)).toBe('tree_calls');
    expect(treeCalls({ final: false }, s, true)).toBeNull();
    expect(treeCalls({ final: true }, s, false)).toBeNull();   // the way hidden (TREE_WAY_OPEN false)
    (s.worlds as Record<string, unknown>)[HUB] = { quests: {}, final: false, starsTaken: [], flags: {}, pos: null };
    expect(treeCalls({ final: true }, s, true)).toBeNull();
  });
});

describe('the arch to the Great Tree: the hub\'s stone arch', () => {
  it('its veil faces the valley she comes up from, its posts stand across the path, the Great Tree on its keystone', async () => {
    const THREE = await import('three');
    const { archStoneMaterial, buildArch, crestTree } = await import('../hub/arch-look');
    const scene = new THREE.Scene(), posts: [number, number, number][] = [];
    const { group, veil, glow } = buildArch(scene, {
      x: TREE_WAY.x, z: TREE_WAY.z, facing: TREE_WAY.facing + Math.PI, colour: '#b6e88a', icon: '🌳', crest: crestTree(), open: true, seed: 4049, phase: 0,
    }, archStoneMaterial(), (x, z, r) => posts.push([x, z, r]));
    scene.updateMatrixWorld(true);
    const front = new THREE.Vector3(0, 0, 1).transformDirection(veil.matrixWorld);
    expect(front.z).toBeCloseTo(-1);            // toward the valley (-z), the side of the spawn
    expect(veil.visible).toBe(true);
    expect(glow).not.toBeNull();
    expect(posts.map(([x, z]) => [Math.round(x * 10) / 10, Math.round(z * 10) / 10]).sort((a, b) => a[0] - b[0])).toEqual([[-1.5, TREE_WAY.z], [1.5, TREE_WAY.z]]);
    expect(group.parent).toBe(scene);
  });
});
