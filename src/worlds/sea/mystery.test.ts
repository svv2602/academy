// @vitest-environment happy-dom
/**
 * The places of the mysterious stars of the sea (./layout.ts MYSTERY_SPOTS, PLAY-24): enough and apart, on the floor
 * she swims over, off the ways, out of the castle, the ship, the grotto, the trench and the secrets' rocks, clear of the
 * residents, the finds and the floor's life; half of them behind a spire of rock from the way.
 */
import { describe, expect, it, vi } from 'vitest';
import { mysteryProblems } from '../../game/mystery';
import { hiddenFromPath, nearestOn } from '../../game/mystery-hide';
import { COLLECT, DAILY_PLACES } from './collect';
import { HIDE, SPIRE_WALL, spireOccluders } from './hiding';
import {
  CABIN, CASTLE, CORAL_NEST, EASEL, GROTTO, HALF, LANDMARKS, LIFT_ROCK, LOOKOUT, MYSTERY_HIDDEN, MYSTERY_OPEN, MYSTERY_ROCK, MYSTERY_ROCKS,
  MYSTERY_SPOTS, PATHS, SHIP, SPAWN, SQUARE_ARCH, TOWERS, ZONES,
} from './layout';
import { SIGHT, placeLife, sightLines } from './scenery';
import { shellsOf } from './secrets';
import { TRENCH_R, lineDist, pathDist } from './terrain';

vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));
const { BULCHIK, FRIENDS, sea: SEA } = await import('./index');

const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
const sh = shellsOf();
const BUSY = [...Object.values(LANDMARKS), CABIN, CORAL_NEST, SQUARE_ARCH, ...sh.at, sh.front, SPAWN, EASEL, BULCHIK, ...FRIENDS, ...TOWERS];
const FINDS = [...COLLECT.items, ...DAILY_PLACES];
const life = placeLife(), LIFE = [...life.corals, ...life.kelp, ...life.rocks, ...life.reef, ...life.anemones];
/** Out of the big things of the sea: each the same for a place and a spire. */
const away = (p: { x: number; z: number }) => [
  Math.hypot(p.x, p.z) > HALF - 8 && 'beyond the sea',
  Object.values(ZONES).some((z) => d(z, p) < 10) && 'in a zone',
  d(CASTLE, p) < CASTLE.ring + 6 && 'at the castle',
  d(SHIP, p) < SHIP.len / 2 + 4 && 'at the ship',
  d(GROTTO, p) < GROTTO.clear + 3 && 'at the grotto',
  d(ZONES.trench, p) < TRENCH_R + 3 && 'in the trench',
  d(LIFT_ROCK, p) < LIFT_ROCK.r + 5 && 'at the rock of the lift',
  d(LOOKOUT, p) < LOOKOUT.r + LOOKOUT.slope + 3 && 'on the lookout',
];

describe('the places of the mysterious stars of the sea', () => {
  it('are enough and apart, and the sea names them', () => {
    expect(mysteryProblems({ spots: MYSTERY_SPOTS })).toEqual([]);
    expect(MYSTERY_SPOTS).toHaveLength(24);
    expect(SEA.mystery?.spots).toBe(MYSTERY_SPOTS);
  });

  it('stand where she swims: off the ways, out of the castle, the ship, the grotto, the trench and the secrets\' rocks', () => {
    const bad = MYSTERY_SPOTS.flatMap((p, i) => [...away(p), pathDist(p.x, p.z) < 4 && 'on a way']
      .filter(Boolean).map((w) => `place ${i} (${p.x}, ${p.z}): ${w}`));
    expect(bad).toEqual([]);
  });

  it('nothing else stands there: no resident, no find, no coral, kelp or rock of the floor', () => {
    const bad = MYSTERY_SPOTS.flatMap((p, i) => [
      BUSY.some((b) => d(b, p) < 6) && 'at a resident or a thing of the sea',
      FINDS.some((f) => d(f, p) < 6) && 'at a find',
      LIFE.some((t) => d(t, p) < 1.2 + 1.2 * t.s) && 'in the floor\'s life',
    ].filter(Boolean).map((w) => `place ${i} (${p.x}, ${p.z}): ${w}`));
    expect(bad).toEqual([]);
  });

  it('half of them hidden: from the nearest point of a way the star is behind its spire, seen without it', () => {
    expect(MYSTERY_HIDDEN).toHaveLength(MYSTERY_SPOTS.length / 2);
    expect(MYSTERY_SPOTS).toEqual([...MYSTERY_HIDDEN, ...MYSTERY_OPEN]);
    expect(MYSTERY_HIDDEN.filter((p) => !hiddenFromPath(HIDE, p.x, p.z)).map((p) => `${p.x}, ${p.z}`)).toEqual([]);
    expect(MYSTERY_HIDDEN.filter((p) => hiddenFromPath(HIDE, p.x, p.z, []))).toEqual([]);
    MYSTERY_HIDDEN.forEach((p, i) => {
      expect(hiddenFromPath(HIDE, p.x, p.z, spireOccluders(MYSTERY_ROCKS[i])), `place ${i}`).toBe(true);
      const n = nearestOn(PATHS, p.x, p.z);
      expect(d(n, MYSTERY_ROCKS[i])).toBeLessThan(d(n, p));
    });
  });

  it('the other half in sight from the way, aside of it, where she has to swim', () => {
    expect(MYSTERY_OPEN.filter((p) => hiddenFromPath(HIDE, p.x, p.z)).map((p) => `${p.x}, ${p.z}`)).toEqual([]);
    expect(MYSTERY_OPEN.every((p) => pathDist(p.x, p.z) >= 5 && pathDist(p.x, p.z) <= 12)).toBe(true);
  });

  it('the spires: off the ways and the lines of sight, clear of the residents, the finds and the floor\'s life, each by its own place', () => {
    const r = 0.72 * MYSTERY_ROCK.w;
    const bad = MYSTERY_ROCKS.flatMap((b, i) => [...away(b),
      pathDist(b.x, b.z) < 3 + r && 'on a way',
      sightLines().some((l) => lineDist(l, b.x, b.z) < SIGHT + r) && 'in a line of sight of the route',
      BUSY.some((q) => d(q, b) < 4.8) && 'at a resident or a thing of the sea',
      FINDS.some((f) => d(f, b) < 4.8) && 'at a find',
      LIFE.some((t) => d(t, b) < 1.2 * t.s + r) && 'in the floor\'s life',
      MYSTERY_SPOTS.filter((s) => d(s, b) < r + 1.5).length !== 1 && 'not by exactly one place',
      d(MYSTERY_HIDDEN[i], b) - SPIRE_WALL < 0.6 && 'its wall over the star\'s place',
    ].filter(Boolean).map((w) => `spire ${i} (${b.x}, ${b.z}): ${w}`));
    expect(bad).toEqual([]);
    for (let i = 0; i < MYSTERY_ROCKS.length; i++) for (let k = i + 1; k < MYSTERY_ROCKS.length; k++) expect(d(MYSTERY_ROCKS[i], MYSTERY_ROCKS[k])).toBeGreaterThan(7);
  });
});
