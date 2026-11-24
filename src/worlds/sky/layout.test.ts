import { afterEach, describe, expect, it, vi } from 'vitest';

/** The map of the Sky Islands at the stretch `scale` (the module reads `?scale=` once, as it loads). */
async function mapAt(scale: number | null) {
  vi.resetModules();
  vi.stubGlobal('location', { search: scale === null ? '' : `?scale=${scale}` });
  const layout = await import('./layout');
  const terrain = await import('./terrain');
  return { ...layout, ...terrain };
}
afterEach(() => { vi.unstubAllGlobals(); });

type P = { x: number; z: number };
/** m/s: the heroine's top speed on foot (src/game/stride.ts: her run, 5.4 m/s). */
const RUN = 5.4;

describe('the map of the Sky Islands, the grey build (WORLD-12, docs/worlds/world-5.md)', () => {
  it('the stretch comes from ?scale=, kept within 0.5-3, 1.6 without it', async () => {
    const { readScale, SCALE, DEFAULT_SCALE } = await mapAt(null);
    expect(DEFAULT_SCALE).toBe(1.6);
    expect(SCALE).toBe(1.6);
    expect(readScale('?scale=1')).toBe(1);
    expect(readScale('?scale=9')).toBe(3);
    expect(readScale('?scale=0.1')).toBe(0.5);
    expect(readScale(undefined)).toBe(1.6);
  });

  it('six islands where the drawing has them: the castle in the middle, the observatory north, the dragons west, the windmills east, the pier south, the far islet south-east', async () => {
    const m = await mapAt(1);
    expect(Object.keys(m.ISLANDS)).toEqual(['castle', 'observatory', 'dragon', 'mills', 'pier', 'far']);
    expect(m.ZONES).toEqual({ castle: { x: 0, z: 0 }, observatory: { x: 0, z: -60 }, dragon: { x: -60, z: 0 }, mills: { x: 60, z: 0 }, pier: { x: 0, z: 60 }, far: { x: 60, z: 60 } });
    // no two islands touch: the only ways between them are the bridges
    const list = Object.values(m.ISLANDS);
    for (const a of list) for (const b of list) if (a !== b) expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeGreaterThan(a.r + b.r + 10);
  });

  for (const scale of [1, 1.6]) {
    it(`at ${scale}: every island but the far islet is reached by the bridges from the castle; the far islet by none`, async () => {
      const m = await mapAt(scale);
      const reached = new Set(['castle']);
      for (let k = 0; k < 6; k++) for (const [a, b] of m.BRIDGES) { if (reached.has(a)) reached.add(b); if (reached.has(b)) reached.add(a); }
      expect([...reached].sort()).toEqual(['castle', 'dragon', 'mills', 'observatory', 'pier']);
      expect(m.BRIDGES.some(([a, b]) => a === 'far' || b === 'far')).toBe(false);
      // every way is a bridge, the route walks each there and back and ends at the observatory
      for (const [a, b] of m.routeLegs(m.ROUTE)) expect(m.pathBetween(a, b), `${a} -> ${b}`).not.toBeNull();
      expect(m.routeLegs(m.ROUTE).length).toBe(m.PATHS.length);
      expect(m.ROUTE[0]).toBe('castle');
      expect(m.ROUTE.at(-1)).toBe('observatory');
    });

    it(`at ${scale}: the spawn, the arch, the shrine, the clock, the gangway, the landing and ray 4 stand on their islands, inside the rail`, async () => {
      const m = await mapAt(scale);
      const on: [P, string][] = [[m.SPAWN, 'castle'], [m.TREE_ARCH, 'castle'], [m.SHRINE, 'observatory'], [m.CLOCK, 'observatory'], [m.GANGWAY, 'pier'], [m.LANDING, 'far'], [m.RAY_ISLET, 'far']];
      for (const [p, id] of on) {
        const i = m.ISLANDS[id as keyof typeof m.ISLANDS];
        expect(m.islandAt(p.x, p.z), id).toBe(id);
        expect(Math.hypot(p.x - i.x, p.z - i.z), id).toBeLessThan(i.r - m.RAIL - 0.4);
      }
      for (const w of m.MILLS) expect(m.islandAt(w.x, w.z)).toBe('mills');
      expect(m.islandAt(m.CASTLE.x, m.CASTLE.z)).toBe('castle');
      expect(m.islandAt(m.OBSERVATORY.x, m.OBSERVATORY.z)).toBe('observatory');
      // the airship hangs off the pier, over the clouds
      expect(m.onGround(m.SHIP.x, m.SHIP.z)).toBe(false);
    });
  }

  it('at 1.6 a bridge takes 15-25 s at her top speed from middle to middle, as the document asks (docs/worlds/world-5.md «Время пути»)', async () => {
    const m = await mapAt(1.6);
    for (const p of m.PATHS) {
      const s = m.lineLength(p) / RUN;
      expect(s).toBeGreaterThanOrEqual(14);
      expect(s).toBeLessThanOrEqual(25);
    }
  });
});

describe('the edges of the islands are closed (the customer\'s decision 1 a, 2026-11-18)', () => {
  /** Walks a walker of radius 0.35 from `from` toward `to` in steps of 0.1 m, kept by `resolve`; where it ends. */
  const walk = async (from: P, to: P, given?: Awaited<ReturnType<typeof mapAt>>) => {
    const m = given ?? await mapAt(1.6);
    m.colliders.length = 0;
    const q = { ...from }, n = Math.ceil(Math.hypot(to.x - from.x, to.z - from.z) / 0.1);
    for (let i = 1; i <= n; i++) { q.x += (to.x - from.x) / n; q.z += (to.z - from.z) / n; m.resolve(q, 0.35); }
    return { q, m };
  };

  it('walking off an island she stops at its rail, on the island', async () => {
    const m = await mapAt(1.6);
    for (const [id, i] of Object.entries(m.ISLANDS)) {
      // straight out along a diagonal, where no bridge comes in
      const { q } = await walk({ x: i.x, z: i.z }, { x: i.x + i.r * 2, z: i.z + i.r * 1.6 });
      expect(m.islandAt(q.x, q.z), id).toBe(id);
      expect(Math.hypot(q.x - i.x, q.z - i.z), id).toBeLessThanOrEqual(i.r - m.RAIL - 0.35 + 1e-6);
    }
  });

  it('a bridge takes her across to the next island; stepping off its side she stays on its deck', async () => {
    const m = await mapAt(1.6);
    const { q } = await walk(m.ZONES.castle, m.ZONES.mills);
    expect(Math.hypot(q.x - m.ZONES.mills.x, q.z - m.ZONES.mills.z)).toBeLessThan(0.01);
    // from the middle of the castle-mills bridge straight north: she stays on the deck
    const mid = { x: (m.ZONES.castle.x + m.ZONES.mills.x) / 2, z: 0 };
    const side = await walk(mid, { x: mid.x, z: -20 });
    expect(side.m.bridgeAt(side.q.x, side.q.z)).toEqual(['castle', 'mills']);
    expect(Math.abs(side.q.z)).toBeLessThanOrEqual(m.BRIDGE_W / 2 - 0.35 + 1e-6);
  });

  it('the gap of the cloud bridge (WORLD-25): she stops at its edge until it is built, then walks across to the dragon island', async () => {
    const m = await mapAt(1.6);
    m.setCloudGap(false);
    const before = await walk(m.ZONES.castle, m.ZONES.dragon, m);
    const along = Math.hypot(before.q.x - m.ZONES.castle.x, before.q.z - m.ZONES.castle.z);
    expect(along).toBeLessThanOrEqual(m.CLOUD_GAP.from + 1e-6);
    expect(along).toBeGreaterThan(m.CLOUD_GAP.from - 1);
    // over the gap the deck's height holds, to the clouds beside it too: a hop onto a cloud never drops her
    const g = { x: m.ZONES.castle.x - (m.CLOUD_GAP.from + 5), z: m.CLOUD_GAP.half - 0.1 };
    expect(m.inCloudGap(g.x, g.z)).toBe(true);
    expect(m.height(g.x, g.z)).toBeGreaterThan(-1);
    m.setCloudGap(true);
    const after = await walk(m.ZONES.castle, m.ZONES.dragon, m);
    expect(Math.hypot(after.q.x - m.ZONES.dragon.x, after.q.z - m.ZONES.dragon.z)).toBeLessThan(0.01);
    m.setCloudGap(false);
  });

  it('the far islet is not reached on foot: from the pier toward it she stays on the pier', async () => {
    const m = await mapAt(1.6);
    const { q } = await walk(m.ZONES.pier, m.ZONES.far);
    expect(m.islandAt(q.x, q.z)).toBe('pier');
  });
});
