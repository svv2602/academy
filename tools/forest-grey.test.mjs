import { describe, expect, it } from 'vitest';
import { BUDGET, MAGIC_PICTURES, lengthOf, overBudget, pathBetween, readArgs, routeLegs } from './forest-grey.mjs';

describe('tools/forest-grey.mjs: the walkthrough and the measurements of the grey forest (WORLD-12)', () => {
  it('reads its arguments', () => {
    expect(readArgs([]).scales).toEqual([1.6]);
    expect(readArgs(['--scales', '1,2', '--no-pass'])).toMatchObject({ scales: [1, 2], pass: false, measure: true });
    expect(readArgs(['--no-measure']).measure).toBe(false);
    expect(readArgs(['--scales', '9']).error).toMatch(/0\.5-3/);
    expect(readArgs(['--what']).error).toBe('unknown argument "--what"');
    expect(readArgs([]).q).toBe(2);
    expect(readArgs(['--q', '0']).q).toBe(0);
    expect(readArgs(['--q', '5']).error).toMatch(/0, 1 or 2/);
  });

  it('the legs of a route, each pair once, and the path between two zones either way round', () => {
    expect(routeLegs(['a', 'b', 'c', 'b', 'd'])).toEqual([['a', 'b'], ['b', 'c'], ['b', 'd']]);
    const zones = { a: { x: 0, z: 0 }, b: { x: 3, z: 4 } }, line = [zones.a, { x: 3, z: 0 }, zones.b];
    expect(pathBetween([line], zones, 'a', 'b')).toEqual(line);
    expect(pathBetween([line], zones, 'b', 'a')).toEqual([...line].reverse());
    expect(pathBetween([line], { ...zones, c: { x: 9, z: 9 } }, 'a', 'c')).toBeNull();
    expect(lengthOf(line)).toBe(7);
  });

  it('a point over the frame budget of q2 is named, by its triangles or its draw calls (WORLD-09: measured with the magic at 1)', () => {
    expect(BUDGET).toEqual({ tris: 600000, calls: 112 });
    const views = [{ from: 'a', to: 'b', calls: 112, tris: 600000 }, { from: 'b', to: 'c', calls: 113, tris: 1000 }];
    const tour = [{ point: 1, calls: 50, tris: 600001 }, { point: 2, calls: 10, tris: 10 }];
    expect(overBudget(views, tour).map((p) => p.at)).toEqual(['b -> c', 'tour 1']);
    expect(overBudget(views.slice(0, 1), tour.slice(1))).toEqual([]);
  });

  it('pictures the magic at 0 twice, at three leaves and at 1', () => {
    expect(MAGIC_PICTURES.map(([m]) => m)).toEqual([0, 0, 0.48, 1]);
    expect(new Set(MAGIC_PICTURES.map(([, n]) => n)).size).toBe(4);
  });
});

describe('--budget (the CI job "budget"): the draw of the points only', () => {
  it('leaves out the walkthrough and the way, keeps the measures', () => {
    expect(readArgs(['--budget'])).toMatchObject({ budget: true, pass: false, way: false, measure: true });
    expect(readArgs([])).toMatchObject({ budget: false, pass: true, way: true });
  });
});
