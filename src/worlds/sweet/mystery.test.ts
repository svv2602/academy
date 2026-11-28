// @vitest-environment happy-dom
/**
 * The places of the mysterious stars of the Sweet Land (./layout.ts MYSTERY_SPOTS, PLAY-24): enough and apart, on
 * ground she walks, off the ways and the river, out of the cake, the mill, the carousel, the house, the cave and the
 * arch, clear of the residents, the finds and the sweets; half of them behind a mound of cream from the way.
 */
import { describe, expect, it, vi } from 'vitest';
import { mysteryProblems } from '../../game/mystery';
import { hiddenFromPath, nearestOn } from '../../game/mystery-hide';
import { COLLECT, DAILY_PLACES } from './collect';
import { HIDE, MOUND, MOUND_WALL, moundOccluders } from './hiding';
import {
  BRIDGE, CAKE, CANDY_BOX, CAROUSEL, CAVE, COTTON_CLOUD, EASEL, FOUNTAIN, GUM_MACHINE, HALF, HOUSE, HOUSE_DOOR, LANDMARKS, MILL, MILLSTONE,
  MYSTERY_HIDDEN, MYSTERY_OPEN, MYSTERY_ROCKS, MYSTERY_SPOTS, PATHS, RIVER_HALF, SCALES_AT, SHRINE, SPAWN, TREE_ARCH, ZONES,
} from './layout';
import { SIGHT, gardenTrees, placeSweets, sightLines, townHouses } from './scenery';
import { lineDist, pathDist, riverDist } from './terrain';
import { FROM_HUB } from './hub-way';

vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));
const { FRIENDS, sweet: SWEET } = await import('./index');

const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const BUSY = [...Object.values(LANDMARKS), SHRINE, MILLSTONE, EASEL, HOUSE_DOOR, SCALES_AT, CANDY_BOX, COTTON_CLOUD, FOUNTAIN, GUM_MACHINE, SPAWN, FROM_HUB, ...FRIENDS, ...townHouses(), ...gardenTrees()];
const FINDS = [...COLLECT.items, ...DAILY_PLACES];
const sw = placeSweets(), SWEETS = [...sw.lollipops, ...sw.candies];
const away = (p: { x: number; z: number }) => [
  Math.hypot(p.x, p.z) > HALF - 8 && 'beyond the land',
  Object.values(ZONES).some((z) => d(z, p) < 10) && 'in a zone',
  d(CAKE, p) < CAKE.tiers[0].r + 4 && 'at the cake',
  d(MILL, p) < MILL.wingR + 3 && 'at the mill',
  d(CAROUSEL, p) < CAROUSEL.r + 4 && 'at the carousel',
  d(HOUSE, p) < 5 && 'at Imbir\'s house',
  d(CAVE, p) < CAVE.r + 4 && 'at the cave',
  d(TREE_ARCH, p) < 7 && 'at the arch',
  d(BRIDGE, p) < BRIDGE.len / 2 + 4 && 'at the bridge',
  riverDist(p.x, p.z) < RIVER_HALF + 3 && 'in the river',
];

describe('the places of the mysterious stars of the Sweet Land', () => {
  it('are enough and apart, and the land names them', () => {
    expect(mysteryProblems({ spots: MYSTERY_SPOTS })).toEqual([]);
    expect(MYSTERY_SPOTS).toHaveLength(24);
    expect(SWEET.mystery?.spots).toBe(MYSTERY_SPOTS);
  });

  it('stand where she walks: off the ways and the river, out of the cake, the mill, the carousel, the house, the cave, the arch', () => {
    const bad = MYSTERY_SPOTS.flatMap((p, i) => [...away(p), pathDist(p.x, p.z) < 4 && 'on a way']
      .filter(Boolean).map((w) => `place ${i} (${p.x}, ${p.z}): ${w}`));
    expect(bad).toEqual([]);
  });

  it('nothing else stands there: no resident, no thing of the land, no find, no sweet', () => {
    const bad = MYSTERY_SPOTS.flatMap((p, i) => [
      BUSY.some((b) => d(b, p) < 6) && 'at a resident or a thing of the land',
      FINDS.some((f) => d(f, p) < 6) && 'at a find',
      SWEETS.some((t) => d(t, p) < 1.2 + 1.2 * t.s) && 'in a lollipop or a candy',
    ].filter(Boolean).map((w) => `place ${i} (${p.x}, ${p.z}): ${w}`));
    expect(bad).toEqual([]);
  });

  it('half of them hidden: from the nearest point of a way the star is behind its mound, seen without it', () => {
    expect(MYSTERY_HIDDEN).toHaveLength(MYSTERY_SPOTS.length / 2);
    expect(MYSTERY_SPOTS).toEqual([...MYSTERY_HIDDEN, ...MYSTERY_OPEN]);
    expect(MYSTERY_HIDDEN.filter((p) => !hiddenFromPath(HIDE, p.x, p.z)).map((p) => `${p.x}, ${p.z}`)).toEqual([]);
    expect(MYSTERY_HIDDEN.filter((p) => hiddenFromPath(HIDE, p.x, p.z, []))).toEqual([]);
    MYSTERY_HIDDEN.forEach((p, i) => {
      expect(hiddenFromPath(HIDE, p.x, p.z, moundOccluders(MYSTERY_ROCKS[i])), `place ${i}`).toBe(true);
      const n = nearestOn(PATHS, p.x, p.z);
      expect(d(n, MYSTERY_ROCKS[i])).toBeLessThan(d(n, p));
    });
  });

  it('the other half in sight from the way, aside of it, where she has to walk', () => {
    expect(MYSTERY_OPEN.filter((p) => hiddenFromPath(HIDE, p.x, p.z)).map((p) => `${p.x}, ${p.z}`)).toEqual([]);
    expect(MYSTERY_OPEN.every((p) => pathDist(p.x, p.z) >= 5 && pathDist(p.x, p.z) <= 12)).toBe(true);
  });

  it('the mounds: off the ways and the lines of sight, clear of the residents, the finds and the sweets, each by its own place', () => {
    const r = MOUND.r;
    const bad = MYSTERY_ROCKS.flatMap((b, i) => [...away(b),
      pathDist(b.x, b.z) < 2.5 + r && 'on a way',
      sightLines().some((l) => lineDist(l, b.x, b.z) < SIGHT + 1.5 + r) && 'in a line of sight of the route',
      BUSY.some((q) => d(q, b) < 4.8) && 'at a resident or a thing of the land',
      FINDS.some((f) => d(f, b) < 4.8) && 'at a find',
      SWEETS.some((t) => d(t, b) < 1.2 * t.s + r) && 'in the sweets',
      MYSTERY_SPOTS.filter((s) => d(s, b) < r + 1.5).length !== 1 && 'not by exactly one place',
      d(MYSTERY_HIDDEN[i], b) - MOUND_WALL < 0.6 && 'its wall over the star\'s place',
    ].filter(Boolean).map((w) => `mound ${i} (${b.x}, ${b.z}): ${w}`));
    expect(bad).toEqual([]);
    for (let i = 0; i < MYSTERY_ROCKS.length; i++) for (let k = i + 1; k < MYSTERY_ROCKS.length; k++) expect(d(MYSTERY_ROCKS[i], MYSTERY_ROCKS[k])).toBeGreaterThan(2 * r + 2);
  });
});
