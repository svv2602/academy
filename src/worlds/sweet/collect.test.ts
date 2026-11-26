import { describe, expect, it } from 'vitest';
import { COLLECT_KINDS, collectProblems } from '../../game/collections';
import { COLLECT, DAILY_PLACES } from './collect';
import {
  BRIDGE, CAKE, EASEL, CANDY_BOX, CAROUSEL, COTTON_CLOUD, EDGE, FOUNTAIN, GUM_MACHINE, HALF, HOUSE, HOUSE_DOOR, LANDMARKS, MILL,
  MILLSTONE, RIVER_HALF, SCALES_AT, SHRINE, TREE_ARCH, ZONES,
} from './layout';
import { gardenTrees, placeSweets, townHouses } from './scenery';
import { pathDist, riverDist } from './terrain';
import { easelStand } from '../../game/easel-place';

const places = [...COLLECT.items, ...DAILY_PLACES.map((p) => ({ ...p, kind: 'daily', way: 'run' }))];
const near = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('the collections of the Sweet Land (PLAY-25, the lead\'s word of 2026-11-25)', () => {
  it('two sets of six: lollipops and jelly sweets, of the Sweet Land, lying on the ground', () => {
    expect(collectProblems(COLLECT)).toEqual([]);
    expect(COLLECT.items.filter((i) => i.kind === 'lollipop')).toHaveLength(6);
    expect(COLLECT.items.filter((i) => i.kind === 'marmalade')).toHaveLength(6);
    // the sets are the land's; the pieces of the picture are of every world (`any`); all lie on the ground
    for (const i of COLLECT.items) expect([COLLECT_KINDS[i.kind].world, i.way]).toEqual([i.kind === 'piece' ? 'any' : 'sweet', 'run']);
  });

  it('seen from a way and a few steps aside; clear of the river, the zones, the landmarks, the secrets and the pet', () => {
    // the secrets' places (./secrets.ts), the scales, the arch to the Great Tree, the market's stalls (./scenery.ts) and
    // Zheleyka's spot in the garden (./index.ts ZHELEYKA: no import - it loads the world's code)
    const stalls = [[-6, -3], [-2, -6], [5, -4], [6, 3]].map(([dx, dz]) => ({ x: ZONES.market.x + dx, z: ZONES.market.z + dz }));
    const busy = [...Object.values(LANDMARKS), CANDY_BOX, COTTON_CLOUD, FOUNTAIN, GUM_MACHINE, TREE_ARCH, SCALES_AT, SHRINE,
      MILLSTONE, HOUSE, HOUSE_DOOR, BRIDGE, ...stalls, { x: ZONES.garden.x - 5, z: ZONES.garden.z - 6.5 }];
    const bad = places.flatMap((it, i) => [
      Math.hypot(it.x, it.z) > HALF - EDGE - 3 && 'at the edge',
      pathDist(it.x, it.z) < 3 && 'on a way',
      pathDist(it.x, it.z) > 7 && 'not seen from a way',
      riverDist(it.x, it.z) < RIVER_HALF + 2.5 && 'in the river',
      Object.values(ZONES).some((z) => near(z, it) < 6) && 'in a zone',
      busy.some((p) => near(p, it) < 5) && 'at a thing of the world',
      near(CAKE, it) < CAKE.tiers[0].r + 3 && 'at the cake palace',
      near(MILL, it) < MILL.wingR + 2 && 'under the mill\'s wings',
      near(CAROUSEL, it) < CAROUSEL.r + 3 && 'at the carousel',
    ].filter(Boolean).map((w) => `${i} ${it.kind} (${it.x}, ${it.z}): ${w}`));
    expect(bad).toEqual([]);
  });

  it('no sweet, house or tree of the land stands on a find or a place of the find of the day: none hides one', () => {
    const { lollipops, candies } = placeSweets();
    for (const f of places) {
      expect([...lollipops, ...candies].filter((t) => near(t, f) < 1.2 + 1.2 * t.s), `${f.kind} (${f.x}, ${f.z})`).toEqual([]);
      expect(townHouses().filter((h) => near(h, f) < 4), `${f.kind} (${f.x}, ${f.z})`).toEqual([]);
      expect(gardenTrees().filter((t) => near(t, f) < 2), `${f.kind} (${f.x}, ${f.z})`).toEqual([]);
    }
  });

  it('apart: two finds 5 m at least; the places of the find of the day 6 m from every find and 12 m apart', () => {
    COLLECT.items.forEach((a, i) => COLLECT.items.forEach((b, j) => { if (j > i) expect(near(a, b), `${i} ${j}`).toBeGreaterThanOrEqual(5); }));
    for (const p of DAILY_PLACES) for (const f of COLLECT.items) expect(near(p, f)).toBeGreaterThanOrEqual(6);
    DAILY_PLACES.forEach((a, i) => DAILY_PLACES.forEach((b, j) => { if (j > i) expect(near(a, b)).toBeGreaterThanOrEqual(12); }));
    expect(DAILY_PLACES.length).toBeGreaterThanOrEqual(6);
  });

  it('the picture (PLAY-29): nine pieces of a 3 x 3 frame of the land\'s own story; the easel by the carousel, clear of the sweets, the houses and the finds', () => {
    expect(COLLECT.items.filter((i) => i.kind === 'piece')).toHaveLength(9);
    expect(COLLECT.picture).toEqual({ image: 'story/sweet/w4_intro_1', cols: 3, rows: 3 });
    const { lollipops, candies } = placeSweets();
    for (const p of [EASEL, easelStand(EASEL)]) {
      expect(pathDist(p.x, p.z), 'off the ways').toBeGreaterThan(2.5);
      expect(near(CAROUSEL, p)).toBeGreaterThan(CAROUSEL.r + 2);
      expect([...lollipops, ...candies].filter((t) => near(t, p) < 1.5 + 1.2 * t.s)).toEqual([]);
      expect(townHouses().filter((h) => near(h, p) < 4.5)).toEqual([]);
      for (const f of places) expect(near(f, p)).toBeGreaterThan(4);
    }
  });
});
