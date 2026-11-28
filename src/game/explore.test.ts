// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { defaultSave, worldState } from '../core/save';
import { WORLDS, loadWorlds } from '../worlds';
import type { ArtifactWorld } from './artifacts';
import { EXPLORE_SHARE, STAR_STEPS, exploreOf, fillExplore, fullyExplored, gatesArch, halfExplored, hasEasel, mysteryTotalOf, countMystery } from './explore';

// the worlds' code draws its sparkles on a canvas the page of the tests has not
vi.mock('./fx', () => ({ glowTex: null, Sparks: class {} }));

/**
 * The explorer's key (PLAY-36, ./explore.ts): the points of a world - its secrets, its whole sets, its easel, four
 * steps of the mysterious stars solved over the days - and the half that wakes the next arch.
 */
const shelf = WORLDS.filter((w) => w.shelf !== undefined);
const W: ArtifactWorld = { id: 'w', shelf: 0, secrets: ['a', 'b'], collect: { items: [...Array(6).fill({ kind: 'cone' }), ...Array(6).fill({ kind: 'berry' }), ...Array(4).fill({ kind: 'piece' })] } };

describe('the points of a world', () => {
  it('every world of the shelf: its points, the half, and the half reachable without the stars of a next day', () => {
    // the plan of 2026-11-28 (idea/proposal/explorer-key-2026-11-28/plan-B.md): secrets + sets + easel + 4 steps
    const want: Record<string, [number, number]> = { fairy: [12, 6], forest: [13, 7], sea: [12, 6], sweet: [13, 7], sky: [11, 6] };
    expect(shelf.map((w) => w.id).sort()).toEqual(Object.keys(want).sort());
    for (const w of shelf) {
      const e = exploreOf(defaultSave(), w);
      expect([e.of, e.need], w.id).toEqual(want[w.id]);
      expect(e.got, w.id).toBe(0);
      // in the first visit: every secret, set and the easel, and the ten stars of one day (two steps)
      expect(e.secrets.of + e.sets.of + e.easel.of + 2, w.id).toBeGreaterThanOrEqual(e.need);
      // without a single star too (the stars of the day may be few where she walks)
      expect(e.secrets.of + e.sets.of + e.easel.of, w.id).toBeGreaterThanOrEqual(e.need);
    }
  });

  it('every world of the shelf has an easel exactly when its finds have pieces, and places of mysterious stars', async () => {
    const defs = await loadWorlds();
    for (const w of shelf) {
      const d = defs.find((x) => x.id === w.id)!;
      expect(!!d.easel, w.id).toBe(hasEasel(w));
      expect(d.mystery?.spots.length ?? 0, w.id).toBeGreaterThan(0);
    }
  });

  it('counts each kind from the world\'s part of the save, and reads a world not played without creating it', () => {
    const s = defaultSave();
    expect(exploreOf(s, W)).toMatchObject({ got: 0, of: 2 + 2 + 1 + 4, need: Math.ceil(9 * EXPLORE_SHARE) });
    expect(s.worlds.w).toBeUndefined();
    const ws = worldState(s, 'w');
    ws.flags.a = true; ws.flags.zz = true;
    ws.found = [0, 1, 2, 3, 4, 5, 6, 12, 13, 14, 15];       // the cones whole, a berry, every piece (no set)
    ws.flags.easel = true;
    ws.mysteryTotal = 12;
    const e = exploreOf(s, W);
    expect([e.secrets, e.sets, e.easel, e.mystery]).toEqual([{ got: 1, of: 2 }, { got: 1, of: 2 }, { got: 1, of: 1 }, { got: 2, of: 4 }]);
    expect(e.got).toBe(5);
    expect(halfExplored(e)).toBe(true);
    expect(fullyExplored(e)).toBe(false);
  });

  it('the steps of the stars: 5, 10, 15, 20 solved', () => {
    expect(STAR_STEPS).toEqual([5, 10, 15, 20]);
    const s = defaultSave(), ws = worldState(s, 'w');
    for (const [n, got] of [[4, 0], [5, 1], [14, 2], [19, 3], [20, 4], [99, 4]]) { ws.mysteryTotal = n; expect(exploreOf(s, W).mystery.got, String(n)).toBe(got); }
  });

  it('a world without points: none to get, the half is got, never "explored whole"', () => {
    const none: ArtifactWorld = { id: 'n', shelf: 0 };
    const e = exploreOf(defaultSave(), { ...none });
    expect(e.of).toBe(STAR_STEPS.length);   // the stars count everywhere
    const bare = { ...e, of: 0, need: 0, got: 0 };
    expect(halfExplored(bare)).toBe(true);
    expect(fullyExplored(bare)).toBe(false);
  });
});

describe('the stars solved over the days (ws.mysteryTotal)', () => {
  it('kept, else today\'s solved (a save from before the key); a damaged count is today\'s', () => {
    const ws = worldState(defaultSave(), 'w');
    expect(mysteryTotalOf(ws)).toBe(0);
    ws.mystery = { day: '2026-11-28', solved: [1, 4] };
    expect(mysteryTotalOf(ws)).toBe(2);
    countMystery(ws);
    expect(ws.mysteryTotal).toBe(3);
    ws.mystery = { day: '2026-11-29', solved: [] };       // a new day: the count stays
    countMystery(ws);
    expect(ws.mysteryTotal).toBe(4);
    for (const bad of [-1, 1.5, 'x', null]) { (ws as unknown as { mysteryTotal: unknown }).mysteryTotal = bad; expect(mysteryTotalOf(ws)).toBe(0); }
  });
});

describe('fillExplore (?debug, the walkthrough)', () => {
  it('gives points in order until the share: secrets, sets, easel, stars; only adds', () => {
    const s = defaultSave();
    const half = fillExplore(s, W, 0.5);
    expect(half.got).toBe(5);
    expect(s.worlds.w.flags).toMatchObject({ a: true, b: true });
    expect(half.sets.got + half.easel.got + half.mystery.got).toBe(3);
    expect(fillExplore(s, W, 0.2).got).toBe(5);          // never takes away
    const all = fillExplore(s, W, 1);
    expect(fullyExplored(all)).toBe(true);
    expect(s.worlds.w.mysteryTotal).toBe(20);
  });
});

describe('gatesArch', () => {
  it('a world with a world on a later place of the shelf; the last place and a world off the shelf - none', () => {
    const ws: ArtifactWorld[] = [{ id: 'a', shelf: 0 }, { id: 'b', shelf: 2 }, { id: 'hub' }];
    expect(gatesArch(ws[0], ws)).toBe(true);
    expect(gatesArch(ws[1], ws)).toBe(false);
    expect(gatesArch(ws[2], ws)).toBe(false);
    expect(gatesArch(shelf.find((w) => w.id === 'sky')!, shelf)).toBe(false);
    expect(gatesArch(shelf.find((w) => w.id === 'sweet')!, shelf)).toBe(true);
  });
});
