// @vitest-environment happy-dom
/**
 * The way back to the Great Tree from the Sky Islands (./hub-way.ts): where she comes out of its arch from the hub, and
 * the world's `arrive` that puts her there.
 */
import { describe, expect, it } from 'vitest';
import { FACING, FROM_HUB, OUT, arriveFrom } from './hub-way';
import { ISLANDS, SPAWN, TREE_ARCH, ZONES } from './layout';
import { islandAt, pathDist } from './terrain';

describe('the arch of the Great Tree on the Sky Islands', () => {
  it('she comes out of it OUT m in front of the arch on the castle island, facing its middle', () => {
    expect(Math.hypot(FROM_HUB.x - TREE_ARCH.x, FROM_HUB.z - TREE_ARCH.z)).toBeCloseTo(OUT);
    expect(FROM_HUB.facing).toBe(FACING);
    const c = ZONES.castle;
    const toMiddle = Math.atan2(c.x - FROM_HUB.x, c.z - FROM_HUB.z);
    expect(Math.cos(toMiddle - FACING)).toBeGreaterThan(0.99);
    // on the castle island, by the spawn, inside its rail and off the bridges' middle lines
    expect(islandAt(FROM_HUB.x, FROM_HUB.z)).toBe('castle');
    expect(islandAt(TREE_ARCH.x, TREE_ARCH.z)).toBe('castle');
    expect(Math.hypot(FROM_HUB.x - SPAWN.x, FROM_HUB.z - SPAWN.z)).toBeLessThan(6);
    expect(Math.hypot(TREE_ARCH.x - c.x, TREE_ARCH.z - c.z)).toBeLessThan(ISLANDS.castle.r - 3);
    expect(pathDist(TREE_ARCH.x, TREE_ARCH.z)).toBeGreaterThan(4);
  });

  it('the world puts her there coming from the hub, at its spawn from anywhere else', () => {
    expect(arriveFrom('hub')).toEqual(FROM_HUB);
    expect(arriveFrom('fairy')).toBeNull();
    expect(arriveFrom('sweet')).toBeNull();
  });
});
