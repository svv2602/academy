// @vitest-environment happy-dom
/**
 * The way back to the Great Tree from the Sweet Land (./hub-way.ts): where she comes out of its arch from the hub, and
 * the world's `arrive` that puts her there.
 */
import { describe, expect, it } from 'vitest';
import { FACING, FROM_HUB, OUT, arriveFrom } from './hub-way';
import { HALF, SPAWN, TREE_ARCH, ZONES } from './layout';
import { pathDist } from './terrain';

describe('the arch of the Great Tree in the Sweet Land', () => {
  it('she comes out of it OUT m in front of the arch on the square, facing the square\'s middle', () => {
    expect(Math.hypot(FROM_HUB.x - TREE_ARCH.x, FROM_HUB.z - TREE_ARCH.z)).toBeCloseTo(OUT);
    expect(FROM_HUB.facing).toBe(FACING);
    const sq = ZONES.square;
    const toMiddle = Math.atan2(sq.x - FROM_HUB.x, sq.z - FROM_HUB.z);
    expect(Math.cos(toMiddle - FACING)).toBeGreaterThan(0.99);
    // nearer the square than the arch, by the spawn, inside the map and off the ways that meet on the square
    expect(Math.hypot(FROM_HUB.x - sq.x, FROM_HUB.z - sq.z)).toBeLessThan(Math.hypot(TREE_ARCH.x - sq.x, TREE_ARCH.z - sq.z));
    expect(Math.hypot(FROM_HUB.x - SPAWN.x, FROM_HUB.z - SPAWN.z)).toBeLessThan(6);
    expect(Math.hypot(TREE_ARCH.x, TREE_ARCH.z)).toBeLessThan(HALF - 4);
    expect(pathDist(TREE_ARCH.x, TREE_ARCH.z)).toBeGreaterThan(4);
  });

  it('the world puts her there coming from the hub, at its spawn from anywhere else', () => {
    expect(arriveFrom('hub')).toEqual(FROM_HUB);
    expect(arriveFrom('fairy')).toBeNull();
    expect(arriveFrom('sea')).toBeNull();
  });
});
