/**
 * The check of the hidden places of the worlds after the first (./mystery-hide.ts) is the first world's own
 * (src/worlds/fairy/hiding.ts) over another world: handed the fairy world's path, relief and occluders, it says the same
 * for every place of the fairy world and for a grid across its valley.
 */
import { describe, expect, it } from 'vitest';
import { MYSTERY_STAR } from './mystery';
import { PATH_EYE, STAR_BODY, hiddenFromPath, nearestOn } from './mystery-hide';
import * as fairy from '../worlds/fairy/hiding';
import { MYSTERY_SPOTS } from '../worlds/fairy/layout';
import { height, nearestOnPath } from '../worlds/fairy/terrain';

/** The first world's path (its own, not exported, src/worlds/fairy/terrain.ts): the test of the nearest point proves the copy. */
const paths = [[[0, 16], [1, 5], [3.5, -5], [2, -13], [-4, -27], [-8, -42], [-8, -53]].map(([x, z]) => ({ x, z }))];
const W = { paths, height, occluders: fairy.occluders() };
const { model, scale, float, bob } = MYSTERY_STAR, low = float, high = float + model * scale + bob, half = (model * scale) / 2;

describe('the check of a hidden mysterious star (src/game/mystery-hide.ts)', () => {
  it('the star\'s body and the eye are the first world\'s', () => {
    expect(STAR_BODY).toEqual({ low, high, half });
    expect(PATH_EYE).toBe(fairy.PATH_EYE);
  });

  it('the nearest point of the paths is the first world\'s nearest point of its path', () => {
    for (let x = -60; x <= 60; x += 7.5) for (let z = -60; z <= 60; z += 7.5) {
      const a = nearestOn(paths, x, z), b = nearestOnPath(x, z);
      expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeLessThan(1e-9);
    }
  });

  it('says what the first world\'s own check says: its places and a grid of its valley', () => {
    const pts = [...MYSTERY_SPOTS];
    for (let x = -60; x <= 60; x += 5) for (let z = -60; z <= 60; z += 5) pts.push({ x, z });
    const differ = pts.filter(({ x, z }) => hiddenFromPath(W, x, z) !== fairy.hiddenFromPath(x, z, low, high, half));
    expect(differ).toEqual([]);
    expect(pts.filter(({ x, z }) => hiddenFromPath(W, x, z)).length).toBeGreaterThan(12);
    // and none is hidden with nothing to hide it
    expect(MYSTERY_SPOTS.filter(({ x, z }) => hiddenFromPath(W, x, z, []))).toEqual([]);
  });

  it('a world may name the point she looks from', () => {
    const from = () => ({ x: 0, z: 0 });
    expect(hiddenFromPath({ ...W, occluders: [{ x: 5, z: 0, r: 1, top: 20 }], from }, 10, 0)).toBe(true);
    expect(hiddenFromPath({ ...W, occluders: [{ x: 5, z: 0, r: 1, top: 20 }], from }, 0, 10)).toBe(false);
  });
});
