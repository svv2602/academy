import { describe, expect, it } from 'vitest';
import { COLLECT_KINDS, collectProblems } from '../../game/collections';
import { COLLECT, DAILY_PLACES } from './collect';
import { CABIN, CASTLE, CORAL_NEST, EDGE, HALF, LANDMARKS, LIFT_ROCK, LOOKOUT, SHIP, SQUARE_ARCH, ZONES } from './layout';
import { placeLife } from './scenery';
import { shellsOf } from './secrets';
import { pathDist } from './terrain';

const places = [...COLLECT.items, ...DAILY_PLACES.map((p) => ({ ...p, kind: 'daily', way: 'run' }))];
const near = (a: { x: number; z: number }, b: { x: number; z: number }) => Math.hypot(a.x - b.x, a.z - b.z);

describe('the collections of the sea (PLAY-25, the customer\'s word of 2026-11-23)', () => {
  it('two sets of six: shells and coral twigs, of the sea, lying on the sand', () => {
    expect(collectProblems(COLLECT)).toEqual([]);
    expect(COLLECT.items.filter((i) => i.kind === 'shell')).toHaveLength(6);
    expect(COLLECT.items.filter((i) => i.kind === 'coral')).toHaveLength(6);
    for (const i of COLLECT.items) expect([COLLECT_KINDS[i.kind].world, i.way]).toEqual(['sea', 'run']);
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
});
