// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { COLLECT_KINDS, collectProblems } from '../../game/collections';
import { COLLECT, DAILY_PLACES } from './collect';
import { FRIENDS, PUSHOK, RAYS } from './index';
import {
  CASTLE, CLOCK, CLOCK_AT, GANGWAY, GEARS, ISLANDS, LANDMARKS, MILLS, NOOK_ENDS, NOOK_WAYS, OBSERVATORY, RAIL, SHRINE, SPAWN,
  TREE_ARCH, WINDS_AT, ZONES, type Place,
} from './layout';
import { placeTrees } from './scenery';
import { millOf, nestOf } from './secrets';
import { islandAt, lineDist, pathDist } from './terrain';

// the world's module draws the glow of the sparks on a canvas as it loads (src/game/fx.ts): not needed here
vi.mock('../../game/fx', () => ({ glowTex: null, Sparks: class {} }));

const places = [...COLLECT.items, ...DAILY_PLACES.map((p) => ({ ...p, kind: 'daily', way: 'run' }))];
const near = (a: Place, b: Place) => Math.hypot(a.x - b.x, a.z - b.z);

describe('the collections of the Sky Islands (PLAY-25, the lead\'s word of 2026-11-26)', () => {
  it('two sets of six: little clouds and balloons, of the Sky Islands, taken by walking into them', () => {
    expect(collectProblems(COLLECT)).toEqual([]);
    expect(COLLECT.items.filter((i) => i.kind === 'cloudlet')).toHaveLength(6);
    expect(COLLECT.items.filter((i) => i.kind === 'balloon')).toHaveLength(6);
    for (const i of COLLECT.items) expect([COLLECT_KINDS[i.kind].world, i.way]).toEqual(['sky', 'run']);
  });

  it('on an island she walks, seen from a way and a few steps aside; clear of the zones, the things, the people and the pet', () => {
    // what stands on the islands, and how near a find may come to it (m): the landmarks, the castle and the tower, the
    // shrine, the clock and its gears, the windmills with their balconies and sails, the gangway and the map's table,
    // the arch to the Great Tree, the spawn, the secrets' places, the ends of the ways to the nooks, the characters
    // (Gromykhalo is big), Pushok's spot and the rays' places
    const busy: [Place, number][] = [
      ...Object.values(ZONES).map((z): [Place, number] => [z, 6]), ...Object.values(LANDMARKS).map((l): [Place, number] => [l, 5]),
      [CASTLE, CASTLE.r + 3], [OBSERVATORY, OBSERVATORY.r + 3], [SHRINE, 5], [CLOCK, 5], [CLOCK_AT, 4], ...GEARS.map((g): [Place, number] => [g, 4]),
      ...MILLS.map((m): [Place, number] => [m, 6.5]), [GANGWAY, 5], [WINDS_AT, 5], [TREE_ARCH, 5], [SPAWN, 4],
      [millOf().at, 5], [millOf().front, 5], [nestOf().at, 5], [nestOf().stand, 5], ...NOOK_ENDS.map((e): [Place, number] => [e, 4]),
      ...FRIENDS.map((f): [Place, number] => [f, f.id === 'gromykhalo' ? 6 : 4.5]), [PUSHOK, 4], ...RAYS.map((r): [Place, number] => [r.at, 4]),
    ];
    const bad = places.flatMap((it, i) => {
      const isle = islandAt(it.x, it.z);
      return [
        (!isle || isle === 'far') && 'not on an island she walks',
        isle && isle !== 'far' && near(ISLANDS[isle], it) > ISLANDS[isle].r - RAIL - 1.5 && 'at the edge',
        pathDist(it.x, it.z) < 3 && 'on a way',
        pathDist(it.x, it.z) > 7 && 'not seen from a way',
        Object.values(NOOK_WAYS).some((w) => lineDist([w.from, w.to], it.x, it.z) < 2.5) && 'on the way to a nook',
        ...busy.filter(([p, r]) => near(p, it) < r).map(([p]) => `at a thing of the world (${p.x.toFixed(1)}, ${p.z.toFixed(1)})`),
      ].filter(Boolean).map((w) => `${i} ${it.kind} (${it.x}, ${it.z}): ${w}`);
    });
    expect(bad).toEqual([]);
  });

  it('no tree or bush of the islands stands on a find or a place of the find of the day: none hides one', () => {
    const { trees, bushes } = placeTrees();
    for (const f of places) {
      expect(trees.filter((t) => near(t, f) < 2.2), `${f.kind} (${f.x}, ${f.z})`).toEqual([]);
      expect(bushes.filter((t) => near(t, f) < 1.5), `${f.kind} (${f.x}, ${f.z})`).toEqual([]);
    }
  });

  it('apart: two finds 5 m at least; the places of the find of the day 6 m from every find and 12 m apart', () => {
    COLLECT.items.forEach((a, i) => COLLECT.items.forEach((b, j) => { if (j > i) expect(near(a, b), `${i} ${j}`).toBeGreaterThanOrEqual(5); }));
    for (const p of DAILY_PLACES) for (const f of COLLECT.items) expect(near(p, f)).toBeGreaterThanOrEqual(6);
    DAILY_PLACES.forEach((a, i) => DAILY_PLACES.forEach((b, j) => { if (j > i) expect(near(a, b)).toBeGreaterThanOrEqual(12); }));
    expect(DAILY_PLACES.length).toBeGreaterThanOrEqual(6);
  });

  it('a bunch of balloons floats at her chest, its string to the ground; a little cloud hangs low: both in her reach walking', () => {
    for (const i of COLLECT.items) expect(i.y, i.kind).toBe(i.kind === 'balloon' ? 1 : 0.4);
  });
});
