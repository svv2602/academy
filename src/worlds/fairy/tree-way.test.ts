// @vitest-environment happy-dom
/**
 * The way to the Great Tree in the first world (./tree-way.ts, WORLD-01): where the arch stands, where she comes out of
 * it from the hub, and whether she has been to the hub.
 */
import { describe, expect, it } from 'vitest';
import { defaultSave, type Save } from '../../core/save';
import { CHEST, HOUSE, SHOP_SIGN, SPAWN, TREE_WAY } from './layout';
import { FROM_HUB, HUB, hubVisited } from './tree-way';

describe('the way to the Great Tree', () => {
  it('the arch stands at the end of the path behind the spawn, clear of the shop sign, the house and the chest', () => {
    expect(TREE_WAY.z).toBeGreaterThan(SPAWN.z);
    for (const p of [SPAWN, SHOP_SIGN, HOUSE, CHEST]) expect(Math.hypot(p.x - TREE_WAY.x, p.z - TREE_WAY.z)).toBeGreaterThan(6);
  });

  it('back from the hub she comes out in front of the arch, facing the valley (-z), between it and the spawn', () => {
    expect(Math.hypot(FROM_HUB.x - TREE_WAY.x, FROM_HUB.z - TREE_WAY.z)).toBeCloseTo(3);
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
});
