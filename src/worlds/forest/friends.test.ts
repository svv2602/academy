// @vitest-environment happy-dom
/**
 * Where the forest's characters stand, at their size (./index.ts FIGURE; the customer's word of 2026-11-24: the
 * squirrel, the hedgehog and the owl made bigger): each body keeps off the walkway of the paths, out of the maze's hedge,
 * clear of the trees and of the gnomes' houses - a bigger character must not stand in her way or in a wall - and no
 * plant grows round it (a fern hid the hedgehog from her camera).
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));
import { HERO_TOP } from '../../game/hero';
import { FIGURE, FRIEND_CLEAR, FRIENDS } from './index';
import { inMaze } from './layout';
import { placeTrees, villageHouses } from './scenery';
import { pathDist } from './terrain';
import { FIND_CLEAR, placePlants } from './undergrowth';

/** m each side of a path's line that stays free to walk (its sand reaches a little further, ./decor.ts keeps 1.2). */
const WALKWAY = 1.0;
/** m between a body and a tree's trunk, a house's stem (its collider, ./scenery.ts: 1.4) and the maze's hedge. */
const ROOM = 0.5, HOUSE_R = 1.4;

const bodies = FRIENDS.filter((f) => FIGURE[f.id].h > 0).map((f) => ({ ...f, ...FIGURE[f.id] }));

describe('the forest\'s characters where they stand (the sizes of 2026-11-24)', () => {
  it('are as tall as agreed against the heroine: the squirrel 0.80, the hedgehog 0.65, the owl 1.00, the gnome 1.10 m', () => {
    expect(Object.fromEntries(bodies.map((b) => [b.id, b.h]))).toEqual({ borovik: 1.1, mudrena: 1.0, shustrik: 0.8, kolyuchka: 0.65 });
    for (const b of bodies) expect(b.h, b.id).toBeLessThan(HERO_TOP);
  });

  it('keep their bodies off the walkway of the paths', () => {
    for (const b of bodies) expect(pathDist(b.x, b.z) - b.r, `${b.id} at ${b.x.toFixed(1)}, ${b.z.toFixed(1)}`).toBeGreaterThanOrEqual(WALKWAY);
  });

  it('stand out of the maze\'s hedge, clear of the trees and of the houses', () => {
    const { trees } = placeTrees(), houses = villageHouses();
    for (const b of bodies) {
      const near = (ps: readonly { x: number; z: number }[]) => Math.min(...ps.map((p) => Math.hypot(p.x - b.x, p.z - b.z)));
      expect(inMaze(b.x, b.z, b.r + ROOM), `${b.id} in the maze's hedge`).toBe(false);
      expect(near(trees) - b.r, `${b.id} by a tree`).toBeGreaterThan(ROOM + 1);
      expect(near(houses) - b.r, `${b.id} by a house`).toBeGreaterThan(HOUSE_R + ROOM);
    }
  });

  it('have no plant round them: their bodies and the largest bush clear', () => {
    const clear = FRIEND_CLEAR(), plants = placePlants(undefined, clear);
    for (const b of bodies) {
      const c = clear.find((x) => x.x === b.x && x.z === b.z)!;
      expect(c.r, b.id).toBe(b.r + FIND_CLEAR);
      expect(plants.filter((p) => Math.hypot(p.x - b.x, p.z - b.z) <= c.r), b.id).toEqual([]);
    }
  });
});
