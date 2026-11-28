// @vitest-environment happy-dom
/**
 * The places of the mysterious stars of the sky (./layout.ts MYSTERY_SPOTS, PLAY-24): enough and apart, on the islands'
 * ground only (none on a bridge, at an edge, over the clouds or on the ledge), off the ways, clear of the buildings, the
 * residents, the finds, the trees and the bushes. Eight of them hidden, not half (the lead's word of 2026-11-28: the
 * islands have little ground - 8 is the most the search found with every rule kept, and 24 places make the days more
 * different than 20): from the nearest point of a way the star is behind a cloud bush or the observatory's tower.
 */
import { describe, expect, it, vi } from 'vitest';
import { mysteryProblems } from '../../game/mystery';
import { hiddenFromPath, nearestOn } from '../../game/mystery-hide';
import { COLLECT, DAILY_PLACES } from './collect';
import { BUILDINGS, BUSH_WALL, HIDE, bushOccluders } from './hiding';
import {
  CASTLE, CLOCK, CLOCK_AT, EASEL, GANGWAY, GEARS, ISLANDS, ISLET_GANGWAY, LANDING, LANDMARKS, MILL, MILLS, MYSTERY_HIDDEN, MYSTERY_OPEN,
  MYSTERY_ROCK, MYSTERY_ROCKS, MYSTERY_SPOTS, NOOKS, NOOK_ENDS, OBSERVATORY, PATHS, RAIL, RAY_ISLET, SHIP, SHIP_FAR, SHRINE, SPAWN, TREE_ARCH, WINDS_AT,
} from './layout';
import { SIGHT, placeTrees, sightLines } from './scenery';
import { islandAt, lineDist, nookAt, pathDist } from './terrain';
import { FROM_HUB } from './hub-way';

vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));
const { FRIENDS, sky: SKY } = await import('./index');

const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const BUSY = [...Object.values(LANDMARKS), SHRINE, CLOCK, CLOCK_AT, ...GEARS, GANGWAY, LANDING, SHIP_FAR, ISLET_GANGWAY, WINDS_AT, RAY_ISLET, EASEL, SPAWN, FROM_HUB, ...FRIENDS, ...NOOK_ENDS];
const FINDS = [...COLLECT.items, ...DAILY_PLACES];
const { trees, bushes } = placeTrees(), PLANTS = [...trees, ...bushes];
/** How far inside the ground of its island (or of the islet) a place stands, m: negative - past the edge. */
const inside = (p: { x: number; z: number }) => {
  const id = islandAt(p.x, p.z);
  if (id) return ISLANDS[id].r - RAIL - d(ISLANDS[id], p);
  return nookAt(p.x, p.z) === 'islet' ? NOOKS.islet.r - 0.8 - d(NOOKS.islet, p) : -1;
};
const away = (p: { x: number; z: number }) => [
  d(CASTLE, p) < CASTLE.r + 2 && 'at the castle',
  d(OBSERVATORY, p) < OBSERVATORY.r + 2 && 'at the observatory',
  MILLS.some((q) => d(q, p) < MILL.wingR + 1) && 'at a windmill',
  d(SHIP, p) < SHIP.len / 2 + 2 && 'at the airship',
  d(TREE_ARCH, p) < 5 && 'at the arch',
];

describe('the places of the mysterious stars of the sky', () => {
  it('are enough and apart, and the islands name them', () => {
    expect(mysteryProblems({ spots: MYSTERY_SPOTS })).toEqual([]);
    expect(MYSTERY_SPOTS).toHaveLength(24);
    expect(SKY.mystery?.spots).toBe(MYSTERY_SPOTS);
  });

  it('stand on the islands\' ground only, a step in from the edge; none on a bridge, over the clouds or on the ledge', () => {
    const bad = MYSTERY_SPOTS.flatMap((p, i) => [
      inside(p) < 1 && 'not a step inside an island',
      nookAt(p.x, p.z) === 'ledge' && 'on the ledge',
      pathDist(p.x, p.z) < 3.5 && 'on a way',
      ...away(p),
    ].filter(Boolean).map((w) => `place ${i} (${p.x}, ${p.z}): ${w}`));
    expect(bad).toEqual([]);
    // every island where she walks has some: none left out
    expect(new Set(MYSTERY_SPOTS.map((p) => islandAt(p.x, p.z) ?? nookAt(p.x, p.z))).size).toBeGreaterThanOrEqual(6);
  });

  it('nothing else stands there: no resident, no thing of the islands, no find, no tree or bush', () => {
    const bad = MYSTERY_SPOTS.flatMap((p, i) => [
      BUSY.some((b) => d(b, p) < 4.5) && 'at a resident or a thing of the islands',
      FINDS.some((f) => d(f, p) < 4) && 'at a find',
      PLANTS.some((t) => d(t, p) < 1.8) && 'at a tree or a bush',
    ].filter(Boolean).map((w) => `place ${i} (${p.x}, ${p.z}): ${w}`));
    expect(bad).toEqual([]);
  });

  it('eight of them hidden: from the nearest point of a way the star is behind its cloud bush or a building, seen without it', () => {
    expect(MYSTERY_HIDDEN.length).toBeGreaterThanOrEqual(8);
    expect(MYSTERY_SPOTS).toEqual([...MYSTERY_HIDDEN, ...MYSTERY_OPEN]);
    expect(MYSTERY_HIDDEN.filter((p) => !hiddenFromPath(HIDE, p.x, p.z)).map((p) => `${p.x}, ${p.z}`)).toEqual([]);
    expect(MYSTERY_HIDDEN.filter((p) => hiddenFromPath(HIDE, p.x, p.z, []))).toEqual([]);
    MYSTERY_HIDDEN.forEach((p, i) => {
      const by = i < MYSTERY_ROCKS.length ? bushOccluders(MYSTERY_ROCKS[i]) : BUILDINGS;
      expect(hiddenFromPath(HIDE, p.x, p.z, by), `place ${i}`).toBe(true);
      if (i < MYSTERY_ROCKS.length) { const n = nearestOn(PATHS, p.x, p.z); expect(d(n, MYSTERY_ROCKS[i])).toBeLessThan(d(n, p)); }
    });
  });

  it('the other sixteen in sight from the way', () => {
    expect(MYSTERY_OPEN).toHaveLength(16);
    expect(MYSTERY_OPEN.filter((p) => hiddenFromPath(HIDE, p.x, p.z)).map((p) => `${p.x}, ${p.z}`)).toEqual([]);
  });

  it('the cloud bushes: on an island, off the ways and the lines of sight, clear of the residents, the finds, the trees, each by its own place', () => {
    const r = 0.8 * MYSTERY_ROCK.w;
    const bad = MYSTERY_ROCKS.flatMap((b, i) => [...away(b),
      inside(b) < r + 0.5 && 'not inside an island',
      pathDist(b.x, b.z) < 0.6 + r && 'on a way',
      sightLines().some((l) => lineDist(l, b.x, b.z) < SIGHT) && 'in a line of sight of the route',
      BUSY.some((q) => d(q, b) < 3.6) && 'at a resident or a thing of the islands',
      FINDS.some((f) => d(f, b) < 3.2) && 'at a find',
      PLANTS.some((t) => d(t, b) < 1.2 + r) && 'at a tree or a bush',
      MYSTERY_SPOTS.filter((s) => d(s, b) < r + 1.5).length !== 1 && 'not by exactly one place',
      d(MYSTERY_HIDDEN[i], b) - BUSH_WALL < 0.6 && 'its wall over the star\'s place',
    ].filter(Boolean).map((w) => `bush ${i} (${b.x}, ${b.z}): ${w}`));
    expect(bad).toEqual([]);
    for (let i = 0; i < MYSTERY_ROCKS.length; i++) for (let k = i + 1; k < MYSTERY_ROCKS.length; k++) expect(d(MYSTERY_ROCKS[i], MYSTERY_ROCKS[k])).toBeGreaterThan(2 * MYSTERY_ROCK.w + 2);
  });
});
