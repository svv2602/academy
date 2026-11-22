// @vitest-environment happy-dom
/**
 * The way back to the Great Tree from the forest (./hub-way.ts): where she comes out of its arch from the hub, and the
 * forest's `arrive` that puts her there.
 */
import { describe, expect, it } from 'vitest';
import { FACING, FROM_HUB, OUT, arriveFrom } from './hub-way';
import { LANDMARKS, SPAWN } from './layout';

describe('the arch of the Great Tree in the forest', () => {
  it('she comes out of it OUT m in front of the central glade\'s arch, facing the forest, toward the spawn', () => {
    const c = LANDMARKS.center;
    expect(Math.hypot(FROM_HUB.x - c.x, FROM_HUB.z - c.z)).toBeCloseTo(OUT);
    expect(FROM_HUB.facing).toBe(FACING);
    // out on the side of the spawn (the glade she knows), not behind the arch
    expect(Math.hypot(FROM_HUB.x - SPAWN.x, FROM_HUB.z - SPAWN.z)).toBeLessThan(Math.hypot(c.x - SPAWN.x, c.z - SPAWN.z));
  });

  it('the forest puts her there coming from the hub, at its spawn from anywhere else', () => {
    expect(arriveFrom('hub')).toEqual(FROM_HUB);
    expect(arriveFrom('fairy')).toBeNull();
  });
});
