import { afterEach, describe, expect, it, vi } from 'vitest';

/** The map of the Sweet Land at the stretch `scale` (the module reads `?scale=` once, as it loads). */
async function mapAt(scale: number | null) {
  vi.resetModules();
  vi.stubGlobal('location', { search: scale === null ? '' : `?scale=${scale}` });
  const layout = await import('./layout');
  const terrain = await import('./terrain');
  const scenery = await import('./scenery');
  return { ...layout, ...terrain, ...scenery };
}
afterEach(() => { vi.unstubAllGlobals(); });

type P = { x: number; z: number };
/** Where the segments a-b and c-d cross, or null (parallel or apart). */
function crossing(a: P, b: P, c: P, d: P): P | null {
  const r = { x: b.x - a.x, z: b.z - a.z }, s = { x: d.x - c.x, z: d.z - c.z }, den = r.x * s.z - r.z * s.x;
  if (Math.abs(den) < 1e-9) return null;
  const t = ((c.x - a.x) * s.z - (c.z - a.z) * s.x) / den, u = ((c.x - a.x) * r.z - (c.z - a.z) * r.x) / den;
  return t >= -1e-9 && t <= 1 + 1e-9 && u >= -1e-9 && u <= 1 + 1e-9 ? { x: a.x + r.x * t, z: a.z + r.z * t } : null;
}
/** Every point where a line of points crosses another. */
const crossings = (p: readonly P[], q: readonly P[]) => p.slice(1).flatMap((b, i) => q.slice(1).flatMap((d, k) => { const x = crossing(p[i], b, q[k], d); return x ? [x] : []; }));

describe('the map of the Sweet Land, the grey build (WORLD-12, docs/worlds/world-4.md)', () => {
  it('the stretch comes from ?scale=, kept within 0.5-3, 1.6 without it (the lead\'s decision 2026-11-22)', async () => {
    const { readScale, SCALE, DEFAULT_SCALE } = await mapAt(null);
    expect(DEFAULT_SCALE).toBe(1.6);
    expect(SCALE).toBe(1.6);
    expect(readScale('?scale=1')).toBe(1);
    expect(readScale('?scale=9')).toBe(3);
    expect(readScale('?scale=0.1')).toBe(0.5);
    expect(readScale('?scale=x')).toBe(1.6);
    expect(readScale(undefined)).toBe(1.6);
  });

  it('the zones stand where the document draws them, in its units times the stretch', async () => {
    const m = await mapAt(1);
    expect(m.ZONES).toEqual({
      square: { x: 24, z: -2 }, palace: { x: 22, z: -30 }, garden: { x: -22, z: -30 }, town: { x: -24, z: -2 },
      market: { x: -22, z: 22 }, mill: { x: 22, z: 22 }, bridge: { x: 0, z: 28 },
    });
    expect(m.HALF).toBe(45);
  });

  for (const scale of [1, 1.6]) {
    it(`at ${scale}: every zone inside the map, every way from a zone to a zone, the route along the ways`, async () => {
      const m = await mapAt(scale);
      expect(m.SCALE).toBe(scale);
      for (const [id, z] of Object.entries(m.ZONES)) expect(Math.hypot(z.x, z.z), id).toBeLessThan(m.HALF - m.EDGE - 3);
      expect(Math.hypot(m.SPAWN.x, m.SPAWN.z)).toBeLessThan(m.HALF - m.EDGE - 3);
      const zones = Object.values(m.ZONES);
      for (const p of m.PATHS) {
        expect(zones.some((z) => z === p[0])).toBe(true);
        expect(zones.some((z) => z === p[p.length - 1])).toBe(true);
      }
      for (const z of m.ROUTE) expect(Object.keys(m.ZONES)).toContain(z);
      for (const [a, b] of m.routeLegs(m.ROUTE)) expect(m.pathBetween(a, b), `${a} -> ${b}`).not.toBeNull();
      // every way of the map is walked by the route, which starts at the way in and ends at the palace
      expect(m.routeLegs(m.ROUTE).length).toBe(m.PATHS.length);
      expect(m.ROUTE[0]).toBe('square');
      expect(m.ROUTE.at(-1)).toBe('palace');
    });

    it(`at ${scale}: the river is crossed by the ways at the bridge alone, and its colliders leave only the bridge open`, async () => {
      const m = await mapAt(scale);
      // no way crosses the river but the two that meet on the bridge, and they meet it at its middle
      for (const p of m.PATHS) {
        for (const x of crossings(p, m.RIVER)) expect(Math.hypot(x.x - m.BRIDGE.x, x.z - m.BRIDGE.z), `a way crosses the river at ${x.x}, ${x.z}`).toBeLessThan(0.01);
      }
      // the market and the mill on two banks: the way between them goes over the bridge
      const side = (p: P) => Math.sign((p.x - m.BRIDGE.x) * Math.sin(m.BRIDGE.yaw) + (p.z - m.BRIDGE.z) * Math.cos(m.BRIDGE.yaw));
      expect(side(m.ZONES.market)).toBe(-1);
      expect(side(m.ZONES.mill)).toBe(1);
      // walking across the river anywhere but on the bridge: the colliders push her back to the bank she came from
      m.colliders.length = 0;
      m.colliders.push(...m.riverColliders());
      const walk = (from: P, to: P) => {
        const q = { ...from }, n = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.1);
        for (let i = 1; i <= n; i++) { q.x += (to.x - from.x) / n; q.z += (to.z - from.z) / n; m.resolve(q, 0.35); }
        return q;
      };
      const across = { x: Math.sin(m.BRIDGE.yaw), z: Math.cos(m.BRIDGE.yaw) }, along = { x: across.z, z: -across.x };
      let tried = 0;
      for (const s of [-12, -8, -5, 5, 8, 12]) {
        const o = { x: m.BRIDGE.x + along.x * s, z: m.BRIDGE.z + along.z * s };
        const from = { x: o.x - across.x * 6, z: o.z - across.z * 6 }, to = { x: o.x + across.x * 6, z: o.z + across.z * 6 };
        if (Math.hypot(from.x, from.z) > m.HALF - m.EDGE || Math.hypot(to.x, to.z) > m.HALF - m.EDGE) continue;
        if (m.riverDist(o.x, o.z) > 0.5) continue;
        tried++;
        const end = walk(from, to);
        expect(side(end) === side(from) || m.riverDist(end.x, end.z) >= m.RIVER_HALF, `crossed the river ${s} m off the bridge`).toBe(true);
        expect(Math.hypot(end.x - to.x, end.z - to.z), `${s} m off the bridge`).toBeGreaterThan(3);
      }
      expect(tried).toBeGreaterThanOrEqual(4);
      // on the bridge she crosses, and its deck is level with the banks
      const from = { x: m.BRIDGE.x - across.x * 6, z: m.BRIDGE.z - across.z * 6 }, to = { x: m.BRIDGE.x + across.x * 6, z: m.BRIDGE.z + across.z * 6 };
      const end = walk(from, to);
      expect(Math.hypot(end.x - to.x, end.z - to.z)).toBeLessThan(0.05);
      expect(m.onBridge(m.BRIDGE.x, m.BRIDGE.z)).toBe(true);
      expect(Math.abs(m.height(m.BRIDGE.x, m.BRIDGE.z) - m.height(from.x, from.z))).toBeLessThan(1);
      m.colliders.length = 0;
    });

    it(`at ${scale}: the sweets stand off the ways, the river, the zones and the lines of sight; the cake's candle over all`, async () => {
      const m = await mapAt(scale);
      const { lollipops, candies, hills, wall } = m.placeSweets();
      expect(lollipops.length).toBeGreaterThan(20 * scale * scale);
      for (const t of [...lollipops, ...candies]) {
        expect(m.pathDist(t.x, t.z)).toBeGreaterThan(3);
        expect(m.riverDist(t.x, t.z)).toBeGreaterThan(4);
        for (const l of m.sightLines()) expect(m.lineDist(l, t.x, t.z)).toBeGreaterThan(m.SIGHT);
        for (const z of Object.values(m.ZONES)) expect(Math.hypot(z.x - t.x, z.z - t.z)).toBeGreaterThan(8);
      }
      // the edge: the wall of lollipops and the hills stand past HALF, round the whole map
      for (const t of [...wall, ...hills]) expect(Math.hypot(t.x, t.z)).toBeGreaterThan(m.HALF);
      expect(wall.length).toBeGreaterThan((2 * Math.PI * m.HALF) / 6);
      // the tallest scattered thing is a lollipop of 3.2 m at 1.4 its size: the candle and the mill's wings stand well over it
      expect(m.CAKE.top).toBeGreaterThanOrEqual(18);
      expect(m.LANDMARKS.mill.top).toBeGreaterThan(3.2 * 1.4 * 2);
      expect(m.MILL.wingR * 2).toBeCloseTo(12, 0);
    });
  }

  it('the stretch stretches the distances, not the things: the ways 1.6 times longer, the cake and the mill as big', async () => {
    const one = await mapAt(1), more = await mapAt(1.6);
    const len = (m: typeof one) => m.PATHS.reduce((n, p) => n + m.lineLength(p), 0);
    expect(len(more) / len(one)).toBeCloseTo(1.6, 6);
    expect(more.CAKE.tiers).toEqual(one.CAKE.tiers);
    expect(more.CAKE.top).toBe(one.CAKE.top);
    expect(more.MILL.wingR).toBe(one.MILL.wingR);
    expect(more.HALF / one.HALF).toBeCloseTo(1.6, 6);
  });

  it('the places to take a ruby and the shrine are reached on foot: off the colliders of the scenery', async () => {
    const m = await mapAt(1.6);
    m.colliders.length = 0;
    m.buildScenery({ add: () => {} } as never);
    for (const [name, p] of [['the house door', m.HOUSE_DOOR], ['before the millstone', { x: m.MILLSTONE.x, z: m.MILLSTONE.z + 1.6 }], ['the shrine', m.SHRINE], ['the spawn', m.SPAWN]] as const) {
      const q = { x: p.x, z: p.z };
      m.resolve(q, 0.35);
      expect(Math.hypot(q.x - p.x, q.z - p.z), name).toBeLessThan(0.4);
    }
    // the middle of every zone is free to stand in: the walk of a way ends there
    for (const [id, z] of Object.entries(m.ZONES)) {
      const q = { ...z };
      m.resolve(q, 0.35);
      expect(Math.hypot(q.x - z.x, q.z - z.z), id).toBeLessThan(0.01);
    }
    m.colliders.length = 0;
  });
});
