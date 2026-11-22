// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { collectProblems } from '../../game/collections';
import { COLLECT, DAILY_PLACES } from './collect';
import { ALTAR, HALF, HOLLOW, LANDMARKS, MAZE_END, MAZE_IN, OWL_TREE, PATHS, SECRET_CLEARINGS, STREAM_HALF, ZONES, inMaze } from './layout';
import { lineDist, pathDist, streamDist } from './terrain';
import { placeTrees, villageHouses } from './scenery';
import { FIND_CLEAR, placePlants } from './undergrowth';

/** The squirrel's tracks (the last path of the map): Shustrik's nuts lie along them (./tracks.ts). */
const TRACKS = PATHS[PATHS.length - 1];
const places = [...COLLECT.items, ...DAILY_PLACES.map((p) => ({ ...p, kind: 'daily', way: 'run' }))];

describe('the collections of the forest (PLAY-25, the customer\'s word of 2026-11-22)', () => {
  it('two sets of six: cones and bilberries, of the forest', () => {
    expect(collectProblems(COLLECT)).toEqual([]);
    expect(COLLECT.items.filter((i) => i.kind === 'cone')).toHaveLength(6);
    expect(COLLECT.items.filter((i) => i.kind === 'berry')).toHaveLength(6);
  });

  it('seen from a path and a few steps aside; clear of the stream, the zones, the secrets, the maze, the tracks and the things of the world', () => {
    const { trees } = placeTrees();
    const busy = [MAZE_IN, MAZE_END, HOLLOW, ALTAR, OWL_TREE, ...Object.values(LANDMARKS), ...villageHouses()];
    const bad = places.flatMap((it, i) => [
      Math.hypot(it.x, it.z) > HALF - 6 && 'beyond the forest',
      pathDist(it.x, it.z) < 3 && 'on a path',
      pathDist(it.x, it.z) > 7 && 'not seen from a path',
      streamDist(it.x, it.z) < STREAM_HALF + 2.5 && 'in the stream',
      lineDist(TRACKS, it.x, it.z) < 5 && 'on the squirrel\'s tracks',
      Object.values(ZONES).some((z) => Math.hypot(z.x - it.x, z.z - it.z) < 10) && 'in a zone',
      SECRET_CLEARINGS.some((c) => Math.hypot(c.x - it.x, c.z - it.z) < c.clear + 3) && 'at a secret',
      inMaze(it.x, it.z, 4) && 'in the maze',
      busy.some((p) => Math.hypot(p.x - it.x, p.z - it.z) < 6) && 'at a thing of the world',
      trees.some((t) => Math.hypot(t.x - it.x, t.z - it.z) < 1.8) && 'at a trunk',
    ].filter(Boolean).map((w) => `${i} ${it.kind} (${it.x}, ${it.z}): ${w}`));
    expect(bad).toEqual([]);
  });

  it('no plant of the undergrowth grows on a find or a place of the find of the day: none hides one', () => {
    const plants = placePlants();
    for (const f of places) expect(plants.filter((p) => Math.hypot(p.x - f.x, p.z - f.z) <= FIND_CLEAR), `${f.kind} (${f.x}, ${f.z})`).toEqual([]);
  });

  it('apart: two finds 5 m at least; the places of the find of the day 6 m from every find and 12 m apart', () => {
    const near = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);
    COLLECT.items.forEach((a, i) => COLLECT.items.forEach((b, j) => { if (j > i) expect(near(a, b), `${i} ${j}`).toBeGreaterThanOrEqual(5); }));
    for (const p of DAILY_PLACES) for (const f of COLLECT.items) expect(near(p, f)).toBeGreaterThanOrEqual(6);
    DAILY_PLACES.forEach((a, i) => DAILY_PLACES.forEach((b, j) => { if (j > i) expect(near(a, b)).toBeGreaterThanOrEqual(12); }));
    expect(DAILY_PLACES.length).toBeGreaterThanOrEqual(6);
  });
});
