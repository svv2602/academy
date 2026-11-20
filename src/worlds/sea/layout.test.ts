import { afterEach, describe, expect, it, vi } from 'vitest';

/** The map of the sea at the stretch `scale` (the module reads `?scale=` once, as it loads). */
async function mapAt(scale: number | null) {
  vi.resetModules();
  vi.stubGlobal('location', { search: scale === null ? '' : `?scale=${scale}` });
  const layout = await import('./layout');
  const terrain = await import('./terrain');
  const scenery = await import('./scenery');
  return { ...layout, ...terrain, ...scenery };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('the map of the sea, the grey build (WORLD-12, docs/worlds/world-3.md)', () => {
  it("the stretch comes from ?scale=, kept within 0.5-3, the forest's 1.6 without it until the customer chooses", async () => {
    const { readScale, SCALE, DEFAULT_SCALE } = await mapAt(null);
    expect(DEFAULT_SCALE).toBe(1.6);
    expect(SCALE).toBe(1.6);
    expect(readScale('?scale=1')).toBe(1);
    expect(readScale('?scale=1.3')).toBe(1.3);
    expect(readScale('?scale=9')).toBe(3);
    expect(readScale('?scale=0.1')).toBe(0.5);
    expect(readScale('?scale=x')).toBe(1.6);
    expect(readScale(undefined)).toBe(1.6);
  });

  for (const scale of [1, 1.3, 1.6]) {
    it(`at ${scale}: every zone inside the map, every way from a zone to a zone, the route along the ways`, async () => {
      const m = await mapAt(scale);
      expect(m.SCALE).toBe(scale);
      expect(Object.keys(m.ZONES).sort()).toEqual(['garden', 'gate', 'grotto', 'reef', 'ship', 'square', 'throne', 'trench']);
      for (const [id, z] of Object.entries(m.ZONES)) expect(Math.hypot(z.x, z.z), id).toBeLessThan(m.HALF - m.EDGE - 3);
      const zones = Object.values(m.ZONES);
      for (const p of m.PATHS) {
        expect(zones.some((z) => z === p[0])).toBe(true);
        expect(zones.some((z) => z === p[p.length - 1])).toBe(true);
      }
      for (const [a, b] of m.routeLegs(m.ROUTE)) expect(m.pathBetween(a, b), `${a} -> ${b}`).not.toBeNull();
      // every way of the map is swum by the route, which ends at the throne
      expect(m.routeLegs(m.ROUTE).length).toBe(m.PATHS.length);
      expect(m.ROUTE.at(-1)).toBe('throne');
    });

    it(`at ${scale}: corals, kelp and rocks stand off the ways, the zones and the lines of sight; the castle over all of them`, async () => {
      const m = await mapAt(scale);
      const { corals, kelp, rocks, reef } = m.placeLife();
      expect(corals.length).toBeGreaterThan(30 * scale * scale);
      expect(reef.length).toBeGreaterThan(18);
      for (const t of [...corals, ...kelp, ...rocks]) {
        expect(m.pathDist(t.x, t.z)).toBeGreaterThan(3);
        for (const l of m.sightLines()) expect(m.lineDist(l, t.x, t.z)).toBeGreaterThan(m.SIGHT);
        for (const z of Object.values(m.ZONES)) expect(Math.hypot(z.x - t.x, z.z - t.z)).toBeGreaterThan(8);
      }
      // the tallest of them, kelp, is 3.2 m at 1.6 its size: the castle's towers and the ship's mast stand well over it
      expect(m.CASTLE.towerH).toBeGreaterThan(3.2 * 1.6 * 2);
      expect(m.SHIP.mastH).toBeGreaterThan(3.2 * 1.6 * 2);
    });
  }

  it('the stretch stretches the distances, not the things: the ways 1.6 times longer, the castle and the ship as big', async () => {
    const one = await mapAt(1), more = await mapAt(1.6);
    const len = (m: typeof one) => m.PATHS.reduce((n, p) => n + m.lineLength(p), 0);
    expect(len(more) / len(one)).toBeCloseTo(1.6, 6);
    expect(more.CASTLE.towerH).toBe(one.CASTLE.towerH);
    expect(more.SHIP.len).toBe(one.SHIP.len);
    expect(more.HALF / one.HALF).toBeCloseTo(1.6, 6);
  });

  it('the pearls lie where the swimmer reaches them: off the colliders of the ship and the corals', async () => {
    const m = await mapAt(1.6);
    m.colliders.length = 0;
    m.buildScenery({ add: () => {} } as never);
    for (const [name, p] of [['cabin', m.CABIN], ['coral nest', m.CORAL_NEST], ['throne', m.THRONE]] as const) {
      const q = { x: p.x, z: p.z };
      m.resolve(q, 0.3);
      expect(Math.hypot(q.x - p.x, q.z - p.z), name).toBeLessThan(0.4);
    }
    m.colliders.length = 0;
  });
});
