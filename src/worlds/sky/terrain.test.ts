import { describe, expect, it } from 'vitest';
import { BRIDGES, ISLANDS, ZONES } from './layout';
import { CLOUD_SEA, bridgeAt, height, islandAt, onGround } from './terrain';

describe('the ground of the Sky Islands, the grey build', () => {
  it('each island\'s top lies at its height, the sea of clouds far below everywhere else', () => {
    for (const [id, i] of Object.entries(ISLANDS)) {
      expect(Math.abs(height(i.x, i.z) - i.top), id).toBeLessThanOrEqual(0.4);   // its gentle relief
      expect(islandAt(i.x, i.z)).toBe(id);
      // a little past its edge, between the bridges: nothing to stand on
      const x = i.x + (i.r + 2) * Math.SQRT1_2, z = i.z + (i.r + 2) * Math.SQRT1_2;
      expect(onGround(x, z), id).toBe(false);
      expect(height(x, z), id).toBe(CLOUD_SEA);
    }
    expect(CLOUD_SEA).toBeLessThan(-15);
  });

  it('a bridge\'s deck runs between the tops of its two islands, never lower than a metre under the lower one', () => {
    for (const [a, b] of BRIDGES) {
      const A = ISLANDS[a], B = ISLANDS[b];
      for (let k = 1; k < 10; k++) {
        const x = A.x + ((B.x - A.x) * k) / 10, z = A.z + ((B.z - A.z) * k) / 10;
        expect(onGround(x, z), `${a}-${b} ${k}`).toBe(true);
        if (!islandAt(x, z)) {
          expect(bridgeAt(x, z)).toEqual([a, b]);
          expect(height(x, z)).toBeGreaterThan(Math.min(A.top, B.top) - 1);
          expect(height(x, z)).toBeLessThan(Math.max(A.top, B.top) + 0.5);
        }
      }
    }
    // the middles of the islands are the ends of the ways
    expect(Object.keys(ZONES)).toEqual(Object.keys(ISLANDS));
  });
});
