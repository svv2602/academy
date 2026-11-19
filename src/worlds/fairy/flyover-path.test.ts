import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../core/util';
import type { Vec3 } from '../../game/flyover';
import { FAIRY_FLYOVER } from './flyover-path';
import { placeTrees, type TreeSpot } from './scenery';
import { height } from './terrain';

/**
 * WORLD-10: the camera of every point of the tour sees what it looks at. A crown is taken as an upright cylinder of
 * radius 0.35 of the tree's height, from 0.3 of its height to its top; the trees are the scenery's (its seed, scenery.ts).
 */
const inCrown = (t: TreeSpot, x: number, y: number, z: number) => {
  const g = height(t.x, t.z);
  return Math.hypot(x - t.x, z - t.z) < 0.35 * t.h && y > g + 0.3 * t.h && y < g + t.h;
};
/** The trees whose crown holds the camera or stands between it and the last 2 m before what it looks at. */
function blocking(trees: readonly TreeSpot[], pos: Vec3, look: Vec3): TreeSpot[] {
  const len = Math.hypot(look[0] - pos[0], look[1] - pos[1], look[2] - pos[2]);
  const out = new Set<TreeSpot>();
  for (let d = 0; d <= len - 2; d += 0.25) {
    const k = d / len, x = pos[0] + (look[0] - pos[0]) * k, y = pos[1] + (look[1] - pos[1]) * k, z = pos[2] + (look[2] - pos[2]) * k;
    for (const t of trees) if (inCrown(t, x, y, z)) out.add(t);
  }
  return [...out];
}

describe('the tour of the fairy world and the trees (WORLD-10)', () => {
  for (const [what, density] of [['the phone', 0.75], ['the computer', 1]] as const) {
    it(`no crown stands in the way of the camera of any point (${what})`, () => {
      const { placed, grove } = placeTrees(mulberry32(2024), density);
      const trees = [...placed, ...grove];
      const bad = FAIRY_FLYOVER.points.flatMap((p, i) => blocking(trees, p.pos, p.look)
        .map((t) => `point ${i + 1}: a tree of ${t.h.toFixed(1)} m at ${t.x.toFixed(1)}, ${t.z.toFixed(1)}`));
      expect(bad).toEqual([]);
    });
  }
});
