import { describe, expect, it } from 'vitest';
import { COLLECT_KINDS, collectProblems } from '../../game/collections';
import { COLLECT, DAILY_PLACES } from './collect';
import { CABIN, CASTLE, EASEL, CORAL_NEST, EDGE, HALF, LANDMARKS, LIFT_ROCK, LOOKOUT, SHIP, SQUARE_ARCH, ZONES } from './layout';
import { placeLife } from './scenery';
import { shellsOf } from './secrets';
import { pathDist } from './terrain';
import { easelStand } from '../../game/easel-place';

const places = [...COLLECT.items, ...DAILY_PLACES.map((p) => ({ ...p, kind: 'daily', way: 'run' }))];
const near = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('the collections of the sea (PLAY-25, the customer\'s word of 2026-11-23)', () => {
  it('two sets of six: shells and coral twigs, of the sea, lying on the sand', () => {
    expect(collectProblems(COLLECT)).toEqual([]);
    expect(COLLECT.items.filter((i) => i.kind === 'shell')).toHaveLength(6);
    expect(COLLECT.items.filter((i) => i.kind === 'coral')).toHaveLength(6);
    // the sets are the sea's; the pieces of the picture are of every world (`any`); all lie on the sand
    for (const i of COLLECT.items) expect([COLLECT_KINDS[i.kind].world, i.way]).toEqual([i.kind === 'piece' ? 'any' : 'sea', 'run']);
  });

  it('seen from a way and a few strokes aside; clear of the zones, the landmarks and the secrets', () => {
    // the secrets' places (./secrets.ts) and the pet's spot behind the garden's great shell (garden + (-6.1, 4.6))
    const busy = [...Object.values(LANDMARKS), LIFT_ROCK, LOOKOUT, CABIN, CORAL_NEST, SQUARE_ARCH, ...shellsOf().at,
      { x: ZONES.garden.x - 6.1, z: ZONES.garden.z + 4.6 }];
    const bad = places.flatMap((it, i) => [
      Math.hypot(it.x, it.z) > HALF - EDGE - 3 && 'at the edge',
      pathDist(it.x, it.z) < 3 && 'on a way',
      pathDist(it.x, it.z) > 7 && 'not seen from a way',
      Object.values(ZONES).some((z) => near(z, it) < 6) && 'in a zone',
      busy.some((p) => near(p, it) < 5) && 'at a thing of the world',
      near(CASTLE, it) < CASTLE.ring + 4 && 'at the castle',
      near(SHIP, it) < SHIP.len / 2 + 2 && 'at the ship',
    ].filter(Boolean).map((w) => `${i} ${it.kind} (${it.x}, ${it.z}): ${w}`));
    expect(bad).toEqual([]);
  });

  it('no coral, kelp, rock or anemone of the floor stands on a find or a place of the find of the day: none hides one', () => {
    const life = placeLife(), all = [...life.corals, ...life.kelp, ...life.rocks, ...life.reef, ...life.anemones];
    for (const f of places) expect(all.filter((t) => near(t, f) < 1.2 + 1.2 * t.s), `${f.kind} (${f.x}, ${f.z})`).toEqual([]);
  });

  it('apart: two finds 5 m at least; the places of the find of the day 6 m from every find and 12 m apart', () => {
    COLLECT.items.forEach((a, i) => COLLECT.items.forEach((b, j) => { if (j > i) expect(near(a, b), `${i} ${j}`).toBeGreaterThanOrEqual(5); }));
    for (const p of DAILY_PLACES) for (const f of COLLECT.items) expect(near(p, f)).toBeGreaterThanOrEqual(6);
    DAILY_PLACES.forEach((a, i) => DAILY_PLACES.forEach((b, j) => { if (j > i) expect(near(a, b)).toBeGreaterThanOrEqual(12); }));
    expect(DAILY_PLACES.length).toBeGreaterThanOrEqual(6);
  });

  it('the picture (PLAY-29): nine pieces of a 3 x 3 frame of the sea\'s own story; the easel by the way in, off the ways, clear of the floor\'s life and the finds', () => {
    expect(COLLECT.items.filter((i) => i.kind === 'piece')).toHaveLength(9);
    expect(COLLECT.picture).toEqual({ image: 'story/sea/w3_intro_3', cols: 3, rows: 3 });
    const life = placeLife(), all = [...life.corals, ...life.kelp, ...life.rocks, ...life.reef, ...life.anemones];
    for (const p of [EASEL, easelStand(EASEL)]) {
      expect(pathDist(p.x, p.z), 'off the ways').toBeGreaterThan(2.5);
      expect(all.filter((t) => near(t, p) < 1.5 + 1.2 * t.s)).toEqual([]);
      for (const f of places) expect(near(f, p)).toBeGreaterThan(4);
      for (const z of Object.values(ZONES)) if (z !== ZONES.square) expect(near(z, p)).toBeGreaterThan(6);
    }
  });
});
