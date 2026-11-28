// @vitest-environment happy-dom
/**
 * The places of the mysterious stars of the forest (./layout.ts MYSTERY_SPOTS, PLAY-24): enough and apart, on ground she
 * walks, off the paths, the stream, the maze, the residents, the secrets, the finds and the places of Season 2; half of
 * them behind a boulder from the path; none near the heaviest looks of the forest (TECH-06).
 */
import * as THREE from 'three';
import { describe, expect, it, vi } from 'vitest';
import { MYSTERY_COUNT, mysteryProblems } from '../../game/mystery';
import { hiddenFromPath, nearestOn } from '../../game/mystery-hide';
import { COLLECT, DAILY_PLACES } from './collect';
import { ROCK_COLOR, lanternSpots, rockGeo } from './decor';
import { BIG_MUSHROOMS, EN_GIVEN, EN_PLACES } from './en-places';
import { HIDE, ROCK_WALL, rockOccluder } from './hiding';
import {
  ALTAR, ARRIVAL, EASEL, HALF, HOLLOW, LANDMARKS, MAZE_END, MAZE_IN, MYSTERY_HIDDEN, MYSTERY_OPEN, MYSTERY_ROCK, MYSTERY_ROCKS,
  MYSTERY_SHOW_R, MYSTERY_SPOTS, OWL_TREE, PATHS, SECRET_CLEARINGS, SPAWN, STREAM_HALF, ZONES, inMaze,
} from './layout';
import { bridges, placeTrees, villageHouses } from './scenery';
import { pathDist, streamDist } from './terrain';
import { placePlants } from './undergrowth';

vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));
const { BYSTANDERS, FRIENDS, OWLET_HEAP, forest: FOREST } = await import('./index');

const d = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
/** The residents, the things of the forest with a place of their own. */
const BUSY = [...Object.values(LANDMARKS), MAZE_IN, MAZE_END, HOLLOW, ALTAR, OWL_TREE, EASEL, SPAWN, ARRIVAL, OWLET_HEAP, ...FRIENDS, ...BYSTANDERS, ...villageHouses()];
/**
 * The places of Season 2 in the forest besides the big mushrooms (part G, Pip and his notes, not in dev yet - their
 * numbers as its author gave them on 2026-11-28): kept 4 m clear.
 */
const SEASON2 = [{ x: 35.3, z: -6.7 }, { x: 37, z: -11.5 }, { x: -32.3, z: -19.8 }, { x: 42, z: 16 }, { x: -29.5, z: -53 }, { x: -40.2, z: -54.3 }, { x: -30, z: 45.5 }];
/** Where the forest's frame is the heaviest (TECH-06): the central glade, the village and its houses, the Owl glade (its look to the village). */
const HEAVY = [ZONES.center, ZONES.village, ZONES.owl, ...villageHouses()];

describe('the places of the mysterious stars of the forest', () => {
  it('are enough and apart, and the forest names them with its showR', () => {
    expect(mysteryProblems({ spots: MYSTERY_SPOTS })).toEqual([]);
    expect(MYSTERY_SPOTS).toHaveLength(24);
    expect(FOREST.mystery).toEqual({ spots: MYSTERY_SPOTS, showR: MYSTERY_SHOW_R });
  });

  it('stand where she walks: in the forest, off the paths and the stream, out of the maze, the zones, the secrets', () => {
    const bad = MYSTERY_SPOTS.flatMap((p, i) => [
      Math.hypot(p.x, p.z) > HALF - 8 && 'beyond the forest',
      pathDist(p.x, p.z) < 4 && 'on a path',
      streamDist(p.x, p.z) < STREAM_HALF + 3 && 'in the stream',
      inMaze(p.x, p.z, 4) && 'in the maze',
      Object.values(ZONES).some((z) => d(z, p) < 10) && 'in a zone',
      SECRET_CLEARINGS.some((c) => d(c, p) < c.clear + 4) && 'at a secret',
      bridges().some((b) => d(b, p) < 6) && 'at a bridge',
      lanternSpots().some((l) => d(l, p) < 2.5) && 'at a lantern',
    ].filter(Boolean).map((w) => `place ${i} (${p.x}, ${p.z}): ${w}`));
    expect(bad).toEqual([]);
  });

  it('nothing else stands there: no trunk, no resident, no find, no place of Season 2', () => {
    const { trees } = placeTrees();
    const bad = MYSTERY_SPOTS.flatMap((p, i) => [
      trees.some((t) => d(t, p) < 1.8) && 'at a trunk',
      BUSY.some((b) => d(b, p) < 6) && 'at a resident or a thing of the forest',
      [...COLLECT.items, ...DAILY_PLACES].some((f) => d(f, p) < 6) && 'at a find',
      [...EN_PLACES, ...BIG_MUSHROOMS, EN_GIVEN].some((e) => d(e, p) < 10) && 'at a place of Pip\'s command',
      SEASON2.some((s) => d(s, p) < 4) && 'at a place of Season 2',
    ].filter(Boolean).map((w) => `place ${i} (${p.x}, ${p.z}): ${w}`));
    expect(bad).toEqual([]);
  });

  it(`none within showR + 4 of the heaviest looks: there no star is ever drawn (the frame there is 110 of 112 calls)`, () => {
    const near = MYSTERY_SPOTS.flatMap((p, i) => HEAVY.filter((h) => d(h, p) < MYSTERY_SHOW_R + 4).map((h) => `place ${i} (${p.x}, ${p.z}) ${d(h, p).toFixed(1)} m from (${h.x.toFixed(1)}, ${h.z.toFixed(1)})`));
    expect(near).toEqual([]);
    expect(MYSTERY_SHOW_R).toBeLessThanOrEqual(22);
  });

  it('half of them hidden: from the nearest point of a path the star is behind its boulder, seen without it', () => {
    expect(MYSTERY_HIDDEN).toHaveLength(MYSTERY_SPOTS.length / 2);
    expect(MYSTERY_SPOTS).toEqual([...MYSTERY_HIDDEN, ...MYSTERY_OPEN]);
    expect(MYSTERY_HIDDEN.filter((p) => !hiddenFromPath(HIDE, p.x, p.z)).map((p) => `${p.x}, ${p.z}`)).toEqual([]);
    expect(MYSTERY_HIDDEN.filter((p) => hiddenFromPath(HIDE, p.x, p.z, []))).toEqual([]);
    // each by its own boulder, the boulder between it and the path
    MYSTERY_HIDDEN.forEach((p, i) => {
      expect(hiddenFromPath(HIDE, p.x, p.z, [rockOccluder(MYSTERY_ROCKS[i])]), `place ${i}`).toBe(true);
      const n = nearestOn(PATHS, p.x, p.z);
      expect(d(n, MYSTERY_ROCKS[i])).toBeLessThan(d(n, p));
    });
  });

  it('the other half in sight from the path, aside of it, where she has to walk', () => {
    expect(MYSTERY_OPEN.filter((p) => hiddenFromPath(HIDE, p.x, p.z)).map((p) => `${p.x}, ${p.z}`)).toEqual([]);
    expect(MYSTERY_OPEN.every((p) => pathDist(p.x, p.z) >= 5 && pathDist(p.x, p.z) <= 12)).toBe(true);
  });

  it('the boulders: off the paths, clear of the trunks and the residents, each by its own place only, out of her way to the star', () => {
    const { trees } = placeTrees();
    const bad = MYSTERY_ROCKS.flatMap((b, i) => [
      pathDist(b.x, b.z) < 3 && 'on a path',
      trees.some((t) => d(t, b) < 2.6) && 'in a tree',
      BUSY.some((q) => d(q, b) < 5) && 'at a resident or a thing of the forest',
      [...COLLECT.items, ...DAILY_PLACES].some((f) => d(f, b) < 4) && 'at a find',
      HEAVY.some((h) => d(h, b) < MYSTERY_SHOW_R + 2) && 'in the heaviest looks',
      MYSTERY_SPOTS.filter((s) => d(s, b) < 3.5).length !== 1 && 'not by exactly one place',
      d(MYSTERY_HIDDEN[i], b) - ROCK_WALL < 0.6 && 'its wall over the star\'s place',
    ].filter(Boolean).map((w) => `boulder ${i} (${b.x}, ${b.z}): ${w}`));
    expect(bad).toEqual([]);
    for (let i = 0; i < MYSTERY_ROCKS.length; i++) for (let k = i + 1; k < MYSTERY_ROCKS.length; k++) expect(d(MYSTERY_ROCKS[i], MYSTERY_ROCKS[k])).toBeGreaterThan(8);
  });

  it('no plant grows inside a boulder, and every other plant stays where it grew', () => {
    const before = placePlants(), clear = MYSTERY_ROCKS.map((p) => ({ ...p, r: ROCK_WALL + 0.4 })), after = placePlants(undefined, clear);
    expect(after.every((p) => MYSTERY_ROCKS.every((b) => d(b, p) > ROCK_WALL + 0.4))).toBe(true);
    expect(after).toEqual(before.filter((p) => clear.every((c) => d(c, p) > c.r)));
  });

  it('a boulder bakes with the things of the forest: a position, a normal and a colour, indexed; as tall and wide as its occluder says', () => {
    const g = rockGeo(0.7);
    expect(Object.keys(g.attributes).sort()).toEqual(['color', 'normal', 'position']);
    expect(g.index).not.toBeNull();
    g.computeBoundingBox();
    const bb = g.boundingBox!, c = new THREE.Color(ROCK_COLOR);
    expect(bb.max.y).toBeGreaterThan(rockOccluder({ x: 0, z: 0 }).top);
    expect(bb.min.y).toBeLessThan(0);
    expect(Math.min(bb.max.x, -bb.min.x, bb.max.z, -bb.min.z)).toBeGreaterThan(rockOccluder({ x: 0, z: 0 }).r);
    expect(g.getAttribute('color').getX(0)).toBeCloseTo(c.r);
    expect(MYSTERY_ROCK.r * 0.9).toBe(ROCK_WALL);
  });

  it('ten a day of them', () => expect(MYSTERY_SPOTS.length).toBeGreaterThan(MYSTERY_COUNT * 2));
});
