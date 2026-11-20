import { describe, expect, it } from 'vitest';
import { lengthOf, pathBetween, readArgs, routeLegs } from './forest-grey.mjs';

describe('tools/forest-grey.mjs: the walkthrough and the measurements of the grey forest (WORLD-12)', () => {
  it('reads its arguments', () => {
    expect(readArgs([]).scales).toEqual([1.6]);
    expect(readArgs(['--scales', '1,2', '--no-pass'])).toMatchObject({ scales: [1, 2], pass: false, measure: true });
    expect(readArgs(['--no-measure']).measure).toBe(false);
    expect(readArgs(['--scales', '9']).error).toMatch(/0\.5-3/);
    expect(readArgs(['--what']).error).toBe('unknown argument "--what"');
  });

  it('the legs of a route, each pair once, and the path between two zones either way round', () => {
    expect(routeLegs(['a', 'b', 'c', 'b', 'd'])).toEqual([['a', 'b'], ['b', 'c'], ['b', 'd']]);
    const zones = { a: { x: 0, z: 0 }, b: { x: 3, z: 4 } }, line = [zones.a, { x: 3, z: 0 }, zones.b];
    expect(pathBetween([line], zones, 'a', 'b')).toEqual(line);
    expect(pathBetween([line], zones, 'b', 'a')).toEqual([...line].reverse());
    expect(pathBetween([line], { ...zones, c: { x: 9, z: 9 } }, 'a', 'c')).toBeNull();
    expect(lengthOf(line)).toBe(7);
  });
});
