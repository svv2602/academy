import { afterEach, describe, expect, it, vi } from 'vitest';

/** The map of the forest at the stretch `scale` (the module reads `?scale=` once, as it loads). */
async function mapAt(scale: number | null) {
  vi.resetModules();
  vi.stubGlobal('location', { search: scale === null ? '' : `?scale=${scale}` });
  const layout = await import('./layout');
  const terrain = await import('./terrain');
  const scenery = await import('./scenery');
  return { ...layout, ...terrain, ...scenery };
}
afterEach(() => { vi.unstubAllGlobals(); });

describe('the map of the forest, the grey build (WORLD-12)', () => {
  it('the stretch comes from ?scale=, kept within 0.5-3, the chosen 1.6 without it', async () => {
    const { readScale, SCALE, DEFAULT_SCALE } = await mapAt(null);
    expect(DEFAULT_SCALE).toBe(1.6);
    expect(SCALE).toBe(1.6);
    expect(readScale('')).toBe(1.6);
    expect(readScale('?scale=1')).toBe(1);
    expect(readScale('?scale=1.6')).toBe(1.6);
    expect(readScale('?scale=9')).toBe(3);
    expect(readScale('?scale=0.1')).toBe(0.5);
    expect(readScale('?scale=x')).toBe(1.6);
    expect(readScale(undefined)).toBe(1.6);
  });

  for (const scale of [1, 1.6]) {
    it(`at ${scale}: every zone inside the map, every path from a zone to a zone, the route along the paths`, async () => {
      const m = await mapAt(scale);
      expect(m.SCALE).toBe(scale);
      for (const [id, z] of Object.entries(m.ZONES)) expect(Math.hypot(z.x, z.z), id).toBeLessThan(m.HALF - m.EDGE - 3);
      const zones = Object.values(m.ZONES);
      for (const p of m.PATHS) {
        expect(zones.some((z) => z === p[0])).toBe(true);
        expect(zones.some((z) => z === p[p.length - 1])).toBe(true);
      }
      for (const [a, b] of m.routeLegs(m.ROUTE)) expect(m.pathBetween(a, b), `${a} -> ${b}`).not.toBeNull();
      // every path of the map is walked by the route
      expect(m.routeLegs(m.ROUTE).length).toBe(m.PATHS.length);
    });

    it(`at ${scale}: the trees stand off the paths, the stream and the zones, and the Oak's crown is over all of them`, async () => {
      const m = await mapAt(scale);
      const { trees } = m.placeTrees();
      // one tree on TREE_AREA m² (90 with the models, 60 in the grey build), some short of it where nothing may stand
      expect(trees.length).toBeGreaterThan(50 * scale * scale);
      const tracks = m.PATHS[m.PATHS.length - 1];
      for (const t of trees) {
        expect(m.pathDist(t.x, t.z)).toBeGreaterThan(3.5);
        expect(m.lineDist(tracks, t.x, t.z)).toBeGreaterThan(m.CLEARING);
        for (const l of m.sightLines()) expect(m.lineDist(l, t.x, t.z)).toBeGreaterThan(m.SIGHT);
        // and from where she comes out of the hub's arch to the village (the middle of the central glade is the arch)
        expect(m.lineDist(m.arrivalSight(), t.x, t.z)).toBeGreaterThan(m.SIGHT);
        expect(m.streamDist(t.x, t.z)).toBeGreaterThan(m.STREAM_HALF + 2);
      }
      // the tallest tree (its kind's height, scaled 1.3): the middle of the Oak's crown is over it, its top 5 m over it
      const tallest = Math.max(...m.TREE_KINDS.map(([, h]: readonly [string, number]) => h)) * 1.3;
      expect(m.OAK.crownY).toBeGreaterThan(tallest);
      expect(m.LANDMARKS.oak.top).toBeGreaterThan(tallest + 5);
      // every path crosses the stream on a bridge, two crossings in all
      expect(m.bridges().length).toBe(2);
    });
  }

  it('the stretch stretches the distances, not the things: the paths 1.6 times longer, the Oak as high', async () => {
    const one = await mapAt(1), more = await mapAt(1.6);
    const len = (m: typeof one) => m.PATHS.reduce((n, p) => n + m.lineLength(p), 0);
    expect(len(more) / len(one)).toBeCloseTo(1.6, 6);
    expect(more.OAK).toEqual(one.OAK);
    expect([more.MAZE_FRAME.lengths, more.MAZE_FRAME.gap]).toEqual([one.MAZE_FRAME.lengths, one.MAZE_FRAME.gap]);
    expect(more.HALF / one.HALF).toBeCloseTo(1.6, 6);
  });
});
