/** The ground of the forest (./terrain.ts): over the stream a bridge is the ground, she walks on it and not through the water. */
import { describe, expect, it } from 'vitest';
import { BRIDGE_BASE, BRIDGE_H, BRIDGE_L, DECK_SINK, DECK_TOP, WATER_Y, bridges, deckY, height } from './terrain';

describe('the bridges of the forest', () => {
  it('are the ground over the stream: above the water in their middle, nowhere else', () => {
    const all = bridges();
    expect(all).toHaveLength(2);
    for (const b of all) {
      const top = BRIDGE_BASE + BRIDGE_H * DECK_TOP - DECK_SINK;
      expect(deckY(b.x, b.z)).toBeCloseTo(top, 5);
      expect(height(b.x, b.z)).toBeCloseTo(top, 5);
      expect(height(b.x, b.z)).toBeGreaterThan(WATER_Y + 0.2);
      // flat over its middle: at a third of its half-length the same
      const ax0 = Math.sin(b.yaw), az0 = Math.cos(b.yaw);
      expect(deckY(b.x + ax0 * BRIDGE_L * 0.3, b.z + az0 * BRIDGE_L * 0.3)).toBeCloseTo(top, 5);
      // past its ends and off its sides: no deck
      const ax = Math.sin(b.yaw), az = Math.cos(b.yaw);
      expect(deckY(b.x + ax * (BRIDGE_L / 2 + 0.2), b.z + az * (BRIDGE_L / 2 + 0.2))).toBe(-Infinity);
      expect(deckY(b.x + az * 2, b.z - ax * 2)).toBe(-Infinity);
    }
    expect(deckY(0, 0)).toBe(-Infinity);
  });
});
